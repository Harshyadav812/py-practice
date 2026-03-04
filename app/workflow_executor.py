"""
Stateful per-run workflow executor.

Created fresh for every execution.  Receives a ``WorkflowGraph`` (pure
topology) and an optional ``CredentialLoader`` as dependencies.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections import deque
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlmodel import Session

from app.db import engine as db_engine
from app.models.execution import Execution, ExecutionStatus
from app.models.execution_node import ExecutionNode, NodeExecutionStatus
from app.node_handlers import get_handler
from app.tasks import resolve_all_variables

if TYPE_CHECKING:
    from app.credential_loader import CredentialLoader
    from app.schemas.nodes import Node
    from app.workflow_graph import WorkflowGraph

# A constant signal to represent a bypassed branch
SKIP_SIGNAL = "__SKIPPED_BRANCH__"

# Maximum number of node executions before aborting (DoS prevention)
MAX_EXECUTION_STEPS: int = 100

# Per-node execution timeout (seconds)
NODE_EXECUTION_TIMEOUT: int = 300

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Result type
# ------------------------------------------------------------------


@dataclass
class NodeResult:
    """Structured result returned by every node execution."""

    data: Any = None
    output_index: int = 0
    status: str = "success"  # "success" | "error" | "skipped" | "disabled"
    error: str | None = None
    is_from_cache: bool = False


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _is_error_result(data: Any) -> bool:
    """
    Detect a 'soft' error result from a node handler.

    A result is considered an error when the dict contains an ``"error"``
    key whose value is a non-empty string.
    """
    return (
        isinstance(data, dict)
        and "error" in data
        and isinstance(data["error"], str)
        and len(data["error"]) > 0
    )


# ------------------------------------------------------------------
# Executor
# ------------------------------------------------------------------


class WorkflowExecutor:
    """Run a workflow graph exactly once, producing SSE events."""

    def __init__(  # noqa: PLR0913
        self,
        graph: WorkflowGraph,
        credential_loader: CredentialLoader | None = None,
        workflow_id: UUID | None = None,
        user_id: UUID | None = None,
        prior_state: dict[str, ExecutionNode] | None = None,
        resume_from: str | None = None,
    ) -> None:
        self.graph = graph
        self.credential_loader = credential_loader
        self.workflow_id = workflow_id
        self.user_id = user_id
        self.prior_state = prior_state or {}
        self.resume_from = resume_from

        # Per-run mutable state
        self.execution_state: dict[str, Any] = {}
        self.queue: deque = deque()
        self.in_degree: dict[str, int] = dict(graph.in_degrees)
        self.input_buffer: dict[str, list] = {name: [] for name in graph.node_names}

        # Populated by _execute_workflow when it creates its own session
        self.session: Session | None = None

    # ------------------------------------------------------------------
    # Credential delegation (public API for node handlers)
    # ------------------------------------------------------------------

    def load_credential(self, credential_id: str) -> dict[str, Any]:
        """Public API used by node handlers to decrypt a credential."""
        if not self.credential_loader:
            msg = "Cannot load credentials: no credential loader configured"
            raise ValueError(msg)
        return self.credential_loader.load(credential_id)

    # ------------------------------------------------------------------
    # Single-node execution
    # ------------------------------------------------------------------

    async def execute_node(self, node_name: str, input_data: Any = None) -> NodeResult:
        node_obj: Node = self.graph.nodes[node_name]

        node_dict = node_obj.model_dump()
        clean_node = resolve_all_variables(self.execution_state, node_dict)
        clean_params = clean_node.get("parameters", {})

        # Inject decrypted credentials into parameters
        node_credentials = clean_node.get("credentials")
        if node_credentials and self.credential_loader:
            for _cred_type, cred_ref in node_credentials.items():  # noqa: PERF102
                cred_id = cred_ref.get("id") if isinstance(cred_ref, dict) else cred_ref
                if cred_id:
                    decrypted = self.load_credential(str(cred_id))
                    clean_params.update(decrypted)

        node_type = clean_node["type"]
        handler = get_handler(node_type)

        if handler is None:
            msg = f"Unsupported node type: '{node_type}'. No handler registered."
            raise ValueError(msg)

        result, output_index = await handler(clean_params, input_data, self)
        return NodeResult(data=result, output_index=output_index)

    # ------------------------------------------------------------------
    # Streaming entry point
    # ------------------------------------------------------------------

    async def run_stream(self) -> AsyncGenerator[str, None]:
        """
        Yield SSE events.

        Execution runs in a background ``asyncio.Task`` so it is completely
        independent of the HTTP connection lifecycle.
        """
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._loop_task = asyncio.create_task(self._execute_workflow(queue))
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
        except (asyncio.CancelledError, GeneratorExit):
            pass

    # ------------------------------------------------------------------
    # Main execution loop
    # ------------------------------------------------------------------

    async def _execute_workflow(  # noqa: C901, PLR0912, PLR0915
        self, queue: asyncio.Queue[str | None]
    ) -> None:
        """Background execution: run the full workflow and push events."""

        def emit(data: dict) -> None:
            queue.put_nowait(json.dumps(data) + "\n")

        execution_record = None

        with Session(db_engine) as session:
            self.session = session

            # Also update the credential loader's session so it uses the
            # independent session that outlives the HTTP request.
            if self.credential_loader:
                self.credential_loader.session = session

            try:
                start_node = self.graph.trigger_node_name
                if not start_node:
                    emit(
                        {
                            "type": "error",
                            "message": "Invalid Workflow: No trigger node found.",
                        }
                    )
                    return

                # Create execution record in DB
                if self.session and self.workflow_id and self.user_id:
                    execution_record = Execution(
                        workflow_id=self.workflow_id,
                        owner_id=self.user_id,
                        status=ExecutionStatus.RUNNING,
                        started_at=datetime.now(UTC),
                        state={},
                    )
                    self.session.add(execution_record)
                    self.session.commit()
                    self.session.refresh(execution_record)

                    emit(
                        {
                            "type": "execution_start",
                            "execution_id": str(execution_record.id),
                        }
                    )

                # ----- Seed the BFS queue -----
                if self.resume_from and self.prior_state:
                    self._seed_for_resume(self.resume_from)
                else:
                    self.input_buffer[start_node].append({})
                    self.queue.append((start_node, self.input_buffer[start_node]))

                steps_executed: int = 0

                while self.queue:
                    current_node_name, buffered_inputs = self.queue.popleft()

                    steps_executed += 1
                    if steps_executed > MAX_EXECUTION_STEPS:
                        emit(
                            {
                                "type": "error",
                                "message": (
                                    f"Workflow aborted: exceeded maximum of "
                                    f"{MAX_EXECUTION_STEPS} execution steps."
                                ),
                            }
                        )
                        return

                    # ---- Skipped node ----
                    is_skipped = all(i == SKIP_SIGNAL for i in buffered_inputs)
                    if is_skipped:
                        self.execution_state[current_node_name] = {"status": "skipped"}
                        if execution_record and self.session:
                            self.session.add(
                                ExecutionNode(
                                    execution_id=execution_record.id,
                                    node_name=current_node_name,
                                    status=NodeExecutionStatus.SKIPPED,
                                    started_at=datetime.now(UTC),
                                    finished_at=datetime.now(UTC),
                                )
                            )
                        for child in self.graph.get_all_children(current_node_name):
                            self.input_buffer[child].append(SKIP_SIGNAL)
                            if len(self.input_buffer[child]) == self.in_degree[child]:
                                self.queue.append((child, self.input_buffer[child]))
                        emit(
                            {
                                "type": "node_end",
                                "node": current_node_name,
                                "status": "skipped",
                                "result": {"status": "skipped"},
                                "input": None,
                            }
                        )
                        continue

                    # ---- Prepare input data ----
                    valid_inputs = [i for i in buffered_inputs if i != SKIP_SIGNAL]
                    node_obj = self.graph.nodes[current_node_name]
                    is_merge_node = "merge" in node_obj.type

                    if is_merge_node:
                        input_data = valid_inputs
                    else:
                        input_data = valid_inputs[0] if valid_inputs else {}

                    # ---- Disabled node ----
                    if node_obj.disabled:
                        self.execution_state[current_node_name] = input_data
                        if execution_record and self.session:
                            self.session.add(
                                ExecutionNode(
                                    execution_id=execution_record.id,
                                    node_name=current_node_name,
                                    status=NodeExecutionStatus.SKIPPED,
                                    input_data=input_data,
                                    output_data=input_data,
                                    output_index=0,
                                    started_at=datetime.now(UTC),
                                    finished_at=datetime.now(UTC),
                                )
                            )
                        emit(
                            {
                                "type": "node_end",
                                "node": current_node_name,
                                "status": "disabled",
                                "result": input_data,
                                "input": input_data,
                            }
                        )
                        # Pass through to children on output 0
                        for name in self.graph.get_children(current_node_name, 0):
                            self.input_buffer[name].append(input_data)
                            if len(self.input_buffer[name]) == self.in_degree[name]:
                                self.queue.append((name, self.input_buffer[name]))
                        # Skip non-active outputs
                        for name in self.graph.get_skipped_children(
                            current_node_name, 0
                        ):
                            self.input_buffer[name].append(SKIP_SIGNAL)
                            if len(self.input_buffer[name]) == self.in_degree[name]:
                                self.queue.append((name, self.input_buffer[name]))
                        continue

                    # ---- Prior-state fast path (cache hit) ----
                    prior_node = self.prior_state.get(current_node_name)
                    if (
                        prior_node
                        and prior_node.status == NodeExecutionStatus.SUCCESS
                        and current_node_name != self.resume_from
                    ):
                        self.execution_state[current_node_name] = prior_node.output_data
                        output_idx = prior_node.output_index or 0

                        if execution_record and self.session:
                            self.session.add(
                                ExecutionNode(
                                    execution_id=execution_record.id,
                                    node_name=current_node_name,
                                    status=prior_node.status,
                                    input_data=prior_node.input_data,
                                    output_data=prior_node.output_data,
                                    output_index=output_idx,
                                    started_at=datetime.now(UTC),
                                    finished_at=datetime.now(UTC),
                                )
                            )
                        emit(
                            {
                                "type": "node_end",
                                "node": current_node_name,
                                "status": "success",
                                "result": prior_node.output_data,
                                "input": prior_node.input_data,
                            }
                        )
                        self._enqueue_children(
                            current_node_name,
                            output_idx,
                            prior_node.output_data,
                        )
                        continue

                    # ---- Normal execution ----
                    node_record = None
                    if execution_record and self.session:
                        node_record = ExecutionNode(
                            execution_id=execution_record.id,
                            node_name=current_node_name,
                            status=NodeExecutionStatus.RUNNING,
                            input_data=input_data,
                            started_at=datetime.now(UTC),
                        )
                        self.session.add(node_record)

                    emit({"type": "node_start", "node": current_node_name})

                    # Brief visual delay for demo/UX purposes
                    # await asyncio.sleep(0.3)

                    try:
                        result = await asyncio.wait_for(
                            self.execute_node(current_node_name, input_data),
                            timeout=NODE_EXECUTION_TIMEOUT,
                        )

                        self.execution_state[current_node_name] = result.data
                        output_index = result.output_index

                        is_error = _is_error_result(result.data)
                        node_status = "error" if is_error else "success"

                        if node_record and self.session:
                            node_record.status = (
                                NodeExecutionStatus.ERROR
                                if is_error
                                else NodeExecutionStatus.SUCCESS
                            )
                            node_record.output_data = result.data
                            node_record.output_index = output_index
                            node_record.finished_at = datetime.now(UTC)

                        emit(
                            {
                                "type": "node_end",
                                "node": current_node_name,
                                "status": node_status,
                                "result": result.data,
                                "input": input_data,
                            }
                        )

                        self._enqueue_children(
                            current_node_name, output_index, result.data
                        )

                    except TimeoutError:
                        safe_error_msg = (
                            f"Node '{current_node_name}' timed out after "
                            f"{NODE_EXECUTION_TIMEOUT}s"
                        )
                        self._handle_node_failure(
                            current_node_name,
                            safe_error_msg,
                            input_data,
                            node_record,
                            emit,
                        )

                    except Exception as e:
                        logger.exception(
                            "Node '%s' failed during execution",
                            current_node_name,
                        )
                        if isinstance(e, (ValueError, KeyError, TypeError)):
                            safe_error_msg = str(e)
                        else:
                            safe_error_msg = (
                                f"Node '{current_node_name}' failed during execution"
                            )
                        self._handle_node_failure(
                            current_node_name,
                            safe_error_msg,
                            input_data,
                            node_record,
                            emit,
                        )

                emit(
                    {
                        "type": "workflow_end",
                        "status": ("failed" if self._has_errors() else "completed"),
                        "results": self.execution_state,
                    }
                )

            except Exception as e:
                logger.exception("Background workflow execution failed")
                with contextlib.suppress(Exception):
                    emit({"type": "error", "message": str(e)})

            finally:
                self._finalize_execution(execution_record)
                queue.put_nowait(None)

    # ------------------------------------------------------------------
    # Resume support
    # ------------------------------------------------------------------

    def _seed_for_resume(self, resume_node: str) -> None:
        """
        Pre-populate state from prior execution and seed *resume_node*.

        For every ancestor of ``resume_node`` that succeeded previously,
        we copy its cached output into ``execution_state`` so that downstream
        variable resolution (``$NodeName.property``) works correctly.

        The ``resume_node`` itself is NOT cached — it gets re-executed.
        """
        # Copy all successful ancestors into execution_state
        ancestors = set(self.graph.get_parent_nodes(resume_node))
        for name in ancestors:
            prior = self.prior_state.get(name)
            if prior and prior.status == NodeExecutionStatus.SUCCESS:
                self.execution_state[name] = prior.output_data

        # Seed the resume node's input buffer from its parents' cached output
        parents = self.graph.get_immediate_parents(resume_node)
        for parent_name in parents:
            prior = self.prior_state.get(parent_name)
            if prior and prior.status == NodeExecutionStatus.SUCCESS:
                self.input_buffer[resume_node].append(prior.output_data)

        # If no parent data was found (e.g. resume_node is the trigger),
        # seed with an empty dict
        if not self.input_buffer[resume_node]:
            self.input_buffer[resume_node].append({})

        # Adjust in_degree for the resume node so it fires immediately
        self.in_degree[resume_node] = len(self.input_buffer[resume_node])

        self.queue.append((resume_node, self.input_buffer[resume_node]))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _enqueue_children(
        self,
        node_name: str,
        output_index: int,
        result_data: Any,
    ) -> None:
        """Enqueue active children and mark skipped children."""
        for name in self.graph.get_children(node_name, output_index):
            self.input_buffer[name].append(result_data)
            if len(self.input_buffer[name]) == self.in_degree[name]:
                self.queue.append((name, self.input_buffer[name]))

        for name in self.graph.get_skipped_children(node_name, output_index):
            self.input_buffer[name].append(SKIP_SIGNAL)
            if len(self.input_buffer[name]) == self.in_degree[name]:
                self.queue.append((name, self.input_buffer[name]))

    def _handle_node_failure(
        self,
        node_name: str,
        error_msg: str,
        input_data: Any,
        node_record: ExecutionNode | None,
        emit,
    ) -> None:
        """Record a node failure and propagate SKIP to all children."""
        self.execution_state[node_name] = {"error": error_msg}

        if node_record and self.session:
            node_record.status = NodeExecutionStatus.ERROR
            node_record.error_message = error_msg
            node_record.finished_at = datetime.now(UTC)

        emit(
            {
                "type": "node_end",
                "node": node_name,
                "status": "error",
                "error": error_msg,
                "input": input_data,
            }
        )

        for child in self.graph.get_all_children(node_name):
            self.input_buffer[child].append(SKIP_SIGNAL)
            if len(self.input_buffer[child]) == self.in_degree[child]:
                self.queue.append((child, self.input_buffer[child]))

    def _finalize_execution(self, execution_record: Execution | None) -> None:
        """Finalize the execution record in the database."""
        # Mark unreached nodes
        executed = set(self.execution_state.keys())
        all_nodes = self.graph.node_names
        for name in all_nodes - executed:
            self.execution_state[name] = {"error": "Node never executed"}

        has_error = self._has_errors()

        if execution_record and self.session:
            execution_record.status = (
                ExecutionStatus.FAILED if has_error else ExecutionStatus.COMPLETED
            )
            execution_record.state = self.execution_state
            execution_record.finished_at = datetime.now(UTC)

            self.session.add(execution_record)
            try:
                self.session.commit()
            except Exception:
                logger.exception(
                    "Failed to commit execution record during finalization"
                )

    def _has_errors(self) -> bool:
        return any(_is_error_result(res) for res in self.execution_state.values())

    async def run(self) -> dict[str, Any]:
        """Convenience wrapper: consume the stream and return final state."""
        final_state: dict[str, Any] = {}
        async for chunk in self.run_stream():
            data = json.loads(chunk.strip())
            if data["type"] == "workflow_end":
                final_state = data["results"]
        return final_state

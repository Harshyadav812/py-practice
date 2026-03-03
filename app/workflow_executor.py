"""Stateful per-run execution engine.

A new ``WorkflowExecutor`` is created for every workflow execution.
It receives an immutable ``WorkflowGraph`` as a dependency and holds all
per-run state (queue, input buffers, execution results).
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlmodel import Session

from app.models.execution import Execution, ExecutionStatus
from app.models.execution_node import ExecutionNode, NodeExecutionStatus
from app.node_handlers import get_handler
from app.tasks import resolve_all_variables
from app.workflow_graph import WorkflowGraph

# A constant signal to represent a bypassed branch
SKIP_SIGNAL = "__SKIPPED_BRANCH__"

# Maximum number of node executions before aborting (DoS prevention)
MAX_EXECUTION_STEPS: int = 100

# Per-node execution timeout in seconds
NODE_EXECUTION_TIMEOUT: int = 300

logger = logging.getLogger(__name__)


@dataclass
class NodeResult:
    data: Any = None
    output_index: int = 0
    status: str = "success"  # "success" | "error" | "skipped"
    error: str | None = None
    is_from_cache: bool = False


def _is_error_result(data: Any) -> bool:
    """Check if result data represents a soft error."""
    return (
        isinstance(data, dict)
        and "error" in data
        and isinstance(data["error"], str)
        and len(data["error"]) > 0
    )


class WorkflowExecutor:
    """Stateful per-run execution engine. Created fresh for every execution."""

    def __init__(
        self,
        graph: WorkflowGraph,
        credential_loader=None,
        prior_state: dict[str, ExecutionNode] | None = None,
        resume_from: str | None = None,
        workflow_id: UUID | None = None,
        user_id: UUID | None = None,
    ) -> None:
        self.graph = graph
        self.credential_loader = credential_loader
        self.prior_state = prior_state or {}
        self.resume_from = resume_from
        self.workflow_id = workflow_id
        self.user_id = user_id

        # Per-run mutable state
        self.execution_state: dict[str, Any] = {}
        self.queue: deque = deque()
        self.input_buffer: dict[str, list] = {name: [] for name in graph.node_names}

    # ------------------------------------------------------------------
    # Credential access (delegates to CredentialLoader)
    # ------------------------------------------------------------------

    def load_credential(self, credential_id: str) -> dict[str, Any]:
        """Load a credential. Raises if no loader is available."""
        if self.credential_loader is None:
            raise ValueError("Cannot load credentials: no database session provided")
        return self.credential_loader.load(credential_id)

    # ------------------------------------------------------------------
    # Node execution
    # ------------------------------------------------------------------

    async def execute_node(self, node_name: str, input_data: Any = None) -> dict[str, Any]:
        node_obj = self.graph.get_node(node_name)
        if node_obj is None:
            raise ValueError(f"Node '{node_name}' not found in graph")

        if node_obj.disabled:
            return {"result": input_data, "output_index": 0}

        node_dict = node_obj.model_dump()
        clean_node = resolve_all_variables(self.execution_state, node_dict)
        clean_params = clean_node.get("parameters", {})

        # Inject decrypted credentials into parameters if the node references any
        node_credentials = clean_node.get("credentials")
        if node_credentials and self.credential_loader:
            for _cred_type, cred_ref in node_credentials.items():
                # n8n format: {"openAiApi": {"id": "cred-uuid", "name": "My Key"}}
                cred_id = cred_ref.get("id") if isinstance(cred_ref, dict) else cred_ref
                if cred_id:
                    decrypted = self.load_credential(str(cred_id))
                    clean_params.update(decrypted)

        node_type = clean_node["type"]

        handler = get_handler(node_type)
        if handler is None:
            raise ValueError(
                f"Unsupported node type: '{node_type}'. No handler registered."
            )

        async def _run():
            return await handler(clean_params, input_data, self)

        result_data, output_index = await asyncio.wait_for(
            _run(), timeout=NODE_EXECUTION_TIMEOUT
        )

        return {"result": result_data, "output_index": output_index}

    # ------------------------------------------------------------------
    # Streaming execution
    # ------------------------------------------------------------------

    def run_stream(self) -> AsyncGenerator[str, None]:
        """Run the workflow and stream events as NDJSON."""
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        asyncio.create_task(self._execute_workflow(queue))

        async def _generator():
            try:
                while True:
                    event = await queue.get()
                    if event is None:
                        break
                    yield event
            except (asyncio.CancelledError, GeneratorExit):
                pass

        return _generator()

    async def run(self) -> dict[str, Any]:
        """Convenience wrapper: consumes the stream and returns final state."""
        final_state: dict[str, Any] = {}
        async for chunk in self.run_stream():
            data = json.loads(chunk.strip())
            if data["type"] == "workflow_end":
                final_state = data["results"]
        return final_state

    # ------------------------------------------------------------------
    # Internal execution loop
    # ------------------------------------------------------------------

    async def _execute_workflow(  # noqa: C901, PLR0912
        self,
        queue: asyncio.Queue[str | None],
    ) -> None:
        """Background execution: run the full workflow and push events to *queue*.

        Creates its own DB session so execution is independent of the HTTP
        request lifecycle. If the client disconnects, this task keeps running
        until all nodes are processed.
        """
        from app.credential_loader import CredentialLoader
        from app.db import engine as db_engine

        def emit(data: dict) -> None:
            queue.put_nowait(json.dumps(data) + "\n")

        execution_record = None
        in_degree = dict(self.graph.in_degrees)  # mutable copy for this run

        with Session(db_engine) as session:
            # Recreate credential loader with the independent session
            if self.user_id is not None:
                self.credential_loader = CredentialLoader(session, self.user_id)

            try:
                trigger_node = self.graph.trigger_node_name
                if not trigger_node:
                    emit({"type": "error", "message": "Invalid Workflow: No trigger node found."})
                    return

                if self.workflow_id and self.user_id:
                    execution_record = Execution(
                        workflow_id=self.workflow_id,
                        owner_id=self.user_id,
                        status=ExecutionStatus.RUNNING,
                        started_at=datetime.now(UTC),
                        state={},
                    )
                    session.add(execution_record)
                    session.commit()
                    session.refresh(execution_record)
                    emit({"type": "execution_start", "execution_id": str(execution_record.id)})

                # Determine start point: normal start or smart resume
                if self.resume_from:
                    # Smart resume: seed from immediate parents' cached output
                    immediate_parents = self.graph.get_immediate_parents(self.resume_from)

                    # Pre-populate execution_state with all upstream cached results
                    for ancestor in self.graph.get_parent_nodes(self.resume_from):
                        prior = self.prior_state.get(ancestor)
                        if prior and prior.status == NodeExecutionStatus.SUCCESS:
                            self.execution_state[ancestor] = prior.output_data

                    # Seed the resume_from node's input buffer from immediate parents
                    for parent in immediate_parents:
                        prior = self.prior_state.get(parent)
                        if prior and prior.status == NodeExecutionStatus.SUCCESS:
                            self.execution_state[parent] = prior.output_data
                            self.input_buffer[self.resume_from].append(prior.output_data)

                    # If no parent data found, seed with empty dict so it still runs
                    if not self.input_buffer[self.resume_from]:
                        self.input_buffer[self.resume_from].append({})

                    # Adjust in_degree so resume_from fires immediately
                    in_degree[self.resume_from] = len(self.input_buffer[self.resume_from])
                    self.queue.append((self.resume_from, self.input_buffer[self.resume_from]))
                else:
                    # Normal start: begin from trigger node
                    self.input_buffer[trigger_node].append({})
                    self.queue.append((trigger_node, self.input_buffer[trigger_node]))

                steps_executed: int = 0

                while self.queue:
                    current_node_name, buffered_inputs = self.queue.popleft()

                    steps_executed += 1
                    if steps_executed > MAX_EXECUTION_STEPS:
                        emit({
                            "type": "error",
                            "message": f"Workflow aborted: exceeded maximum of {MAX_EXECUTION_STEPS} execution steps.",
                        })
                        return

                    is_skipped = all(i == SKIP_SIGNAL for i in buffered_inputs)
                    if is_skipped:
                        self.execution_state[current_node_name] = {"status": "skipped"}
                        if execution_record:
                            skip_record = ExecutionNode(
                                execution_id=execution_record.id,
                                node_name=current_node_name,
                                status=NodeExecutionStatus.SKIPPED,
                                started_at=datetime.now(UTC),
                                finished_at=datetime.now(UTC),
                            )
                            session.add(skip_record)

                        for child in self.graph.get_all_children(current_node_name):
                            self.input_buffer[child].append(SKIP_SIGNAL)
                            if len(self.input_buffer[child]) == in_degree[child]:
                                self.queue.append((child, self.input_buffer[child]))

                        emit({"type": "node_end", "node": current_node_name, "status": "skipped", "result": {"status": "skipped"}, "input": None})
                        continue

                    valid_inputs = [i for i in buffered_inputs if i != SKIP_SIGNAL]
                    node_obj = self.graph.get_node(current_node_name)
                    node_type = node_obj.type if node_obj else ""
                    is_merge_node = "merge" in node_type

                    if is_merge_node:
                        input_data = valid_inputs
                    else:
                        input_data = valid_inputs[0] if valid_inputs else {}

                    # Check disabled BEFORE prior_state fast-path
                    if node_obj and node_obj.disabled:
                        self.execution_state[current_node_name] = input_data
                        emit({"type": "node_end", "node": current_node_name, "status": "disabled", "result": input_data, "input": input_data})
                        for name in self.graph.get_children(current_node_name, 0):
                            self.input_buffer[name].append(input_data)
                            if len(self.input_buffer[name]) == in_degree[name]:
                                self.queue.append((name, self.input_buffer[name]))
                        continue

                    prior_node = self.prior_state.get(current_node_name) if self.prior_state else None

                    if prior_node and prior_node.status == NodeExecutionStatus.SUCCESS:
                        # FAST PATH: already succeeded in a prior run
                        self.execution_state[current_node_name] = prior_node.output_data
                        output_idx = prior_node.output_index or 0

                        if execution_record:
                            node_record = ExecutionNode(
                                execution_id=execution_record.id,
                                node_name=current_node_name,
                                status=prior_node.status,
                                input_data=prior_node.input_data,
                                output_data=prior_node.output_data,
                                output_index=output_idx,
                                started_at=datetime.now(UTC),
                                finished_at=datetime.now(UTC),
                            )
                            session.add(node_record)

                        emit({"type": "node_end", "node": current_node_name, "status": "success", "result": prior_node.output_data, "input": prior_node.input_data})

                        active_nodes = self.graph.get_children(current_node_name, output_idx)
                        for name in active_nodes:
                            self.input_buffer[name].append(prior_node.output_data)
                            if len(self.input_buffer[name]) == in_degree[name]:
                                self.queue.append((name, self.input_buffer[name]))

                        skipped_nodes = self.graph.get_skipped_children(current_node_name, output_idx)
                        for name in skipped_nodes:
                            self.input_buffer[name].append(SKIP_SIGNAL)
                            if len(self.input_buffer[name]) == in_degree[name]:
                                self.queue.append((name, self.input_buffer[name]))

                        continue

                    # Normal execution
                    node_record = None
                    if execution_record:
                        node_record = ExecutionNode(
                            execution_id=execution_record.id,
                            node_name=current_node_name,
                            status=NodeExecutionStatus.RUNNING,
                            input_data=input_data,
                            started_at=datetime.now(UTC),
                        )
                        session.add(node_record)

                    emit({"type": "node_start", "node": current_node_name})
                    await asyncio.sleep(0.3)

                    try:
                        execution_result = await self.execute_node(current_node_name, input_data)
                        self.execution_state[current_node_name] = execution_result["result"]
                        output_index = execution_result["output_index"]

                        result_data = execution_result["result"]
                        is_error = _is_error_result(result_data)
                        node_status = "error" if is_error else "success"

                        if node_record:
                            node_record.status = NodeExecutionStatus.ERROR if is_error else NodeExecutionStatus.SUCCESS
                            node_record.output_data = result_data
                            node_record.output_index = output_index
                            node_record.finished_at = datetime.now(UTC)

                        emit({"type": "node_end", "node": current_node_name, "status": node_status, "result": result_data, "input": input_data})

                        active_nodes = self.graph.get_children(current_node_name, output_index)
                        for name in active_nodes:
                            self.input_buffer[name].append(execution_result["result"])
                            if len(self.input_buffer[name]) == in_degree[name]:
                                self.queue.append((name, self.input_buffer[name]))

                        skipped_nodes = self.graph.get_skipped_children(current_node_name, output_index)
                        for name in skipped_nodes:
                            self.input_buffer[name].append(SKIP_SIGNAL)
                            if len(self.input_buffer[name]) == in_degree[name]:
                                self.queue.append((name, self.input_buffer[name]))

                    except asyncio.TimeoutError:
                        safe_error_msg = f"Node '{current_node_name}' timed out after {NODE_EXECUTION_TIMEOUT}s"
                        logger.error(safe_error_msg)
                        self.execution_state[current_node_name] = {"error": safe_error_msg}

                        if node_record:
                            node_record.status = NodeExecutionStatus.ERROR
                            node_record.error_message = safe_error_msg
                            node_record.finished_at = datetime.now(UTC)

                        emit({"type": "node_end", "node": current_node_name, "status": "error", "error": safe_error_msg, "input": input_data})

                        for child in self.graph.get_all_children(current_node_name):
                            self.input_buffer[child].append(SKIP_SIGNAL)
                            if len(self.input_buffer[child]) == in_degree[child]:
                                self.queue.append((child, self.input_buffer[child]))

                    except Exception as e:
                        logger.exception("Node '%s' failed during execution", current_node_name)
                        if isinstance(e, (ValueError, KeyError, TypeError)):
                            safe_error_msg = str(e)
                        else:
                            safe_error_msg = f"Node '{current_node_name}' failed during execution"
                        self.execution_state[current_node_name] = {"error": safe_error_msg}

                        if node_record:
                            node_record.status = NodeExecutionStatus.ERROR
                            node_record.error_message = safe_error_msg
                            node_record.finished_at = datetime.now(UTC)

                        emit({"type": "node_end", "node": current_node_name, "status": "error", "error": safe_error_msg, "input": input_data})

                        for child in self.graph.get_all_children(current_node_name):
                            self.input_buffer[child].append(SKIP_SIGNAL)
                            if len(self.input_buffer[child]) == in_degree[child]:
                                self.queue.append((child, self.input_buffer[child]))

                emit({
                    "type": "workflow_end",
                    "status": "failed" if self._has_errors() else "completed",
                    "results": self.execution_state,
                })

            except Exception as e:
                logger.exception("Background workflow execution failed")
                try:
                    emit({"type": "error", "message": str(e)})
                except Exception:
                    pass

            finally:
                self._finalize_execution(execution_record, session)
                queue.put_nowait(None)

    def _finalize_execution(
        self,
        execution_record: Execution | None,
        session: Session | None = None,
    ) -> None:
        """Finalize the execution record in the database."""
        executed_nodes = set(self.execution_state.keys())
        all_nodes = self.graph.node_names
        stuck_nodes = all_nodes - executed_nodes
        for name in stuck_nodes:
            self.execution_state[name] = {"error": "Node never executed"}

        has_error = self._has_errors()

        if execution_record and session:
            execution_record.status = ExecutionStatus.FAILED if has_error else ExecutionStatus.COMPLETED
            execution_record.state = self.execution_state
            execution_record.finished_at = datetime.now(UTC)
            session.add(execution_record)
            try:
                session.commit()
            except Exception:
                logger.exception("Failed to commit execution record during finalization")

    def _has_errors(self) -> bool:
        return any(isinstance(res, dict) and "error" in res for res in self.execution_state.values())

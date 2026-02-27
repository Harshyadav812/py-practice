import asyncio
import json
import logging
from collections import deque
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlmodel import Session

from app.models.credentials import Credential
from app.models.execution import Execution, ExecutionStatus
from app.models.execution_node import ExecutionNode, NodeExecutionStatus
from app.node_handlers import get_handler
from app.schemas.nodes import ConnectionTarget, Node, WorkflowPayload
from app.services.cipher import CipherService
from app.tasks import resolve_all_variables

# A constant signal to represent a bypassed branch
SKIP_SIGNAL = "__SKIPPED_BRANCH__"

# Maximum number of node executions before aborting (DoS prevention)
MAX_EXECUTION_STEPS = 100

logger = logging.getLogger(__name__)


class WorkflowEngine:
    def __init__(
        self,
        workflow: WorkflowPayload,
        session: Session | None = None,
        user_id: UUID | None = None,
        workflow_id: UUID | None = None,
    ):
        self.workflow: WorkflowPayload = workflow
        self.node_map: dict[str, Node] = workflow.nodes_by_names
        self.execution_state: dict[str, Any] = {}

        # DB access for credential decryption (optional for backward compatibility)
        self.session = session
        self.user_id = user_id
        self.workflow_id = workflow_id
        self.cipher = CipherService() if session else None

        # Queue stores tuples: (node_name, input_data)
        self.queue: deque = deque()

        # Identify the start node (any trigger type)
        trigger_types = {"manual_trigger", "manualtrigger", "webhook"}
        self.start_node_name = next(
            (
                node.name
                for node in self.workflow.nodes
                if node.type.lower() in trigger_types
                or any(t in node.type.lower() for t in trigger_types)
            ),
            None,
        )

        if not self.start_node_name:
            raise ValueError(
                "Invalid Workflow: No trigger node found (manual_trigger or webhook)."
            )

        # Calculate In-Degrees (how many incoming connections each node has)
        self.in_degree = {node.name: 0 for node in self.workflow.nodes}

        for node_name, connections in self.workflow.connections.items():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        if target.node in self.in_degree:
                            self.in_degree[target.node] += 1

        # The start node needs 1 "virtual" input to trigger the execution loop
        self.in_degree[self.start_node_name] = 1

        # Buffer to hold incoming data from parent nodes until in_degree is met
        self.input_buffer: dict[str, list] = {
            node.name: [] for node in self.workflow.nodes
        }

        # Cycle detection — abort before execution if graph has cycles
        self._detect_cycles()

    def get_next_nodes(self, node_name: str, output_index: int = 0) -> list[str]:
        """Get active children for the selected output index."""
        if node_name not in self.workflow.connections:
            return []

        connections_data: dict[str, list[list[ConnectionTarget]]] = (
            self.workflow.connections[node_name]
        )

        if "main" not in connections_data:
            return []

        if output_index < len(connections_data["main"]):
            destination_nodes_list = connections_data["main"][output_index]
            # next_nodes = destination_nodes_list[output_index]
            return [target.node for target in destination_nodes_list]
        return []

    def _detect_cycles(self) -> None:  # noqa: C901
        """Detect cycles in the workflow graph using DFS with coloring."""
        # Build adjacency list
        adjacency: dict[str, list[str]] = {
            node.name: [] for node in self.workflow.nodes
        }
        for node_name, connections in self.workflow.connections.items():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        if node_name in adjacency:
                            adjacency[node_name].append(target.node)

        # DFS with 3-color marking: white=unvisited, gray=in-progress, black=done
        white, gray, black = 0, 1, 2
        color = dict.fromkeys(adjacency, white)

        def dfs(node: str) -> str | None:
            color[node] = gray
            for neighbor in adjacency.get(node, []):
                if color.get(neighbor) == gray:
                    return neighbor  # Cycle found!
                if color.get(neighbor) == white:
                    cycle_node = dfs(neighbor)
                    if cycle_node is not None:
                        return cycle_node
            color[node] = black
            return None

        for node_name in adjacency:
            if color[node_name] == white:
                cycle_node = dfs(node_name)
                if cycle_node is not None:
                    msg = f"Invalid workflow: cycle detected involving node '{cycle_node}'. Remove circular connections."
                    raise ValueError(msg)

    def get_skipped_nodes(self, node_name: str, active_output_index: int) -> list[str]:
        """Get all children connected to unselected output paths (for IF/Switch nodes)."""
        if node_name not in self.workflow.connections:
            return []

        connections_data = self.workflow.connections[node_name]

        if "main" not in connections_data:
            return []

        skipped = []
        for i, destination_nodes_list in enumerate(connections_data["main"]):
            if i != active_output_index:
                for target in destination_nodes_list:
                    skipped.append(target.node)

        return skipped

    def get_all_children(self, node_name: str) -> list[str]:
        """Get all children across all output paths(used when propagating skips)."""
        if node_name not in self.workflow.connections:
            return []

        connections_data = self.workflow.connections[node_name]

        if "main" not in connections_data:
            return []

        children = []
        for destination_nodes_list in connections_data["main"]:
            for target in destination_nodes_list:
                children.append(target.node)

        return children

    def _load_credential(self, credential_id: str) -> dict[str, Any]:
        """Fetch a credential from DB, verify ownership, and decrypt it."""
        if not self.session or not self.user_id or not self.cipher:
            msg = "Cannot load credentials: no database session provided"
            raise ValueError(msg)

        cred = self.session.get(Credential, UUID(credential_id))

        if not cred or cred.owner_id != self.user_id:
            msg = f"Credential '{credential_id}' not found or access denied"
            raise ValueError(msg)

        decrypted_json = self.cipher.decrypt(cred.encrypted_data)
        return json.loads(decrypted_json)

    async def execute_node(self, node_name: str, input_data: Any = None):
        node_obj: Node = self.node_map[node_name]

        if node_obj.disabled:
            return {"result": input_data, "output_index": 0}

        node_dict = node_obj.model_dump()

        clean_node = resolve_all_variables(self.execution_state, node_dict)
        clean_params = clean_node.get("parameters", {})

        # Inject decrypted credentials into parameters if the node references any
        node_credentials = clean_node.get("credentials")
        if node_credentials and self.session:
            for _cred_type, cred_ref in node_credentials.items():
                # n8n format: {"openAiApi": {"id": "cred-uuid", "name": "My Key"}}
                cred_id = cred_ref.get("id") if isinstance(cred_ref, dict) else cred_ref
                if cred_id:
                    decrypted = self._load_credential(str(cred_id))
                    clean_params.update(decrypted)

        node_type = clean_node["type"]

        handler = get_handler(node_type)

        if handler:
            result, output_index = await handler(clean_params, input_data, self)

            return {"result": result, "output_index": output_index}

        msg = f"Unknown task type: {node_type}"
        raise ValueError(msg)

    async def run_stream(self) -> AsyncGenerator[str, None]:  # noqa: C901, PLR0912
        if not self.start_node_name:
            yield (
                json.dumps(
                    {
                        "type": "error",
                        "message": "Invalid Workflow: No 'manual_trigger' node found.",
                    }
                )
                + "\n"
            )
            return

        execution_record = None
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

        self.input_buffer[self.start_node_name].append({})
        self.queue.append(
            (self.start_node_name, self.input_buffer[self.start_node_name])
        )

        steps_executed = 0

        while self.queue:
            current_node_name, buffered_inputs = self.queue.popleft()

            # Execution step limit to prevent DoS
            steps_executed += 1
            if steps_executed > MAX_EXECUTION_STEPS:
                yield (
                    json.dumps(
                        {
                            "type": "error",
                            "message": f"Workflow aborted: exceeded maximum of {MAX_EXECUTION_STEPS} execution steps.",
                        }
                    )
                    + "\n"
                )
                return

            # Send node start event
            yield json.dumps({"type": "node_start", "node": current_node_name}) + "\n"

            # Brief visual delay for demo purposes (half a second)
            await asyncio.sleep(0.5)

            is_skipped = all(i == SKIP_SIGNAL for i in buffered_inputs)
            if is_skipped:
                self.execution_state[current_node_name] = {"status": "skipped"}
                for child in self.get_all_children(current_node_name):
                    self.input_buffer[child].append(SKIP_SIGNAL)
                    if len(self.input_buffer[child]) == self.in_degree[child]:
                        self.queue.append((child, self.input_buffer[child]))
                continue

            valid_inputs = [i for i in buffered_inputs if i != SKIP_SIGNAL]
            node_type = self.node_map[current_node_name].type
            is_merge_node = "merge" in node_type

            if is_merge_node:
                input_data = valid_inputs
            else:
                input_data = valid_inputs[0] if valid_inputs else {}

            # Create the NODE RECORD before execution
            node_record = None
            if execution_record and self.session:
                node_record = ExecutionNode(
                    execution_id=execution_record.id,
                    node_name=current_node_name,
                    status=NodeExecutionStatus.RUNNING,
                    input_data=input_data,
                    stated_at=datetime.now(UTC),
                )
                self.session.add(node_record)
                self.session.commit()
                self.session.refresh(node_record)

            try:
                execution_result = await self.execute_node(
                    current_node_name, input_data
                )
                self.execution_state[current_node_name] = execution_result["result"]
                output_index = execution_result["output_index"]

                # Detect "soft" errors
                result_data = execution_result["result"]
                is_error_result = (
                    isinstance(result_data, dict)
                    and "error" in result_data
                    and len(result_data) <= 3  # noqa: PLR2004
                )

                node_status = "error" if is_error_result else "success"

                # UPDATE NODE RECORD AFTER SUCCESS
                if node_record and self.session:
                    node_record.status = (
                        NodeExecutionStatus.ERROR
                        if is_error_result
                        else NodeExecutionStatus.SUCCESS
                    )
                    node_record.output_data = result_data
                    node_record.finished_at = datetime.now(UTC)
                    self.session.add(node_record)
                    self.session.commit()

                # Send node end event with partial result
                yield (
                    json.dumps(
                        {
                            "type": "node_end",
                            "node": current_node_name,
                            "status": node_status,
                            "result": result_data,
                        }
                    )
                    + "\n"
                )

                active_nodes = self.get_next_nodes(current_node_name, output_index)
                for name in active_nodes:
                    self.input_buffer[name].append(execution_result["result"])
                    if len(self.input_buffer[name]) == self.in_degree[name]:
                        self.queue.append((name, self.input_buffer[name]))

                skipped_nodes = self.get_skipped_nodes(current_node_name, output_index)
                for name in skipped_nodes:
                    self.input_buffer[name].append(SKIP_SIGNAL)
                    if len(self.input_buffer[name]) == self.in_degree[name]:
                        self.queue.append((name, self.input_buffer[name]))

            except Exception as e:
                # User-caused errors (ValueError, KeyError) → show actual message
                # Internal errors → sanitize to prevent leaking internals
                logger.exception("Node '%s' failed during execution", current_node_name)
                if isinstance(e, (ValueError, KeyError, TypeError)):
                    safe_error_msg = str(e)
                else:
                    safe_error_msg = (
                        f"Node '{current_node_name}' failed during execution"
                    )
                self.execution_state[current_node_name] = {"error": safe_error_msg}

                # UPDATE NODE RECORD AFTER CRASH
                if node_record and self.session:
                    node_record.status = NodeExecutionStatus.ERROR
                    node_record.error_message = safe_error_msg
                    node_record.finished_at = datetime.now(UTC)
                    self.session.add(node_record)
                    self.session.commit()

                yield (
                    json.dumps(
                        {
                            "type": "node_end",
                            "node": current_node_name,
                            "status": "error",
                            "error": safe_error_msg,
                        }
                    )
                    + "\n"
                )

                for child in self.get_all_children(current_node_name):
                    self.input_buffer[child].append(SKIP_SIGNAL)
                    if len(self.input_buffer[child]) == self.in_degree[child]:
                        self.queue.append((child, self.input_buffer[child]))

        executed_nodes = set(self.execution_state.keys())
        all_nodes = set(self.node_map.keys())
        stuck_nodes = all_nodes - executed_nodes
        if stuck_nodes:
            for name in stuck_nodes:
                self.execution_state[name] = {"error": "Node never executed"}

        # FINALIZE THE MASTER EXECUTION RECORD
        if execution_record and self.session:
            # check if any node in the final state contains an error
            has_error = any(
                isinstance(res, dict) and "error" in res
                for res in self.execution_state.values()
            )
            execution_record.status = (
                ExecutionStatus.FAILED if has_error else ExecutionStatus.COMPLETED
            )
            execution_record.state = self.execution_state
            execution_record.finished_at = datetime.now(UTC)

            self.session.add(execution_record)
            self.session.commit()

        yield (
            json.dumps({"type": "workflow_end", "results": self.execution_state}) + "\n"
        )

    async def run(self) -> dict[str, Any]:
        """
        Convenience wrapper around run_stream() for programmatic execution.

        Consumes the stream and returns the final execution state.
        """
        final_state = {}
        async for chunk in self.run_stream():
            data = json.loads(chunk.strip())
            if data["type"] == "workflow_end":
                final_state = data["results"]

        return final_state

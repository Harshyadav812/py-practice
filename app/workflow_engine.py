from collections import deque
from typing import Any

import httpx

from app.node_handlers import N8N_TYPE_MAPPING, SIMPLE_HANDLERS, get_handler
from app.schemas.nodes import ConnectionTarget, Node, WorkflowPayload
from app.tasks import resolve_all_variables

# A constant signal to represent a bypassed branch
SKIP_SIGNAL = "__SKIPPED_BRANCH__"


class WorkflowEngine:
    def __init__(self, workflow: WorkflowPayload):
        self.workflow: WorkflowPayload = workflow
        self.node_map: dict[str, Node] = workflow.nodes_by_names
        self.execution_state: dict[str, Any] = {}

        # Queue stores tuples: (node_name, input_data)
        self.queue: deque = deque()

        # Identify the start node
        self.start_node_name = next(
            (
                node.name
                for node in self.workflow.nodes
                if "manual_trigger" in node.type
            ),
            None,
        )

        if not self.start_node_name:
            raise ValueError("Invalid Workflow: No 'manual_trigger' node found.")

        # Calculate In-Degrees (how many incoming connections each node has)
        self.in_degree = {node.name: 0 for node in self.workflow.nodes}

        for node_name, connections in self.workflow.connections.items():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        self.in_degree[target.node] += 1

        # The start node needs 1 "virtual" input to trigger the execution loop
        self.in_degree[self.start_node_name] = 1

        # Buffer to hold incoming data from parent nodes until in_degree is met
        self.input_buffer: dict[str, list] = {
            node.name: [] for node in self.workflow.nodes
        }

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

    async def execute_node(self, node_name: str, input_data: Any = None):
        node_obj: Node = self.node_map[node_name]

        if node_obj.disabled:
            return {"result": input_data, "output_index": 0}

        node_dict = node_obj.model_dump()

        clean_node = resolve_all_variables(self.execution_state, node_dict)
        clean_params = clean_node.get("parameters", {})

        node_type = clean_node["type"]

        handler = get_handler(node_type)

        if handler:
            result, output_index = await handler(clean_params, input_data, self)

            return {"result": result, "output_index": output_index}

        msg = f"Unknown task type: {node_type}"
        raise ValueError(msg)

    async def run(self):
        # Trigger the workflow by injecting an empty dict into the start node's buffer
        if not self.start_node_name:
            raise ValueError("Invalid Workflow: No 'manual_trigger' node found.")

        self.input_buffer[self.start_node_name].append({})

        # Tuple: (NodeName, InputData)
        self.queue.append(
            (self.start_node_name, self.input_buffer[self.start_node_name])
        )

        while self.queue:
            current_node_name, buffered_inputs = self.queue.popleft()

            print(f"Executing {current_node_name}")

            # 1. Determine if this node is entirely skipped
            # A node is skipped if ALL of its required inputs are SKIP_SIGNALS
            is_skipped = all(i == SKIP_SIGNAL for i in buffered_inputs)

            if is_skipped:
                self.execution_state[current_node_name] = {"status": "skipped"}

                # Propagate the skip siganl to all children
                for child in self.get_all_children(current_node_name):
                    self.input_buffer[child].append(SKIP_SIGNAL)
                    if len(self.input_buffer[child]) == self.in_degree[child]:
                        self.queue.append((child, self.input_buffer[child]))
                continue

            # 2. Prepare actual input for the handler
            # Filter out skip signals so the Merge node only processes actual data
            valid_inputs = [i for i in buffered_inputs if i != SKIP_SIGNAL]

            node_type = self.node_map[current_node_name].type
            is_merge_node = "merge" in node_type

            # Merge nodes receive the full list of inputs.
            # Standard nodes receive just the first valid input dictionary.
            if is_merge_node:
                input_data = valid_inputs
            else:
                input_data = valid_inputs[0] if valid_inputs else {}

            try:
                # 3. Execute the node
                execution_result = await self.execute_node(
                    current_node_name, input_data
                )

                self.execution_state[current_node_name] = execution_result["result"]
                output_index = execution_result["output_index"]

                # 4. Route successful execution to active children
                active_nodes = self.get_next_nodes(current_node_name, output_index)
                for name in active_nodes:
                    self.input_buffer[name].append(execution_result["result"])
                    if len(self.input_buffer[name]) == self.in_degree[name]:
                        self.queue.append((name, self.input_buffer[name]))

                # 5. Propagate SKIP_SIGNAL to unselected branches (e.g the False path of an IF node)
                skipped_nodes = self.get_skipped_nodes(current_node_name, output_index)
                for name in skipped_nodes:
                    self.input_buffer[name].append(SKIP_SIGNAL)
                    if len(self.input_buffer[name]) == self.in_degree[name]:
                        self.queue.append((name, self.input_buffer[name]))

            except (ValueError, KeyError, TypeError, httpx.HTTPError) as e:
                self.execution_state[current_node_name] = {"error": str(e)}
                # Propagate failure so downstream nodes aren't stuck waiting
                for child in self.get_all_children(current_node_name):
                    self.input_buffer[child].append(SKIP_SIGNAL)
                    if len(self.input_buffer[child]) == self.in_degree[child]:
                        self.queue.append((child, self.input_buffer[child]))

        # check if cycle exists in the workflow (A -> B -> A)
        executed_nodes = set(self.execution_state.keys())
        all_nodes = set(self.node_map.keys())
        stuck_nodes = all_nodes - executed_nodes
        if stuck_nodes:
            for name in stuck_nodes:
                self.execution_state[name] = {
                    "error": "Node never executed (possible cycle or missing input)"
                }

        return self.execution_state

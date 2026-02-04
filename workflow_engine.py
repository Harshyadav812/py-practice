from collections import deque
from typing import Any

import httpx

from node_handlers import N8N_TYPE_MAPPING, SIMPLE_HANDLERS
from schemas import ConnectionTarget, Node, WorkflowPayload
from tasks import resolve_all_variables


class WorkflowEngine:
    def __init__(self, workflow: WorkflowPayload):
        self.workflow: WorkflowPayload = workflow
        self.node_map: dict[str, Node] = workflow.nodes_by_names
        self.execution_state = {}
        # Queue stores tuples: (node_name, input_data)
        self.queue = deque()

        self.visited = set()

        self.start_node_name = next(
            (n.name for n in self.workflow.nodes if "manual_trigger" in n.type), None
        )

        if not self.start_node_name:
            raise ValueError("Invalid Workflow: No 'manual_trigger' node found.")

    def get_next_nodes(self, node_name, output_index=0):
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

    async def execute_node(self, node_name: str, input_data: Any = None):
        if input_data is None:
            return {"result": None, "output_index": 0}

        node_obj: Node = self.node_map[node_name]

        if node_obj.disabled:
            return {"result": input_data, "output_index": 0}

        node_dict = node_obj.model_dump()

        clean_node = resolve_all_variables(self.execution_state, node_dict)
        clean_params = clean_node.get("parameters", {})

        node_type = clean_node["type"]

        handler = None

        if node_type in SIMPLE_HANDLERS:
            handler = SIMPLE_HANDLERS[node_type]
        elif node_type in N8N_TYPE_MAPPING:
            handler = N8N_TYPE_MAPPING[node_type]

        if handler:
            result, output_index = await handler(clean_params, input_data, self)

            return {"result": result, "output_index": output_index}

        msg = f"Unknown task type: {node_type}"
        raise ValueError(msg)

    async def run(self):
        # Tuple: (NodeName, InputData)
        # Start node gets empty input
        self.queue.append((self.start_node_name, {}))
        self.visited.add(self.start_node_name)

        while self.queue:
            current_node_name, input_data = self.queue.popleft()

            print(f"Executing {current_node_name}")

            try:
                # full response: result + output_index
                execution_result = await self.execute_node(
                    current_node_name, input_data
                )

                self.execution_state[current_node_name] = execution_result["result"]

                output_index = execution_result["output_index"]

                next_nodes = self.get_next_nodes(current_node_name, output_index)

                for name in next_nodes:
                    if name not in self.visited:
                        self.queue.append((name, execution_result["result"]))
                        self.visited.add(name)

            except (ValueError, KeyError, TypeError, httpx.HTTPError) as e:
                self.execution_state[current_node_name] = {"error": str(e)}

        return self.execution_state

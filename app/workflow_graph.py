"""Pure graph structure for a workflow - no DB, no execution state.

WorkflowGraph is immutable after construction and reusable across executions.
It encapsulates all graph-topology concerns: adjacency, cycle detection,
ancestor lookup, and in-degree computation.
"""

from __future__ import annotations

from collections import deque
from functools import cached_property

from app.schemas.nodes import Node, WorkflowPayload


class WorkflowGraph:
    """Immutable blueprint of a workflow graph."""

    def __init__(self, workflow: WorkflowPayload) -> None:
        self._workflow = workflow
        self._node_map: dict[str, Node] = workflow.nodes_by_names
        self._connections = workflow.connections

        self._adjacency: dict[str, list[str]] = {}
        self._reverse_adjacency: dict[str, list[str]] = {}
        self._build_adjacency()
        self._build_reverse_adjacency()

        self._validate()

    # ------------------------------------------------------------------
    # Construction helpers
    # ------------------------------------------------------------------

    def _build_adjacency(self) -> None:
        """Build forward adjacency list (source -> list of targets)."""
        self._adjacency = {node.name: [] for node in self._workflow.nodes}
        for node_name, connections in self._connections.items():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        if node_name in self._adjacency:
                            self._adjacency[node_name].append(target.node)

    def _build_reverse_adjacency(self) -> None:
        """Build backward adjacency list (target -> list of sources)."""
        self._reverse_adjacency = {node.name: [] for node in self._workflow.nodes}
        for node_name, connections in self._connections.items():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        if target.node in self._reverse_adjacency:
                            self._reverse_adjacency[target.node].append(node_name)

    def _validate(self) -> None:
        self._detect_cycles()

    def _detect_cycles(self) -> None:  # noqa: C901
        """Detect cycles in the workflow graph using DFS with 3-color marking."""
        white, gray, black = 0, 1, 2
        color = dict.fromkeys(self._adjacency, white)

        def dfs(node: str) -> str | None:
            color[node] = gray
            for neighbor in self._adjacency.get(node, []):
                if color.get(neighbor) == gray:
                    return neighbor  # Cycle found!
                if color.get(neighbor) == white:
                    cycle_node = dfs(neighbor)
                    if cycle_node is not None:
                        return cycle_node
            color[node] = black
            return None

        for node_name in self._adjacency:
            if color[node_name] == white:
                cycle_node = dfs(node_name)
                if cycle_node is not None:
                    msg = (
                        f"Invalid workflow: cycle detected involving node '{cycle_node}'. "
                        "Remove circular connections."
                    )
                    raise ValueError(msg)

    # ------------------------------------------------------------------
    # Cached properties (computed once, then frozen)
    # ------------------------------------------------------------------

    @cached_property
    def trigger_node_name(self) -> str | None:
        """Find the first trigger node in the workflow."""
        trigger_types = {"manual_trigger", "manualtrigger", "webhook"}
        return next(
            (
                node.name
                for node in self._workflow.nodes
                if node.type.lower() in trigger_types
                or any(t in node.type.lower() for t in trigger_types)
            ),
            None,
        )

    @cached_property
    def in_degrees(self) -> dict[str, int]:
        """Compute in-degrees for all nodes (with virtual +1 for the trigger)."""
        degrees: dict[str, int] = {node.name: 0 for node in self._workflow.nodes}

        for connections in self._connections.values():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        if target.node in degrees:
                            degrees[target.node] += 1

        # Trigger node always needs exactly 1 virtual input to start
        if self.trigger_node_name and self.trigger_node_name in degrees:
            degrees[self.trigger_node_name] = 1

        return degrees

    # ------------------------------------------------------------------
    # Public graph query API
    # ------------------------------------------------------------------

    def get_node(self, name: str) -> Node | None:
        return self._node_map.get(name)

    def get_children(self, node_name: str, output_index: int = 0) -> list[str]:
        """Forward traversal — children on a specific output port."""
        if node_name not in self._connections:
            return []
        connections_data = self._connections[node_name]
        if "main" not in connections_data:
            return []
        main = connections_data["main"]
        if output_index < len(main):
            return [target.node for target in main[output_index]]
        return []

    def get_all_children(self, node_name: str) -> list[str]:
        """All children across all output ports."""
        if node_name not in self._connections:
            return []
        connections_data = self._connections[node_name]
        if "main" not in connections_data:
            return []
        children: list[str] = []
        for destination_list in connections_data["main"]:
            for target in destination_list:
                children.append(target.node)
        return children

    def get_skipped_children(self, node_name: str, active_index: int) -> list[str]:
        """Children on non-active output ports (for IF/Switch skipping)."""
        if node_name not in self._connections:
            return []
        connections_data = self._connections[node_name]
        if "main" not in connections_data:
            return []
        skipped: list[str] = []
        for i, destination_list in enumerate(connections_data["main"]):
            if i != active_index:
                for target in destination_list:
                    skipped.append(target.node)
        return skipped

    def get_parent_nodes(self, node_name: str) -> list[str]:
        """BFS backward traversal — returns ALL ancestor node names.

        Used for smart resume: find all nodes upstream of *node_name*.
        """
        visited: set[str] = set()
        queue: deque[str] = deque([node_name])
        ancestors: list[str] = []

        while queue:
            current = queue.popleft()
            for parent in self._reverse_adjacency.get(current, []):
                if parent not in visited:
                    visited.add(parent)
                    ancestors.append(parent)
                    queue.append(parent)

        return ancestors

    def get_immediate_parents(self, node_name: str) -> list[str]:
        """Direct parent nodes only (depth=1)."""
        return list(self._reverse_adjacency.get(node_name, []))

    @property
    def node_names(self) -> set[str]:
        return set(self._node_map.keys())

    @property
    def nodes(self) -> dict[str, Node]:
        return self._node_map

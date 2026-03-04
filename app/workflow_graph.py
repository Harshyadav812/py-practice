"""
Pure workflow graph topology — no DB, no execution state, no side effects.

Built once from a ``WorkflowPayload``, reusable across executions.
"""

from __future__ import annotations

import contextlib
from collections import deque
from functools import cached_property
from typing import TYPE_CHECKING, Any

from app.tasks import rename_node_in_parameters

if TYPE_CHECKING:
    from app.schemas.nodes import Node, WorkflowPayload


class WorkflowGraph:
    """DAG representation of a workflow."""

    def __init__(self, workflow: WorkflowPayload) -> None:
        self._workflow = workflow
        self._node_map: dict[str, Node] = {n.name: n for n in workflow.nodes}
        self._connections = workflow.connections

        # Pre-compute adjacency lists once
        self._adjacency = self._build_adjacency()
        self._reverse_adjacency = self._build_reverse_adjacency()

        # Validate on construction
        self._detect_cycles()

    # ------------------------------------------------------------------
    # Adjacency builders
    # ------------------------------------------------------------------

    def _build_adjacency(self) -> dict[str, list[str]]:
        """Forward adjacency: node → list of all direct children."""
        adj: dict[str, list[str]] = {name: [] for name in self._node_map}
        for source, connections in self._connections.items():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        if source in adj:
                            adj[source].append(target.node)
        return adj

    def _build_reverse_adjacency(self) -> dict[str, list[str]]:
        """Reverse adjacency: node → list of all direct parents."""
        rev: dict[str, list[str]] = {name: [] for name in self._node_map}
        for source, connections in self._connections.items():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        if target.node in rev:
                            rev[target.node].append(source)
        return rev

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def _detect_cycles(self) -> None:
        """Detect cycles using DFS with 3-colour marking."""
        white, gray, black = 0, 1, 2
        colour = dict.fromkeys(self._adjacency, white)

        def dfs(node: str) -> str | None:
            colour[node] = gray
            for neighbour in self._adjacency.get(node, []):
                if colour.get(neighbour) == gray:
                    return neighbour
                if colour.get(neighbour) == white:
                    cycle_node = dfs(neighbour)
                    if cycle_node is not None:
                        return cycle_node
            colour[node] = black
            return None

        for node_name in self._adjacency:
            if colour[node_name] == white:
                cycle_node = dfs(node_name)
                if cycle_node is not None:
                    msg = (
                        f"Invalid workflow: cycle detected involving node "
                        f"'{cycle_node}'. Remove circular connections."
                    )
                    raise ValueError(msg)

    # ------------------------------------------------------------------
    # Cached properties (computed once)
    # ------------------------------------------------------------------

    @cached_property
    def trigger_node_name(self) -> str | None:
        """Return the name of the first trigger node, or ``None``."""
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
        """In-degree for every node (how many incoming connections)."""
        deg: dict[str, int] = dict.fromkeys(self._node_map, 0)
        for connections in self._connections.values():
            for connection_type in connections.values():
                for output_index_list in connection_type:
                    for target in output_index_list:
                        if target.node in deg:
                            deg[target.node] += 1

        # The trigger node gets a virtual in-degree of 1
        trigger = self.trigger_node_name
        if trigger is not None:
            deg[trigger] = 1
        return deg

    # Node accessors

    @property
    def node_names(self) -> set[str]:
        return set(self._node_map.keys())

    @property
    def nodes(self) -> dict[str, Node]:
        return self._node_map

    def get_node(self, name: str) -> Node | None:
        return self._node_map.get(name)

    # ------------------------------------------------------------------
    # Forward traversal
    # ------------------------------------------------------------------

    def get_children(self, node_name: str, output_index: int = 0) -> list[str]:
        """Children connected to a specific output port."""
        connections_data = self._connections.get(node_name)
        if not connections_data or "main" not in connections_data:
            return []
        main = connections_data["main"]
        if output_index < len(main):
            return [t.node for t in main[output_index]]
        return []

    def get_all_children(self, node_name: str) -> list[str]:
        """All children across every output port."""
        connections_data = self._connections.get(node_name)
        if not connections_data or "main" not in connections_data:
            return []
        children: list[str] = []
        for output_list in connections_data["main"]:
            for target in output_list:
                children.append(target.node)
        return children

    def get_skipped_children(
        self, node_name: str, active_output_index: int
    ) -> list[str]:
        """Children on non-active output ports (for IF / Switch nodes)."""
        connections_data = self._connections.get(node_name)
        if not connections_data or "main" not in connections_data:
            return []
        skipped: list[str] = []
        for i, output_list in enumerate(connections_data["main"]):
            if i != active_output_index:
                for target in output_list:
                    skipped.append(target.node)
        return skipped

    # ------------------------------------------------------------------
    # Backward traversal
    # ------------------------------------------------------------------

    def get_immediate_parents(self, node_name: str) -> list[str]:
        """Direct parents (depth 1) via reverse adjacency."""
        return list(self._reverse_adjacency.get(node_name, []))

    def get_parent_nodes(self, node_name: str) -> list[str]:
        """All ancestor nodes via BFS backward traversal."""
        visited: set[str] = set()
        queue: deque[str] = deque(self._reverse_adjacency.get(node_name, []))
        ancestors: list[str] = []

        while queue:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)
            ancestors.append(current)
            for parent in self._reverse_adjacency.get(current, []):
                if parent not in visited:
                    queue.append(parent)

        return ancestors

        # ------------------------------------------------------------------

    # Mutation: rename
    # ------------------------------------------------------------------

    def rename_node(self, current_name: str, new_name: str) -> None:  # noqa: C901
        """
        Rename a node and update all references throughout the graph.

        Updates:
          1. The node object itself (node.name)
          2. The internal node map
          3. Source-side connection keys
          4. Target-side connection references (ConnectionTarget.node)
          5. $ variable references in ALL nodes' parameters
          6. Adjacency lists (rebuilt)

        Raises ``ValueError`` if *current_name* doesn't exist or
        *new_name* already exists.
        """
        if current_name == new_name:
            return

        if current_name not in self._node_map:
            msg = f"Cannot rename: node '{current_name}' not found"
            raise ValueError(msg)

        if new_name in self._node_map:
            msg = f"Cannot rename: node '{new_name}' already exists"
            raise ValueError(msg)

        if not new_name or not new_name.strip():
            msg = "Node name cannot be empty"
            raise ValueError(msg)

        # Rename the node object
        node = self._node_map[current_name]
        node.name = new_name

        #  Update node map
        self._node_map[new_name] = node
        del self._node_map[current_name]

        # Update source-side connection keys
        if current_name in self._connections:
            self._connections[new_name] = self._connections.pop(current_name)

        # Update target-side connection references
        for connection_types in self._connections.values():
            for output_lists in connection_types.values():
                for output_list in output_lists:
                    for target in output_list:
                        if target.node == current_name:
                            target.node = new_name

        # Update $ references in ALL nodes' parameters
        for node_obj in self._node_map.values():
            node_obj.parameters = rename_node_in_parameters(
                node_obj.parameters, current_name, new_name
            )

        # Rebuild adjacency (cheap — O(edges))
        self._adjacency = self._build_adjacency()
        self._reverse_adjacency = self._build_reverse_adjacency()

        # Invalidate cached properties so they recompute
        for attr in ("trigger_node_name", "in_degrees"):
            with contextlib.suppress(AttributeError):
                delattr(self, attr)

    def rename_node_in_pindata(
        self, pin_data: dict[str, Any] | None, current_name: str, new_name: str
    ) -> dict[str, Any] | None:
        """Rename a node key in pinData (if it exists)."""
        if not pin_data or current_name not in pin_data:
            return pin_data
        pin_data[new_name] = pin_data.pop(current_name)
        return pin_data

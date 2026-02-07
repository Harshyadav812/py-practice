"""Pydantic schemas for n8n-style graph workflow validation."""

from typing import Any

from pydantic import BaseModel


# 1. Connection Target (Where the wire goes)
class ConnectionTarget(BaseModel):
    node: str  # Name of the next node
    type: str = "main"  # Input type (usually 'main')
    index: int = 0  # Input port index (0 = first input)


# 2. The Node Definition
class Node(BaseModel):
    id: str
    name: str
    type: str
    typeVersion: float | int = 1  # noqa: N815
    position: list[float] = [0, 0]  # UI coordinates

    # "parameters" is unstructured because every node type is different
    # This allows flexibility for both n8n types and custom types
    parameters: dict[str, Any] = {}

    # Credentials are defined per node in n8n
    credentials: dict[str, Any] | None = None

    disabled: bool = False
    notes: str | None = None


# 3. The Workflow Container
class WorkflowPayload(BaseModel):
    name: str = "My Workflow"
    nodes: list[Node]

    # The adjacency list:
    # { "NodeName": { "main": [ [Target1, Target2], [Target3] ] } }
    # Outer Dict Key: Source Node Name
    # Inner Dict Key: Output Type (usually "main")
    # Outer List: Output Index (0, 1, 2...)
    # Inner List: All connections from that output
    connections: dict[str, dict[str, list[list[ConnectionTarget]]]] = {}

    @property
    def nodes_by_names(self) -> dict[str, Node]:
        """Quick lookup dict, build on demand."""
        return {node.name: node for node in self.nodes}

    # Meta info
    meta: dict[str, Any] | None = {}
    pinData: dict[str, Any] | None = {}  # noqa: N815

    settings: dict[str, Any] | None = {}

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlmodel import SQLModel

if TYPE_CHECKING:
    from app.models.execution_node import ExecutionNode


class ExecutionRead(SQLModel):
    id: UUID
    owner_id: UUID
    data: dict[str, Any]


class ExecutionDetailRead(ExecutionRead):
    execution_node_data: list[ExecutionNode]

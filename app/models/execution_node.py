from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.execution import Execution


class NodeExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    SKIPPED = "skipped"


class ExecutionNode(SQLModel, table=True):
    __tablename__ = "execution_node"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    execution_id: UUID = Field(foreign_key="execution.id", index=True)

    node_id: str = Field(index=True)

    status: NodeExecutionStatus = Field(default=NodeExecutionStatus.PENDING)

    # What data went into this node?
    input_data: Any = Field(
        default_factory=dict, sa_column=Column(JSON().with_variant(JSONB, "postgresql"))
    )

    output_data: Any = Field(
        default_factory=dict, sa_column=Column(JSON().with_variant(JSONB, "postgresql"))
    )

    error_message: str | None = Field(default=None)

    started_at: datetime | None = Field(default=None)
    finished_at: datetime | None = Field(default=None)

    execution: "Execution" = Relationship(back_populates="nodes")

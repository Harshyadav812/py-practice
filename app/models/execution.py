from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.execution_node import ExecutionNode
    from app.models.users import User
    from app.models.workflow import Workflow


class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Execution(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)

    workflow_id: UUID = Field(foreign_key="workflow.id", index=True)
    owner_id: UUID = Field(foreign_key="user.id", index=True)

    status: ExecutionStatus = Field(default=ExecutionStatus.PENDING)

    # Stores the engine.execution_state dictionary
    state: dict = Field(
        default_factory=dict, sa_column=Column(JSON().with_variant(JSONB, "postgresql"))
    )

    # High-level error message if the workflow crashed entirely
    error_message: str | None = Field(default=None)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = Field(default=None)
    finished_at: datetime | None = Field(default=None)

    # Relationships
    workflow: "Workflow" = Relationship(back_populates="executions")
    owner: "User" = Relationship(back_populates="executions")

    nodes: list["ExecutionNode"] = Relationship(
        back_populates="execution", cascade_delete=True
    )

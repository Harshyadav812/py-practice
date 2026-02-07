from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.users import User

from app.schemas.nodes import WorkflowPayload  # noqa: F401


class Workflow(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)

    name: str = Field(index=True)
    description: str | None = None
    is_active: bool = False  # If true, runs on triggers

    # The graph(stored as JSON)
    # We use sa_column to tell SQLModel to use a Postgres JSONB column
    data: dict[str, Any] = Field(default={}, sa_column=Column(JSONB))

    # Ownership (Strict Isolation)
    owner_id: UUID = Field(foreign_key="user.id", index=True)
    owner: "User" = Relationship(back_populates="workflows")

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime | None = Field(
        default=None, sa_column_kwargs={"onupdate": lambda: datetime.now(UTC)}
    )

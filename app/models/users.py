from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship

from app.schemas.users import UserBase

if TYPE_CHECKING:
    from app.models.credentials import Credentials
    from app.models.workflow import Workflow


class User(UserBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)

    hashed_password: str

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime | None = Field(
        default=None, sa_column_kwargs={"onupdate": lambda: datetime.now(UTC)}
    )

    workflows: list["Workflow"] = Relationship(
        back_populates="owner", cascade_delete=True
    )
    credentials: list["Credentials"] = Relationship(
        back_populates="owner", cascade_delete=True
    )

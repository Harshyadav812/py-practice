from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.users import User


class Credential(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(index=True)
    type: str
    # This stores the ENCRYPTED string (garbage text) produced by CipherService
    encrypted_data: str

    owner_id: UUID = Field(foreign_key="user.id", index=True)
    owner: "User" = Relationship(back_populates="credentials")

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime | None = Field(
        default=None, sa_column_kwargs={"onupdate": lambda: datetime.now(UTC)}
    )

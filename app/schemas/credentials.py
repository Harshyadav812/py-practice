from datetime import datetime
from typing import Any
from uuid import UUID

from sqlmodel import SQLModel


class CredentialBase(SQLModel):
    name: str
    type: str


class CredentialCreate(CredentialBase):
    data: dict[str, Any]


class CredentialRead(CredentialBase):
    id: UUID
    owner_id: UUID
    created_at: datetime

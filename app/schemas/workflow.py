import uuid
from datetime import datetime

from sqlmodel import SQLModel

# Import the existing Pydantic models for validtion
from app.schemas.nodes import WorkflowPayload


# Base: Shared properties
class WorkflowBase(SQLModel):
    name: str
    description: str | None = None
    is_active: bool = False
    data: WorkflowPayload  # Reuse your existing validator!


# Create: Input
class WorkflowCreate(WorkflowBase):
    pass


# Read: Output (Includes ID and Metadata)
class WorkflowRead(WorkflowBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime | None

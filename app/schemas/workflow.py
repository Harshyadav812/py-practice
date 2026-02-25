import uuid
from datetime import datetime
from typing import Any

from sqlmodel import SQLModel

# Import the existing Pydantic models for validation
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


# Update: Partial input for PATCH (all fields optional)
class WorkflowUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    data: WorkflowPayload | None = None


# Execute: Response from /execute endpoint
class ExecuteResponse(SQLModel):
    status: str
    results: dict[str, Any]

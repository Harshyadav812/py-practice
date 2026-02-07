from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate, WorkflowRead

router = APIRouter()


# Create
@router.post("/", response_model=WorkflowRead)
def create_workflow(
    workflow_in: WorkflowCreate, current_user: CurrentUser, session: SessionDep
):
    """Create a new workflow for the current user."""
    # Auto-assign owner_id
    workflow = Workflow.model_validate(
        workflow_in, update={"owner_id": current_user.id}
    )
    session.add(workflow)
    session.commit()
    session.refresh(workflow)
    return workflow


# Read (List)
@router.get("/", response_model=list[WorkflowRead])
def read_workflows(
    current_user: CurrentUser,
    session: SessionDep,
    offset: int = 0,
    limit: Annotated[int, Query(le=100)] = 100,
):
    """List all workflows belonging to the current user."""
    # STRICT ISOLATION: filter by owner_id
    statement = (
        select(Workflow)
        .where(Workflow.owner_id == current_user.id)
        .offset(offset)
        .limit(limit)
    )

    workflows = session.exec(statement).all()
    return workflows


# Read One
@router.get("/{workflow_id}", response_model=WorkflowRead)
def read_workflow(workflow_id: UUID, current_user: CurrentUser, session: SessionDep):
    """GET a specific workflow by ID."""
    workflow = session.get(Workflow, workflow_id)

    # 404 if not found OR if not owned by user
    if not workflow or workflow.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return workflow


# Delete
@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: UUID, current_user: CurrentUser, session: SessionDep):
    """Delete a workflow."""
    workflow = session.get(Workflow, workflow_id)

    if not workflow or workflow.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    session.delete(workflow)
    session.commit()
    return {"ok": True}

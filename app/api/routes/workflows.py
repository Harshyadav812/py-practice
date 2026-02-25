from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.workflow import Workflow
from app.schemas.nodes import WorkflowPayload
from app.schemas.workflow import (
    ExecuteResponse,
    WorkflowCreate,
    WorkflowRead,
    WorkflowUpdate,
)
from app.workflow_engine import WorkflowEngine

router = APIRouter()


@router.post("/execute", response_model=ExecuteResponse)
async def execute_workflow(
    payload: WorkflowPayload, current_user: CurrentUser, session: SessionDep
):
    workflow_engine = WorkflowEngine(
        workflow=payload, session=session, user_id=current_user.id
    )

    final_state = await workflow_engine.run()

    return ExecuteResponse(status="success", results=final_state)


# Create
@router.post("/", response_model=WorkflowRead)
def create_workflow(
    workflow_in: WorkflowCreate, current_user: CurrentUser, session: SessionDep
):
    """Create a new workflow for the current user."""
    # Auto-assign owner_id and convert data to dict for JSONB storage
    workflow = Workflow.model_validate(
        workflow_in,
        update={
            "owner_id": current_user.id,
            "data": workflow_in.data.model_dump(),
        },
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


# Update (Partial)
@router.patch("/{workflow_id}", response_model=WorkflowRead)
def update_workflow(
    workflow_id: UUID,
    workflow_in: WorkflowUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    """Update a workflow. Only provided fields are changed."""
    workflow = session.get(Workflow, workflow_id)

    if not workflow or workflow.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Only update fields that were actually sent by the client
    update_data = workflow_in.model_dump(exclude_unset=True)

    # Convert WorkflowPayload to dict for JSONB if data is being updated
    if "data" in update_data and update_data["data"] is not None:
        update_data["data"] = workflow_in.data.model_dump()

    workflow.sqlmodel_update(update_data)
    session.add(workflow)
    session.commit()
    session.refresh(workflow)
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


@router.post("/{workflow_id}/run", response_model=ExecuteResponse)
async def run_workflow(
    workflow_id: UUID, current_user: CurrentUser, session: SessionDep
):
    """Fetch an existing workflow by ID and execute it."""
    workflow = session.get(Workflow, workflow_id)

    if not workflow or workflow.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # workflow.data is already a dict (JSONB) — parse it into WorkflowPayload
    payload = WorkflowPayload.model_validate(workflow.data)

    workflow_engine = WorkflowEngine(
        workflow=payload, session=session, user_id=current_user.id
    )

    final_state = await workflow_engine.run()

    return ExecuteResponse(status="success", results=final_state)

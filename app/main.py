from fastapi import FastAPI

from app.api.deps import CurrentUser
from app.api.routes import auth, credentials, workflows
from app.db import SQLModel, engine
from app.schemas.nodes import WorkflowPayload
from app.schemas.workflow import WorkflowRead
from app.workflow_engine import WorkflowEngine

app = FastAPI()


@app.post("/execute", response_model=WorkflowRead)
async def execute_workflow(payload: WorkflowPayload, current_user: CurrentUser):  # noqa: ARG001
    # TODO @Harshyadav812: In real life, we should probably check if current_user owns the workflow
    # But for now, we just ensure they are logged in.
    workflow_engine = WorkflowEngine(payload)

    final_state = await workflow_engine.run()

    return {"status": "success", "results": final_state}


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
app.include_router(credentials.router, prefix="/credentials", tags=["credentials"])


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


if __name__ == "__main__":
    create_db_and_tables()

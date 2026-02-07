from fastapi import FastAPI

from app.api.routes import auth, workflows
from app.db import SQLModel, engine
from app.schemas.nodes import WorkflowPayload
from app.workflow_engine import WorkflowEngine

app = FastAPI()


@app.post("/execute")
async def execute_workflow(payload: WorkflowPayload):
    workflow_engine = WorkflowEngine(payload)

    final_state = await workflow_engine.run()

    return {"status": "success", "results": final_state}


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(workflows.router, prefix="/workflows", tags=["workflows"])


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


if __name__ == "__main__":
    create_db_and_tables()

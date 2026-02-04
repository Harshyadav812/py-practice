from fastapi import FastAPI

from schemas import WorkflowPayload
from workflow_engine import WorkflowEngine

app = FastAPI()


@app.post("/execute")
async def execute_workflow(payload: WorkflowPayload):
    workflow_engine = WorkflowEngine(payload)

    final_state = await workflow_engine.run()

    return {"status": "success", "results": final_state}

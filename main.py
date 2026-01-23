# type: ignore
from fastapi import FastAPI, Body
from tasks import do_print, do_calc, do_http, do_condition, resolve_all_variables

app = FastAPI()


@app.post("/execute")
async def execute_workflow(payload: dict = Body(...)):
  workflow_results = {}
  tasks = payload.get("tasks", [])

  workflow_log = []

  for task in tasks:
    try:
      clean_task = resolve_all_variables(workflow_results, task)

      match clean_task['type']: # type: ignore

        case 'print':
          workflow_results[task['name']] = do_print(clean_task['content'])


        case 'calculate':
          workflow_results[task['name']] = do_calc(clean_task['operation'], *clean_task['numbers'])


        case 'http':
          workflow_results[task['name']] = await do_http(
            clean_task['url'], 
            clean_task.get('method', 'GET'), 
            clean_task.get('body', None)
            )
          

        case 'condition':
          workflow_results[task['name']] = do_condition(clean_task['left'], clean_task['operator'], clean_task['right'])

      workflow_log.append({
          "task": task['name'],
          "type": task['type'],
          "status": "success",
          "result": workflow_results[task['name']]
        })
    
    except Exception as e:
      workflow_results[task['name']] = {"error": str(e)}
      workflow_log.append({
        "task": task['name'],
        "type": task['type'],
        "status": "error",
        "result": workflow_results[task['name']]
      })

      
  return {"results": workflow_results, "log": workflow_log}
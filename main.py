import asyncio
from typing import Any
import time
from schemas import WorkflowPayload

from fastapi import FastAPI, Body
from tasks import do_print, do_calc, do_http, do_fetch_all, do_condition, do_delay, resolve_all_variables

app = FastAPI()


async def execute_task(clean_task, workflow_results):

  match clean_task['type']:

    case 'print':
      return do_print(clean_task['content'])


    case 'calculate':
      return do_calc(clean_task['operation'], *clean_task['numbers'])


    case 'http':
      return await do_http(
          clean_task['url'], 
          clean_task.get('method', 'GET'), 
          clean_task.get('body', None),
          clean_task.get('headers', None),
          clean_task.get('retries', 0),
          clean_task.get('retry_delay', 1),
          clean_task.get('timeout', 30)
        )
    
    case 'parallel':
      urls = []
      
      for task in clean_task['tasks']:
        urls.append(task['url'])

      results = await do_fetch_all(urls)

      return results
          

    case 'condition':
      result = do_condition(clean_task['left'], clean_task['operator'], clean_task['right'])          

      if result:
        branch_tasks = clean_task.get('then_do')
      else:
        branch_tasks = clean_task.get('else_do')

      if branch_tasks:
        if isinstance(branch_tasks, dict):
          branch_tasks = [branch_tasks]
        
        branch_results = []
        for task in branch_tasks:
          resolved = resolve_all_variables(workflow_results, task)
          res = await execute_task(resolved, workflow_results)
          branch_results.append(res)
        
        return {"condition": result, "branch_results": branch_results}

      return {"condition": result}

    case 'set':
      return clean_task['value']
    
    case 'delay':
      return await do_delay(clean_task['seconds'])
    
    case 'switch':
      switch_val = str(clean_task['value'])

      if switch_val in clean_task['cases']:
        case_resolved = resolve_all_variables(workflow_results, clean_task['cases'][switch_val])

        res = await execute_task(case_resolved, workflow_results)
        return res
      
      else:
        res = await execute_task(clean_task['default'], workflow_results)
        return res
      
    
    case 'loop':

      do_template = clean_task['do']
      items = clean_task['items']

      as_var = clean_task['as']

      loop_results = []

      for item in items:
        workflow_results[as_var] = item

        #check skipIf - skip this item
        if 'skipIf' in clean_task:
          skip_resolved = resolve_all_variables(workflow_results, clean_task['skipIf'])
          should_skip = do_condition(skip_resolved['left'], skip_resolved['operator'], skip_resolved['right'])

          if should_skip:
            del workflow_results[as_var]
            continue
        
        #check breakIf - stop the entire loop

        if 'breakIf' in clean_task:
          break_resolved = resolve_all_variables(workflow_results, clean_task['breakIf'])
          should_break = do_condition(break_resolved['left'], break_resolved['operator'], break_resolved['right'])

          if should_break:
            del workflow_results[as_var]
            break

        resolved_do = resolve_all_variables(workflow_results, do_template, skip_keys={'do', 'skipIf', 'breakIf'})

        res = await execute_task(resolved_do, workflow_results)
            
        loop_results.append(res)
        del workflow_results[as_var]

      return loop_results

@app.post("/execute")
async def execute_workflow(payload: WorkflowPayload):
  SKIP_KEYS_BY_TYPE = {
    'loop': {'do', 'skipIf', 'breakIf'},
    'switch': {'cases'},
    'condition': {'then_do', 'else_do'}
  }

  workflow_results: dict[str, Any] = {}
  tasks = [task.model_dump(by_alias=True) for task in payload.tasks]

  workflow_log = []

  for task in tasks:
    task_type = task.get('type')
    skip_keys = SKIP_KEYS_BY_TYPE.get(task_type, set())
  
    try:
      clean_task = resolve_all_variables(workflow_results, task, skip_keys=skip_keys)

      workflow_results[task['name']] = await execute_task(clean_task, workflow_results)
          
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
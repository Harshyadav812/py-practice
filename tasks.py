import httpx
import asyncio
import re

def do_print(content):
  return content

def do_calc(op='add', num1=1, num2=2):

  print(num1, num2)
  match op:
    case 'add':
      return num1 + num2
    case 'sub':
      return num1 - num2
    case 'mul':
      return num1*num2
    case 'divide':
      return num1/num2
    
def do_condition(left, operator, right):
  
  match(operator):
    case '<':
      return left < right
    case '>':
      return left > right
    case '==':
      return left == right
    case '!=':
      return left != right
    case '>=':
      return left >= right
    case '<=':
      return left <= right
    case _:
      return "Invalid argument"
    

async def do_http(url, method="GET", body=None, retries=0, retry_delay=1):

  async with httpx.AsyncClient() as client:

    last_exception = None
    for attempt in range(retries+1):
      try:
        match(method):
          case "GET":
            response = await client.get(url)
            return response.json()
          case "POST":
            response = await client.post(url, json=body)
            return response.json()
      
      except Exception as e:
        last_exception = e
        if attempt < retries:
          print(f"Request failed: {e}. Retrying in {retry_delay}!")
          await asyncio.sleep(retry_delay)
        else:
          raise last_exception

      
async def do_fetch_all(urls):

  async with httpx.AsyncClient() as client:

    tasks = [client.get(url) for url in urls]
    responses = await asyncio.gather(*tasks, return_exceptions=True)

    results  = []
    for response in responses:
      if isinstance(response, Exception):
        results.append({"error": str(response)})
      else:
        results.append(response.json())

    return results

async def do_delay(seconds):
  await asyncio.sleep(seconds)
  return f"Waited {seconds} seconds"



def get_value_from_path(workflow_results, path:str):
  original_path = path
  if path.startswith("$"):
    path = path[1:]
  
  parts = path.split(".")

  if parts[0] not in workflow_results:
    raise ValueError(f"Variable {original_path} not found")

  current_val = workflow_results.get(parts[0])

  for part in parts[1:]:
    if isinstance(current_val, list) and part.isdigit():
      try:
        current_val = current_val[int(part)]
      except IndexError:
        raise ValueError(f"Variable {original_path} not found")
    
    elif isinstance(current_val, dict):
      if part not in current_val:
        raise ValueError(f"Variable {original_path} not found")
      current_val = current_val[part]

    else:
      raise ValueError(f"Variable {original_path} not found")
    
  return current_val



def resolve_all_variables(workflow_results, task, skip_keys=None):

  if skip_keys is None:
    skip_keys = set()
  
  #if it's a dict, look at every value inside it
  if isinstance(task, dict):
    return {k: task[k] if k in skip_keys 
            else resolve_all_variables(workflow_results, v, skip_keys) for k, v in task.items()}
  
  #if it's a list look at every item in the list
  if isinstance(task, list):
    return [resolve_all_variables(workflow_results, item, skip_keys) for item in task]
  
  #if it's a str, use get_value_from_path() function to revole the path
  if isinstance(task, str) and '$' in task:
     
    if re.fullmatch(r"\$[\w.]+", task):
      return get_value_from_path(workflow_results, task)
  
    else:

      def resolve_template_string(match):
        var_path = match.group(0)
        resolved = get_value_from_path(workflow_results, var_path)

        return str(resolved)
      
      return re.sub(r"\$[\w.]+", resolve_template_string, task)
  
  #otherwise just return the task, as is
  return task


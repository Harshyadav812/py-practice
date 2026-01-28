import asyncio
from typing import Any

from fastapi import FastAPI

from schemas import WorkflowPayload
from tasks import (
    do_calc,
    do_condition,
    do_delay,
    do_fetch_all,
    do_http,
    do_print,
    resolve_all_variables,
)

app = FastAPI()


async def _handle_http(clean_task):
    async with asyncio.timeout(clean_task.get("timeout", 30)):
        return await do_http(
            clean_task["url"],
            clean_task.get("method", "GET"),
            clean_task.get("body", None),
            clean_task.get("headers", None),
            clean_task.get("retries", 0),
            clean_task.get("retry_delay", 1),
        )


async def _handle_parallel(clean_task):
    urls = [task["url"] for task in clean_task["tasks"]]
    return await do_fetch_all(urls)


async def _handle_condition(clean_task, workflow_results, execute_fn):
    result = do_condition(
        clean_task["left"],
        clean_task["operator"],
        clean_task["right"],
    )
    branch_tasks = clean_task.get("then_do") if result else clean_task.get("else_do")

    if not branch_tasks:
        return {"condition": result}

    if isinstance(branch_tasks, dict):
        branch_tasks = [branch_tasks]

    branch_results = []
    for task in branch_tasks:
        resolved = resolve_all_variables(workflow_results, task)
        res = await execute_fn(resolved, workflow_results)
        branch_results.append(res)

    return {"condition": result, "branch_results": branch_results}


async def _handle_switch(clean_task, workflow_results, execute_fn):
    switch_val = str(clean_task["value"])
    if switch_val in clean_task["cases"]:
        case_resolved = resolve_all_variables(
            workflow_results,
            clean_task["cases"][switch_val],
        )
        return await execute_fn(case_resolved, workflow_results)
    return await execute_fn(clean_task["default"], workflow_results)


def _check_loop_condition(clean_task, workflow_results, key):
    if key not in clean_task:
        return False
    resolved = resolve_all_variables(workflow_results, clean_task[key])
    return do_condition(resolved["left"], resolved["operator"], resolved["right"])


async def _handle_loop(clean_task, workflow_results, execute_fn):
    do_template = clean_task["do"]
    items = clean_task["items"]
    as_var = clean_task["as"]
    loop_results = []

    for item in items:
        workflow_results[as_var] = item

        if _check_loop_condition(clean_task, workflow_results, "skipIf"):
            del workflow_results[as_var]
            continue

        if _check_loop_condition(clean_task, workflow_results, "breakIf"):
            del workflow_results[as_var]
            break

        resolved_do = resolve_all_variables(
            workflow_results, do_template, skip_keys={"do", "skipIf", "breakIf"}
        )
        res = await execute_fn(resolved_do, workflow_results)
        loop_results.append(res)
        del workflow_results[as_var]

    return loop_results


async def execute_task(clean_task, workflow_results):
    task_type = clean_task["type"]

    handlers = {
        "print": lambda: do_print(clean_task["content"]),
        "calculate": lambda: do_calc(clean_task["operation"], *clean_task["numbers"]),
        "set": lambda: clean_task["value"],
    }

    if task_type in handlers:
        return handlers[task_type]()

    async_handlers = {
        "http": lambda: _handle_http(clean_task),
        "parallel": lambda: _handle_parallel(clean_task),
        "delay": lambda: do_delay(clean_task["seconds"]),
        "condition": lambda: _handle_condition(
            clean_task, workflow_results, execute_task
        ),
        "switch": lambda: _handle_switch(clean_task, workflow_results, execute_task),
        "loop": lambda: _handle_loop(clean_task, workflow_results, execute_task),
    }

    if task_type in async_handlers:
        return await async_handlers[task_type]()

    msg = f"Unknown task type: {task_type}"
    raise ValueError(msg)


@app.post("/execute")
async def execute_workflow(payload: WorkflowPayload):
    SKIP_KEYS_BY_TYPE = {  # noqa: N806
        "loop": {"do", "skipIf", "breakIf"},
        "switch": {"cases"},
        "condition": {"then_do", "else_do"},
    }

    workflow_results: dict[str, Any] = {}
    tasks = [task.model_dump(by_alias=True) for task in payload.tasks]

    workflow_log = []

    for task in tasks:
        task_type = task.get("type")
        skip_keys = SKIP_KEYS_BY_TYPE.get(task_type, set())

        try:
            clean_task = resolve_all_variables(
                workflow_results, task, skip_keys=skip_keys
            )

            workflow_results[task["name"]] = await execute_task(
                clean_task, workflow_results
            )

            workflow_log.append(
                {
                    "task": task["name"],
                    "type": task["type"],
                    "status": "success",
                    "result": workflow_results[task["name"]],
                }
            )

        except (ValueError, KeyError, TypeError, RuntimeError) as e:
            workflow_results[task["name"]] = {"error": str(e)}
            workflow_log.append(
                {
                    "task": task["name"],
                    "type": task["type"],
                    "status": "error",
                    "result": workflow_results[task["name"]],
                }
            )

    return {"results": workflow_results, "log": workflow_log}

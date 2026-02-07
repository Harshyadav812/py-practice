"""
Node Handlers - Maps node types to their execution logic.

Each handler:
- Receives: (params, input_data, engine)
- Returns: (result_data, output_index)
  - result_data: The output of this node
  - output_index: Which output port to follow (0 for most nodes, 0/1 for conditions)
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from .tasks import do_calc, do_condition, do_http, do_print

if TYPE_CHECKING:
    from workflow_engine import WorkflowEngine


# =============================================================================
# HANDLER FUNCTIONS
# Each handler returns (result, output_index)
# output_index determines which connection path to follow
# =============================================================================


async def handle_http(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """HTTP Request node."""
    timeout = params.get("timeout", 30)

    async with asyncio.timeout(timeout):
        result = await do_http(
            url=params["url"],
            method=params.get("method", "GET"),
            body=params.get("body"),
            headers=params.get("headers"),
            retries=params.get("retries", 0),
            retry_delay=params.get("retry_delay", 1),
        )

    return result, 0  # Always output 0 (single output)


async def handle_print(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """Print/Set node - returns content if provided, else returns input_data."""
    # check if user provided specific content to print
    content = params.get("content", params.get("text"))

    if content:
        result = do_print(content)
    else:
        print(f"--> [Node Input]: {input_data}")
        result = input_data

    return result, 0


async def handle_set(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """Set node - stores a value."""
    return params.get("value", params), 0


async def handle_calculate(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """Math operations node."""
    result = do_calc(params["operation"], *params["numbers"])
    return result, 0


async def handle_delay(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """Delay/Wait node."""
    seconds = params["seconds"]
    await asyncio.sleep(seconds)
    return f"Waited {seconds} seconds", 0


async def handle_condition(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """
    IF/Condition node - branches based on comparison.

    Returns:
    - output_index 0 = TRUE branch
    - output_index 1 = FALSE branch

    """
    # n8n style conditions are complex, simplified version:
    left = params.get("left", params.get("value1"))
    operator = params.get("operator", "==")
    right = params.get("right", params.get("value2"))

    result = do_condition(left, operator, right)

    # Return the boolean AND which output to follow
    output_index = 0 if result else 1
    return {"condition_result": result}, output_index


async def handle_switch(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """Switch node - routes to different outputs based on value."""
    value = str(params["value"])
    cases = params.get("cases", [])

    for i, case in enumerate(cases):
        if str(case) == value:
            return {"matched_case": case}, i

    # Default case (last output)
    return {"matched_case": "default"}, len(cases)


async def handle_merge(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """Merge node - combines data from multiple inputs."""
    return input_data, 0


async def handle_manual_trigger(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """Manual Trigger - starting point of workflow."""
    return {}, 0


async def handle_noop(
    params: dict, input_data: Any, engine: WorkflowEngine
) -> tuple[Any, int]:
    """No-op handler for unknown/unsupported nodes - passes through."""
    return input_data, 0


# =============================================================================
# HANDLER REGISTRY
# =============================================================================

SIMPLE_HANDLERS = {
    "print": handle_print,
    "set": handle_set,
    "calculate": handle_calculate,
    "http": handle_http,
    "delay": handle_delay,
    "condition": handle_condition,
    "if": handle_condition,
    "switch": handle_switch,
    "merge": handle_merge,
    "manual_trigger": handle_manual_trigger,
}

N8N_TYPE_MAPPING = {
    "n8n-nodes-base.httpRequest": handle_http,
    "n8n-nodes-base.set": handle_set,
    "n8n-nodes-base.if": handle_condition,
    "n8n-nodes-base.switch": handle_switch,
    "n8n-nodes-base.merge": handle_merge,
    "n8n-nodes-base.manualTrigger": handle_manual_trigger,
    "n8n-nodes-base.code": handle_noop,  # Placeholder
    "n8n-nodes-base.telegram": handle_noop,  # Placeholder
    "n8n-nodes-base.googleSheets": handle_noop,  # Placeholder
    "n8n-nodes-base.airtable": handle_noop,  # Placeholder
}


def get_handler(node_type: str):
    """Get handler for a node type. Returns handle_noop if not found."""
    if node_type in SIMPLE_HANDLERS:
        return SIMPLE_HANDLERS[node_type]
    if node_type in N8N_TYPE_MAPPING:
        return N8N_TYPE_MAPPING[node_type]
    return handle_noop

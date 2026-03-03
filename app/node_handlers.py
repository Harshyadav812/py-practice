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

from .tasks import (
    do_calc,
    do_condition,
    do_http,
    do_llm_call,
    do_print,
    do_safe_eval,
    do_text_template,
)

if TYPE_CHECKING:
    from app.workflow_executor import WorkflowExecutor


# =============================================================================
# HANDLER FUNCTIONS
# Each handler returns (result, output_index)
# output_index determines which connection path to follow
# =============================================================================


async def handle_http(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """HTTP Request node."""
    timeout = params.get("timeout", 60)

    result = await do_http(
        url=params["url"],
        method=params.get("method", "GET"),
        body=params.get("body"),
        headers=params.get("headers"),
        retries=params.get("retries", 0),
        retry_delay=params.get("retry_delay", 1),
        timeout=timeout,
    )

    return result, 0  # Always output 0 (single output)


async def handle_print(
    params: dict, input_data: Any, engine: WorkflowExecutor
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
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Set node - stores a value."""
    return params.get("value", params), 0


async def handle_calculate(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Math operations node."""
    operation = params.get("operation", "add")
    numbers = params.get("numbers", [0])
    if not isinstance(numbers, list):
        numbers = [0]
    result = do_calc(operation, *numbers)
    return result, 0


async def handle_delay(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Delay/Wait node. Capped at 300 seconds to prevent DoS."""
    MAX_DELAY_SECONDS = 300
    seconds = min(float(params.get("seconds", 0)), MAX_DELAY_SECONDS)
    if seconds < 0:
        seconds = 0
    await asyncio.sleep(seconds)
    return f"Waited {seconds} seconds", 0


async def handle_condition(
    params: dict, input_data: Any, engine: WorkflowExecutor
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
    params: dict, input_data: Any, engine: WorkflowExecutor
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
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Merge node - combines data from multiple incoming branches."""
    mode = params.get("mode", "append")

    # we currently have only 'append' mode, but n8n allows mutlitple
    # e.g. "Combine by position", "Combine by filed", "Choose branch"
    if mode == "append":
        # Flatten the list in case the incoming branches returned list themselves
        flattened = []
        if isinstance(input_data, list):
            for item in input_data:
                if isinstance(item, list):
                    flattened.extend(item)
                else:
                    flattened.append(item)
            return flattened, 0

    # Default: just return the list of collected inputs
    return input_data, 0


async def handle_manual_trigger(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Manual Trigger - starting point of workflow."""
    return {}, 0


async def handle_webhook_trigger(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Webhook Trigger - stores path info, passes through request data."""
    return {
        "path": params.get("path", "/webhook"),
        "method": params.get("method", "POST"),
        "body": input_data,
    }, 0


async def handle_code(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Code node - safely evaluate a Python expression."""
    expression = params.get("expression", "")
    fallback = params.get("fallback")

    if not expression:
        return input_data, 0

    try:
        result = do_safe_eval(expression, input_data)
        return result, 0
    except Exception as e:
        if fallback is not None:
            return fallback, 0
        return {"error": str(e)}, 0


async def handle_loop(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Loop node - iterates over a list and collects results."""
    max_iterations = int(params.get("maxIterations", 100))

    # The input should be a list (resolved by variable substitution)
    items = input_data
    if not isinstance(items, list):
        items = [items]

    # Limit iterations for safety
    items = items[:max_iterations]

    return {"items": items, "count": len(items)}, 0


async def handle_text_template(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """Text Template node - interpolates $ variables into a template string."""
    template = params.get("template", "")

    if not template:
        return input_data, 0

    result = do_text_template(template, engine.execution_state)
    return result, 0


def _resolve_llm_api_key(params: dict, engine: WorkflowExecutor) -> str:
    """Resolve API key from a saved credential. Plaintext api_key is not supported."""
    # Look up credential by ID (UUID sent from frontend dropdown)
    credential_id = params.get("credential", "")
    if credential_id and engine.credential_loader:
        try:
            cred_data = engine.load_credential(str(credential_id))
            return (
                cred_data.get("api_key", "")
                or cred_data.get("apiKey", "")
                or cred_data.get("token", "")
                or cred_data.get("key", "")
                or ""
            )
        except ValueError:
            return ""

    return ""


async def handle_llm_chat(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """LLM Chat node — send messages to any LLM provider."""
    provider = params.get("provider", "openai")
    api_key = _resolve_llm_api_key(params, engine)
    model = params.get("model") or None
    temperature = float(params.get("temperature", 0.7))
    max_tokens = int(params.get("max_tokens", 1024))
    base_url = params.get("base_url") or None

    # Build messages
    system_prompt = params.get("system_prompt", "")
    user_prompt = params.get("prompt", "")

    # If no explicit prompt, use input data from previous node
    if not user_prompt and input_data:
        user_prompt = str(input_data)

    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    result = await do_llm_call(
        provider=provider,
        api_key=api_key,
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        base_url=base_url,
    )

    return result, 0


async def handle_llm_classify(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """LLM Classify node — classify text into categories using an LLM."""
    provider = params.get("provider", "openai")
    api_key = _resolve_llm_api_key(params, engine)
    model = params.get("model") or None
    base_url = params.get("base_url") or None

    text_to_classify = params.get("text", "")
    if not text_to_classify and input_data:
        text_to_classify = str(input_data)

    categories = params.get("categories", [])
    categories_str = (
        ", ".join(str(c) for c in categories)
        if categories
        else "positive, negative, neutral"
    )

    system_prompt = (
        "You are a text classifier. Classify the given text into exactly one of "
        f"these categories: {categories_str}. "
        "Respond with ONLY the category name, nothing else."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": text_to_classify},
    ]

    result = await do_llm_call(
        provider=provider,
        api_key=api_key,
        messages=messages,
        model=model,
        temperature=0.0,
        max_tokens=50,
        base_url=base_url,
    )

    # Add classification metadata
    result["input_text"] = text_to_classify[:200]
    result["category"] = result.get("text", "").strip().lower()
    result["categories"] = categories

    return result, 0


async def handle_llm_summarize(
    params: dict, input_data: Any, engine: WorkflowExecutor
) -> tuple[Any, int]:
    """LLM Summarize node — summarize text using an LLM."""
    provider = params.get("provider", "openai")
    api_key = _resolve_llm_api_key(params, engine)
    model = params.get("model") or None
    base_url = params.get("base_url") or None
    max_length = params.get("max_length", "2-3 sentences")
    style = params.get("style", "concise")

    text_to_summarize = params.get("text", "")
    if not text_to_summarize and input_data:
        text_to_summarize = str(input_data)

    system_prompt = (
        f"You are a text summarizer. Summarize the given text in a {style} style. "
        f"Keep the summary to approximately {max_length}. "
        "Focus on the most important information."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": text_to_summarize},
    ]

    result = await do_llm_call(
        provider=provider,
        api_key=api_key,
        messages=messages,
        model=model,
        temperature=0.3,
        max_tokens=500,
        base_url=base_url,
    )

    result["original_length"] = len(text_to_summarize)
    result["summary"] = result.get("text", "")

    return result, 0


async def handle_noop(
    params: dict, input_data: Any, engine: WorkflowExecutor
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
    "webhook": handle_webhook_trigger,
    "code": handle_code,
    "loop": handle_loop,
    "text_template": handle_text_template,
    "llm_chat": handle_llm_chat,
    "llm_classify": handle_llm_classify,
    "llm_summarize": handle_llm_summarize,
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
    """Get handler for a node type. Returns None if not found."""
    if node_type in SIMPLE_HANDLERS:
        return SIMPLE_HANDLERS[node_type]
    if node_type in N8N_TYPE_MAPPING:
        return N8N_TYPE_MAPPING[node_type]
    return None

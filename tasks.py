import asyncio
import re

import httpx


def do_print(content):
    return content


def do_calc(op: str = "add", *args):
    """Perform math operations on a list of numbers."""
    if not args:
        return 0

    # Convert all args to float for consistent math
    try:
        nums = [float(n) for n in args]
    except (ValueError, TypeError) as e:
        msg = f"Cannot convert to number: {args}. Error: {e}"
        raise ValueError(msg) from e

    match op:
        case "add":
            total: float = 0.0
            for num in nums:
                total += num
            return total

        case "sub":
            res = nums[0]
            for num in nums[1:]:
                res -= num
            return res

        case "mul":
            res = nums[0]
            for num in nums[1:]:
                res *= num
            return res

        case "divide":
            res = nums[0]
            for num in nums[1:]:
                if num == 0:
                    raise ValueError("Division by zero")
                res /= num
            return res

        case _:
            err_msg = f"Unknown operation: {op}. Valid: add, sub, mul, divide"
            raise ValueError(err_msg)


def do_condition(left, operator, right):
    """Evaluate a condition. Attempts numeric comparison if both sides look like numbers."""

    # Try to convert to numbers for comparison if both look numeric
    def try_numeric(val):
        if isinstance(val, (int, float)):
            return val
        if isinstance(val, str):
            try:
                return float(val)
            except ValueError:
                return val
        return val

    left_val = try_numeric(left)
    right_val = try_numeric(right)

    match operator:
        case "<":
            return left_val < right_val
        case ">":
            return left_val > right_val
        case "==":
            return left_val == right_val
        case "!=":
            return left_val != right_val
        case ">=":
            return left_val >= right_val
        case "<=":
            return left_val <= right_val
        case _:
            err_msg = f"Invalid operator: {operator}. Valid: <, >, ==, !=, >=, <="
            raise ValueError(err_msg)


async def do_http(url, method="GET", body=None, headers=None, retries=0, retry_delay=1):
    """Make HTTP requests with retry support, headers, and timeout."""

    if headers is None:
        headers = {}

    async with httpx.AsyncClient() as client:
        last_exception = None

        for attempt in range(retries + 1):
            try:
                match method.upper():
                    case "GET":
                        response = await client.get(url, headers=headers)
                    case "POST":
                        response = await client.post(url, json=body, headers=headers)
                    case "PUT":
                        response = await client.put(url, json=body, headers=headers)
                    case "PATCH":
                        response = await client.patch(url, json=body, headers=headers)
                    case "DELETE":
                        response = await client.delete(url, headers=headers)
                    case _:
                        raise ValueError(f"Unsupported HTTP method: {method}")

                # Handle non-JSON responses gracefully
                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type:
                    return response.json()
                else:
                    return {
                        "status_code": response.status_code,
                        "text": response.text,
                        "headers": dict(response.headers),
                    }

            except httpx.TimeoutException as e:
                last_exception = e
                if attempt < retries:
                    print(
                        f"Request timed out. Retrying in {retry_delay}s... (attempt {attempt + 1}/{retries + 1})"
                    )
                    await asyncio.sleep(retry_delay)
                else:
                    raise ValueError(
                        f"Request to {url} timed out after {retries + 1} attempts"
                    )

            except Exception as e:
                last_exception = e
                if attempt < retries:
                    print(
                        f"Request failed: {e}. Retrying in {retry_delay}s... (attempt {attempt + 1}/{retries + 1})"
                    )
                    await asyncio.sleep(retry_delay)
                else:
                    raise last_exception


async def do_fetch_all(urls):
    async with httpx.AsyncClient() as client:
        tasks = [client.get(url) for url in urls]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        results = []
        for response in responses:
            if isinstance(response, Exception):
                results.append({"error": str(response)})
            else:
                results.append(response.json())

        return results


async def do_delay(seconds):
    await asyncio.sleep(seconds)
    return f"Waited {seconds} seconds"


def get_value_from_path(workflow_results, path: str):
    """Navigate nested data structures using dot notation.

    Examples:
      $step_1 -> workflow_results['step_1']
      $step_1.data.0.name -> workflow_results['step_1']['data'][0]['name']

    """  # noqa: D213
    original_path: str = path

    path: str = path.removeprefix("$")

    parts: list[str] = path.split(".")
    root_key: str = parts[0]

    if root_key not in workflow_results:
        available = list(workflow_results.keys())
        msg = (
            f"Variable '{original_path}' not found. "
            f"'{root_key}' doesn't exist. Available: {available}"
        )
        raise ValueError(msg)

    current_val = workflow_results.get(root_key)

    for i, part in enumerate(parts[1:], start=1):
        current_path = ".".join(parts[: i + 1])

        if isinstance(current_val, list):
            if part.isdigit():
                idx = int(part)
                if idx >= len(current_val):
                    msg = (
                        f"Variable '{original_path}' failed at '{current_path}': "
                        f"Index {idx} out of range (list has {len(current_val)} items)"
                    )
                    raise ValueError(msg)
                current_val = current_val[idx]
            else:
                msg = (
                    f"Variable '{original_path}' failed at '{current_path}': "
                    f"Expected numeric index for list, got '{part}'"
                )
                raise ValueError(msg)

        elif isinstance(current_val, dict):
            if part not in current_val:
                available = list(current_val.keys())
                msg = (
                    f"Variable '{original_path}' failed at '{current_path}': "
                    f"Key '{part}' not found. Available: {available}"
                )
                raise ValueError(msg)
            current_val = current_val[part]

        else:
            msg = (
                f"Variable '{original_path}' failed at '{current_path}': "
                f"Cannot access '{part}' on {type(current_val).__name__}"
            )
            raise ValueError(msg)

    return current_val


def resolve_all_variables(workflow_results, task, skip_keys=None):
    if skip_keys is None:
        skip_keys = set()

    # if it's a dict, look at every value inside it
    if isinstance(task, dict):
        return {
            k: task[k]
            if k in skip_keys
            else resolve_all_variables(workflow_results, v, skip_keys)
            for k, v in task.items()
        }

    # if it's a list look at every item in the list
    if isinstance(task, list):
        return [
            resolve_all_variables(workflow_results, item, skip_keys) for item in task
        ]

    # if it's a str, use get_value_from_path() function to revole the path
    if isinstance(task, str) and "$" in task:
        if re.fullmatch(r"\$[\w.]+", task):
            return get_value_from_path(workflow_results, task)

        else:

            def resolve_template_string(match):
                var_path = match.group(0)
                resolved = get_value_from_path(workflow_results, var_path)

                return str(resolved)

            return re.sub(r"\$[\w.]+", resolve_template_string, task)

    # otherwise just return the task, as is
    return task

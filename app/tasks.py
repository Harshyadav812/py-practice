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
                        msg = f"Unsupported HTTP method: {method}"
                        raise ValueError(msg)

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
                    msg = f"Request to {url} timed out after {retries + 1} attempts"
                    raise ValueError(msg)

            except Exception as e:
                last_exception = e
                if attempt < retries:
                    print(
                        f"Request failed: {e}. Retrying in {retry_delay}s... (attempt {attempt + 1}/{retries + 1})"
                    )
                    await asyncio.sleep(retry_delay)
                else:
                    raise last_exception
    return None


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
    """
    Navigate nested data structures using dot notation or brackets.

    Matches:
      $Node.prop
      $'Node Name'.prop
      $Node['prop']
      $Node[0]
    """
    original_path = path
    path = path.removeprefix("$")

    # 1. Parse tokens ("Lenient Parser")
    # Matches: "Quoted String" OR Word/Digits
    # This effectively ignores dots and brackets, capturing only the keys/indices
    parts = re.findall(r"['\"]([^'\"]+)['\"]|([\w]+)", path)

    # Flatten matches from [('Key', ''), ('', '0')] to ['Key', '0']
    clean_parts = [p[0] or p[1] for p in parts]

    if not clean_parts:
        return path

    # 2. Traverse
    current_val = workflow_results
    root_node = clean_parts[0]

    if root_node not in current_val:
        available = list(current_val.keys())
        msg = f"Variable '{root_node}' not found. Available: {available}"
        raise ValueError(msg)

    current_val = current_val[root_node]

    for part in clean_parts[1:]:
        # Handle Dictionary Access
        if isinstance(current_val, dict):
            if part in current_val:
                current_val = current_val[part]
                continue
            else:
                msg = f"Key '{part}' not found in {original_path}"
                raise ValueError(msg)

        # Handle List Access (Array Index)
        elif isinstance(current_val, list) and part.isdigit():
            try:
                current_val = current_val[int(part)]
                continue
            except IndexError:
                msg = f"Index {part} out of bounds in {original_path}"
                raise ValueError(msg)

        msg = f"Cannot access '{part}' on {type(current_val)} in {original_path}"
        raise ValueError(msg)

    return current_val


def resolve_all_variables(workflow_results, task):
    """Recursively resolve $ variables in a task configuration."""
    # 1. Recursive Dict Resolution
    if isinstance(task, dict):
        return {k: resolve_all_variables(workflow_results, v) for k, v in task.items()}

    # 2. Recursive List Resolution
    if isinstance(task, list):
        return [resolve_all_variables(workflow_results, item) for item in task]

    # 3. String Resolution
    if isinstance(task, str) and "$" in task:
        # Regex Breakdown:
        # \$(?: ... )             -> Start with $
        # (?:['"][^'"]+['"]|[\w]+)-> Root (Quoted Name OR SimpleName)
        # (?: ... )*              -> Property Chain (0 or more):
        #   (?:\.[\w]+)              -> Dot property (.name)
        #   |(?:\[['"][^'"]+['"]\])  -> Bracket String Key (['key'])
        #   |(?:\[\d+\])             -> Bracket Number Index ([0]) <--- Added this

        pattern = r"\$(?:(?:['\"][^'\"]+['\"])|(?:[\w]+))(?:(?:\.[\w]+)|(?:\[['\"][^'\"]+['\"]\])|(?:\[\d+\]))*"

        # Case A: Strict Variable (Return raw type, e.g., int, list)
        if re.fullmatch(pattern, task):
            return get_value_from_path(workflow_results, task)

        # Case B: Template String (Replace inside text, force string)
        else:

            def resolve_template_string(match):
                try:
                    var_path = match.group(0)
                    resolved = get_value_from_path(workflow_results, var_path)
                    return str(resolved)
                except ValueError:
                    # Keep original text if resolution fails (e.g. "$100 USD")
                    return match.group(0)

            return re.sub(pattern, resolve_template_string, task)

    return task

"""
Pydantic schemas for workflow task validation.

Uses discriminated unions based on the 'type' field to efficiently
validate different task types with their specific required fields.
"""

from typing import Annotated, Literal, Union, Any, Optional
from pydantic import BaseModel, Field


# =============================================================================
# CONDITION SCHEMA (reused in loop's skipIf/breakIf)
# =============================================================================

class ConditionSchema(BaseModel):
    """Schema for condition expressions used in condition task and loop control."""
    left: Any                                          # Can be a value or $variable
    operator: Literal['<', '>', '==', '!=', '>=', '<=']
    right: Any                                         # Can be a value or $variable


# =============================================================================
# TASK SCHEMAS - Each task type has its own model
# =============================================================================

class PrintTask(BaseModel):
    """
    Prints/returns content. Supports template strings like "Value is $step_1".
    
    Example:
        {"name": "greet", "type": "print", "content": "Hello $user_name!"}
    """
    name: str
    type: Literal['print']                             # Discriminator value
    content: Any                                       # String or $variable


class CalculateTask(BaseModel):
    """
    Performs mathematical operations on numbers.
    
    Example:
        {"name": "sum", "type": "calculate", "operation": "add", "numbers": [10, "$step_1"]}
    """
    name: str
    type: Literal['calculate']
    operation: Literal['add', 'sub', 'mul', 'divide']
    numbers: list[Any]                                 # Can contain numbers or $variables


class HttpTask(BaseModel):
    """
    Makes HTTP requests. Supports GET/POST/PUT/PATCH/DELETE with headers, body, and retry logic.
    
    Example:
        {
            "name": "fetch_data",
            "type": "http",
            "url": "https://api.example.com/data",
            "method": "POST",
            "headers": {"Authorization": "Bearer $secrets.API_KEY"},
            "body": {"user_id": "$step_1"},
            "retries": 3,
            "retry_delay": 2,
            "timeout": 30
        }
    """
    name: str
    type: Literal['http']
    url: Any                                           # String or $variable
    method: Literal['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] = 'GET'
    headers: Optional[dict[str, Any]] = None           # HTTP headers
    body: Optional[dict[str, Any]] = None
    retries: int = Field(default=0, ge=0)              # ge=0 means >= 0
    retry_delay: int = Field(default=1, ge=0)
    timeout: int = Field(default=30, ge=1, le=300)     # 1-300 seconds


class ConditionTask(BaseModel):
    """
    Evaluates a condition and returns true/false.
    
    Example:
        {"name": "is_large", "type": "condition", "left": "$step_1", "operator": ">", "right": 100}
    """
    name: str
    type: Literal['condition']
    left: Any
    operator: Literal['<', '>', '==', '!=', '>=', '<=']
    right: Any


class SetTask(BaseModel):
    """
    Sets/stores a value. Useful for transforming or aliasing data.
    
    Example:
        {"name": "user_id", "type": "set", "value": "$api_response.data.id"}
    """
    name: str
    type: Literal['set']
    value: Any


class DelayTask(BaseModel):
    """
    Pauses execution for a specified number of seconds.
    
    Example:
        {"name": "wait", "type": "delay", "seconds": 5}
    """
    name: str
    type: Literal['delay']
    seconds: int = Field(ge=0)                         # Must be >= 0


class SwitchTask(BaseModel):
    """
    Routes execution based on a value (like a switch statement).
    The 'cases' dict maps values to sub-tasks. 'default' runs if no match.
    
    Note: 'cases' is in SKIP_KEYS_BY_TYPE because it contains unresolved sub-tasks.
    
    Example:
        {
            "name": "router",
            "type": "switch",
            "value": "$step_1",
            "cases": {
                "30": {"type": "print", "content": "Value is 30"},
                "50": {"type": "print", "content": "Value is 50"}
            },
            "default": {"type": "print", "content": "Unknown value"}
        }
    """
    name: str
    type: Literal['switch']
    value: Any                                         # The value to switch on
    cases: dict[str, dict[str, Any]]                   # Maps string keys to sub-tasks
    default: dict[str, Any]                            # Sub-task if no case matches


class LoopTask(BaseModel):
    """
    Iterates over an array, executing 'do' for each item.
    Supports skipIf (continue) and breakIf (break) conditions.
    
    Note: 'do', 'skipIf', 'breakIf' are in SKIP_KEYS_BY_TYPE because they
    contain $variables that reference the loop variable (e.g., $current_item).
    
    Example:
        {
            "name": "process_users",
            "type": "loop",
            "items": "$api_response.users",
            "as": "user",
            "skipIf": {"left": "$user.active", "operator": "==", "right": false},
            "do": {"type": "print", "content": "Processing $user.name"}
        }
    """
    name: str
    type: Literal['loop']
    items: Any                                         # Array or $variable resolving to array
    as_: str = Field(alias='as')                       # 'as' is Python keyword, use alias
    do: dict[str, Any]                                 # Sub-task to execute per item
    skipIf: Optional[ConditionSchema] = None           # Skip this item if true
    breakIf: Optional[ConditionSchema] = None          # Stop loop if true

    model_config = {
        'populate_by_name': True                       # Allows both 'as' and 'as_'
    }


class ParallelTask(BaseModel):
    """
    Executes multiple HTTP requests concurrently using asyncio.gather().
    
    Example:
        {
            "name": "fetch_all",
            "type": "parallel",
            "tasks": [
                {"type": "http", "url": "https://api1.com"},
                {"type": "http", "url": "https://api2.com"}
            ]
        }
    """
    name: str
    type: Literal['parallel']
    tasks: list[dict[str, Any]]                        # List of HTTP task configs


# =============================================================================
# DISCRIMINATED UNION - Pydantic picks the right model based on 'type'
# =============================================================================

Task = Annotated[
    Union[
        PrintTask,
        CalculateTask,
        HttpTask,
        ConditionTask,
        SetTask,
        DelayTask,
        SwitchTask,
        LoopTask,
        ParallelTask,
    ],
    Field(discriminator='type')
]
"""
Union of all task types. Pydantic uses the 'type' field as a discriminator
to efficiently validate against the correct model.
"""


# =============================================================================
# WORKFLOW PAYLOAD - The top-level schema for the /execute endpoint
# =============================================================================

class WorkflowPayload(BaseModel):
    """
    The complete workflow payload containing a list of tasks to execute.
    
    Example:
        {
            "tasks": [
                {"name": "step_1", "type": "calculate", "operation": "add", "numbers": [10, 20]},
                {"name": "step_2", "type": "print", "content": "Result: $step_1"}
            ]
        }
    """
    tasks: list[Task]

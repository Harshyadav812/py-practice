"""
Backward-compatible facade.

External callers (API routes, tests) can keep using::

    engine = WorkflowEngine(workflow=payload, session=session, ...)
    await engine.run()

Internally it delegates to ``WorkflowGraph`` + ``WorkflowExecutor``.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlmodel import Session

from app.credential_loader import CredentialLoader
from app.workflow_executor import WorkflowExecutor
from app.workflow_graph import WorkflowGraph

if TYPE_CHECKING:
    from app.models.execution_node import ExecutionNode
    from app.schemas.nodes import WorkflowPayload


class WorkflowEngine:
    """Drop-in replacement that preserves the existing constructor API."""

    def __init__(  # noqa: PLR0913
        self,
        workflow: WorkflowPayload,
        session: Session | None = None,
        user_id: UUID | None = None,
        workflow_id: UUID | None = None,
        prior_state: dict[str, ExecutionNode] | None = None,
        resume_from: str | None = None,
    ) -> None:
        self.workflow = workflow
        self.session = session
        self.user_id = user_id
        self.workflow_id = workflow_id

        # Build the pure graph once
        self.graph = WorkflowGraph(workflow)

        # Build credential loader (optional)
        credential_loader = (
            CredentialLoader(session, user_id) if session and user_id else None
        )

        # Build the executor
        self._executor = WorkflowExecutor(
            graph=self.graph,
            credential_loader=credential_loader,
            workflow_id=workflow_id,
            user_id=user_id,
            prior_state=prior_state,
            resume_from=resume_from,
        )

    # Expose execution_state for any code that reads it directly
    @property
    def execution_state(self) -> dict[str, Any]:
        return self._executor.execution_state

    @property
    def start_node_name(self) -> str | None:
        return self.graph.trigger_node_name

    def rename_node(self, current_name: str, new_name: str) -> None:
        """Rename a node — delegates to the graph."""
        self.graph.rename_node(current_name, new_name)

    async def run_stream(self) -> AsyncGenerator[str, None]:
        async for event in self._executor.run_stream():
            yield event

    async def run(self) -> dict[str, Any]:
        return await self._executor.run()

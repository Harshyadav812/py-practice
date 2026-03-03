"""Backward-compatible facade.

External callers (API routes, tests) can keep using::

    engine = WorkflowEngine(workflow=payload, session=session, user_id=uid, workflow_id=wid)
    await engine.run()

Internally it delegates to WorkflowGraph + WorkflowExecutor.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from sqlmodel import Session

from app.credential_loader import CredentialLoader
from app.models.execution_node import ExecutionNode
from app.schemas.nodes import WorkflowPayload
from app.workflow_executor import NODE_EXECUTION_TIMEOUT, SKIP_SIGNAL, WorkflowExecutor
from app.workflow_graph import WorkflowGraph

# Re-export for backward compatibility
__all__ = [
    "WorkflowEngine",
    "WorkflowGraph",
    "WorkflowExecutor",
    "CredentialLoader",
    "SKIP_SIGNAL",
    "NODE_EXECUTION_TIMEOUT",
]

logger = logging.getLogger(__name__)


class WorkflowEngine:
    """Thin facade that preserves backward compatibility."""

    def __init__(
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

        self.graph = WorkflowGraph(workflow)

        # Raise early if no trigger found (preserve old constructor contract)
        if not self.graph.trigger_node_name:
            raise ValueError(
                "Invalid Workflow: No trigger node found (manual_trigger or webhook)."
            )

        self.credential_loader = (
            CredentialLoader(session, user_id) if session and user_id else None
        )

        self._executor = WorkflowExecutor(
            graph=self.graph,
            credential_loader=self.credential_loader,
            prior_state=prior_state,
            resume_from=resume_from,
            workflow_id=workflow_id,
            user_id=user_id,
        )

    # ------------------------------------------------------------------
    # Backward-compat properties
    # ------------------------------------------------------------------

    @property
    def execution_state(self) -> dict[str, Any]:
        return self._executor.execution_state

    @property
    def node_map(self):
        return self.graph.nodes

    # ------------------------------------------------------------------
    # Public API — delegate to executor
    # ------------------------------------------------------------------

    def run_stream(self) -> AsyncGenerator[str, None]:
        """Run the workflow and stream events as NDJSON (SSE-friendly)."""
        return self._executor.run_stream()

    async def run(self) -> dict[str, Any]:
        """Convenience wrapper: run and return the final state."""
        final_state: dict[str, Any] = {}
        async for chunk in self.run_stream():
            data = json.loads(chunk.strip())
            if data["type"] == "workflow_end":
                final_state = data["results"]
        return final_state

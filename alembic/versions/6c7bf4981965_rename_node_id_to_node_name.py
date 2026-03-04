"""
rename node_id to node_name.

Revision ID: 6c7bf4981965
Revises: 29786148c766
Create Date: 2026-02-28 01:58:20.251595
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6c7bf4981965"
down_revision: str | Sequence[str] | None = "29786148c766"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column("execution_node", "node_id", new_column_name="node_name")
    op.drop_index(op.f("ix_execution_node_node_id"), table_name="execution_node")
    op.create_index(
        op.f("ix_execution_node_node_name"),
        "execution_node",
        ["node_name"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("execution_node", "node_name", new_column_name="node_id")
    op.drop_index(op.f("ix_execution_node_node_name"), table_name="execution_node")
    op.create_index(
        op.f("ix_execution_node_node_id"), "execution_node", ["node_id"], unique=False
    )

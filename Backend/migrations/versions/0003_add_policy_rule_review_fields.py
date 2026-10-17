"""Add review metadata to policy rules."""

from alembic import op
import sqlalchemy as sa

revision = "0003_policy_rule_review"
down_revision = "0002_add_password_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "policy_rules",
        sa.Column(
            "requires_review",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "policy_rules",
        sa.Column(
            "review_notes",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("policy_rules", "review_notes")
    op.drop_column("policy_rules", "requires_review")

"""Add password hash to users for email/password authentication."""

from alembic import op
import sqlalchemy as sa

revision = "0002_add_password_hash"
down_revision = "0001_versioning_auth_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_hash")

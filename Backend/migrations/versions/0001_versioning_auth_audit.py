"""Add policy versions, tenant identity, activation events, and decision audits.

Revision ID: 0001_versioning_auth_audit
Revises:
Create Date: 2026-10-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_versioning_auth_audit"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(length=255), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=255), primary_key=True),
        sa.Column("email", sa.String(length=320)),
        sa.Column("name", sa.String(length=255)),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "organization_memberships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.String(length=255),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(length=255),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "organization_id",
            "user_id",
            name="uq_membership_organization_user",
        ),
        sa.CheckConstraint(
            "role IN ('owner', 'admin', 'editor', 'viewer')",
            name="ck_membership_role",
        ),
    )
    op.create_index(
        "ix_organization_memberships_organization_id",
        "organization_memberships",
        ["organization_id"],
    )
    op.create_index(
        "ix_organization_memberships_user_id",
        "organization_memberships",
        ["user_id"],
    )
    op.create_table(
        "policy_groups",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "organization_id",
            sa.String(length=255),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_policy_groups_organization_id",
        "policy_groups",
        ["organization_id"],
    )

    op.add_column("policies", sa.Column("policy_group_id", sa.String(length=36)))
    op.add_column(
        "policies",
        sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "policies",
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
    )
    op.add_column(
        "policies",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("policies", sa.Column("created_by_user_id", sa.String(length=255)))
    op.add_column("policies", sa.Column("activated_by_user_id", sa.String(length=255)))
    op.add_column("policies", sa.Column("activated_at", sa.DateTime()))
    op.add_column(
        "policies",
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.execute(
        sa.text(
            "INSERT INTO organizations (id, name, status) "
            "VALUES ('legacy', 'Legacy workspace', 'active')"
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO policy_groups (id, organization_id, name) "
            "SELECT '00000000-0000-0000-0000-' || LPAD(id::text, 12, '0'), "
            "'legacy', LEFT(COALESCE(filename, 'Legacy policy'), 255) "
            "FROM policies"
        )
    )
    op.execute(
        sa.text(
            "UPDATE policies SET "
            "policy_group_id = '00000000-0000-0000-0000-' || LPAD(id::text, 12, '0'), "
            "version_number = 1, status = 'draft', is_active = false"
        )
    )

    op.alter_column("policies", "policy_group_id", nullable=False)
    op.create_foreign_key(
        "fk_policies_policy_group_id",
        "policies",
        "policy_groups",
        ["policy_group_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_policies_created_by_user_id",
        "policies",
        "users",
        ["created_by_user_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_policies_activated_by_user_id",
        "policies",
        "users",
        ["activated_by_user_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "uq_policy_group_version",
        "policies",
        ["policy_group_id", "version_number"],
    )
    op.create_check_constraint(
        "ck_policy_status",
        "policies",
        "status IN ('uploaded', 'processing', 'draft', 'pending_review', "
        "'active', 'superseded', 'failed', 'archived')",
    )
    op.create_index("ix_policies_policy_group_id", "policies", ["policy_group_id"])
    op.create_index(
        "uq_policy_group_active_version",
        "policies",
        ["policy_group_id"],
        unique=True,
        postgresql_where=sa.text("is_active IS TRUE"),
        sqlite_where=sa.text("is_active = 1"),
    )
    op.create_unique_constraint(
        "uq_policy_rule_id",
        "policy_rules",
        ["policy_id", "rule_id"],
    )
    op.create_table(
        "policy_activation_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "policy_group_id",
            sa.String(length=36),
            sa.ForeignKey("policy_groups.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "policy_id",
            sa.Integer(),
            sa.ForeignKey("policies.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "replaced_policy_id",
            sa.Integer(),
            sa.ForeignKey("policies.id", ondelete="RESTRICT"),
        ),
        sa.Column(
            "actor_user_id",
            sa.String(length=255),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_policy_activation_events_policy_group_id",
        "policy_activation_events",
        ["policy_group_id"],
    )
    op.create_table(
        "decision_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("request_id", sa.String(length=36), nullable=False, unique=True),
        sa.Column(
            "organization_id",
            sa.String(length=255),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("policy_group_id", sa.String(length=36), sa.ForeignKey("policy_groups.id")),
        sa.Column("policy_version_id", sa.Integer(), sa.ForeignKey("policies.id")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("decision_status", sa.String(length=32), nullable=False),
        sa.Column("decision_outcome", sa.String(length=255), nullable=False),
        sa.Column("decision_reason", sa.Text(), nullable=False),
        sa.Column("input_snapshot", sa.JSON(), nullable=False),
        sa.Column("rules_evaluated", sa.JSON(), nullable=False),
        sa.Column("matched_rule_ids", sa.JSON(), nullable=False),
        sa.Column("engine_version", sa.String(length=64), nullable=False),
        sa.Column("request_source", sa.String(length=100), nullable=False),
        sa.Column("actor_user_id", sa.String(length=255), sa.ForeignKey("users.id")),
    )
    op.create_index("ix_decision_logs_request_id", "decision_logs", ["request_id"])
    op.create_index("ix_decision_logs_organization_id", "decision_logs", ["organization_id"])
    op.create_index("ix_decision_logs_created_at", "decision_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_decision_logs_created_at", table_name="decision_logs")
    op.drop_index("ix_decision_logs_organization_id", table_name="decision_logs")
    op.drop_index("ix_decision_logs_request_id", table_name="decision_logs")
    op.drop_table("decision_logs")
    op.drop_index(
        "ix_policy_activation_events_policy_group_id",
        table_name="policy_activation_events",
    )
    op.drop_table("policy_activation_events")
    op.drop_constraint("uq_policy_rule_id", "policy_rules", type_="unique")
    op.drop_index("uq_policy_group_active_version", table_name="policies")
    op.drop_index("ix_policies_policy_group_id", table_name="policies")
    op.drop_constraint("ck_policy_status", "policies", type_="check")
    op.drop_constraint("uq_policy_group_version", "policies", type_="unique")
    op.drop_constraint("fk_policies_activated_by_user_id", "policies", type_="foreignkey")
    op.drop_constraint("fk_policies_created_by_user_id", "policies", type_="foreignkey")
    op.drop_constraint("fk_policies_policy_group_id", "policies", type_="foreignkey")
    op.drop_column("policies", "updated_at")
    op.drop_column("policies", "activated_at")
    op.drop_column("policies", "activated_by_user_id")
    op.drop_column("policies", "created_by_user_id")
    op.drop_column("policies", "is_active")
    op.drop_column("policies", "status")
    op.drop_column("policies", "version_number")
    op.drop_column("policies", "policy_group_id")
    op.drop_index("ix_policy_groups_organization_id", table_name="policy_groups")
    op.drop_table("policy_groups")
    op.drop_index("ix_organization_memberships_user_id", table_name="organization_memberships")
    op.drop_index(
        "ix_organization_memberships_organization_id",
        table_name="organization_memberships",
    )
    op.drop_table("organization_memberships")
    op.drop_table("users")
    op.drop_table("organizations")

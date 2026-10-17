from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class OrganizationRecord(Base):
    __tablename__ = "organizations"

    id = Column(String(255), primary_key=True)
    name = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    memberships = relationship("OrganizationMembershipRecord", back_populates="organization")
    policy_groups = relationship("PolicyGroupRecord", back_populates="organization")


class UserRecord(Base):
    __tablename__ = "users"

    id = Column(String(255), primary_key=True)
    email = Column(String(320))
    password_hash = Column(String(255), nullable=True)
    name = Column(String(255))
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    memberships = relationship("OrganizationMembershipRecord", back_populates="user")


class OrganizationMembershipRecord(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_membership_organization_user"),
        CheckConstraint(
            "role IN ('owner', 'admin', 'editor', 'viewer')",
            name="ck_membership_role",
        ),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(
        String(255),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        String(255),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(32), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    organization = relationship("OrganizationRecord", back_populates="memberships")
    user = relationship("UserRecord", back_populates="memberships")


class PolicyGroupRecord(Base):
    __tablename__ = "policy_groups"

    id = Column(String(36), primary_key=True)
    organization_id = Column(
        String(255),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    organization = relationship("OrganizationRecord", back_populates="policy_groups")
    versions = relationship("PolicyRecord", back_populates="policy_group")


class PolicyRecord(Base):
    __tablename__ = "policies"
    __table_args__ = (
        UniqueConstraint(
            "policy_group_id",
            "version_number",
            name="uq_policy_group_version",
        ),
        CheckConstraint(
            "status IN ('uploaded', 'processing', 'draft', 'pending_review', "
            "'active', 'superseded', 'failed', 'archived')",
            name="ck_policy_status",
        ),
        Index(
            "uq_policy_group_active_version",
            "policy_group_id",
            unique=True,
            postgresql_where=Column("is_active").is_(True),
            sqlite_where=Column("is_active").is_(True),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    policy_group_id = Column(
        String(36),
        ForeignKey("policy_groups.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False, default=1)
    filename = Column(String(255), nullable=False)
    pages = Column(Integer, nullable=False, default=0)
    characters = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="processing")
    is_active = Column(Boolean, nullable=False, default=False)
    created_by_user_id = Column(String(255), ForeignKey("users.id"))
    activated_by_user_id = Column(String(255), ForeignKey("users.id"))
    activated_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    policy_group = relationship("PolicyGroupRecord", back_populates="versions")
    rules = relationship(
        "PolicyRuleRecord",
        back_populates="policy",
        cascade="all, delete-orphan",
    )


class PolicyRuleRecord(Base):
    __tablename__ = "policy_rules"
    __table_args__ = (
        UniqueConstraint("policy_id", "rule_id", name="uq_policy_rule_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    policy_id = Column(
        Integer,
        ForeignKey("policies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    rule_id = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    conditions = Column(JSON, nullable=False, default=list)
    decision = Column(String(255), nullable=False)
    reason = Column(Text, nullable=False, default="")
    priority = Column(Integer, nullable=False, default=0)
    source = Column(Text, nullable=False, default="")

    requires_review = Column(Boolean, nullable=False, default=False)
    review_notes = Column(JSON, nullable=False, default=list)

    policy = relationship("PolicyRecord", back_populates="rules")


class PolicyActivationEventRecord(Base):
    __tablename__ = "policy_activation_events"

    id = Column(Integer, primary_key=True)
    policy_group_id = Column(
        String(36),
        ForeignKey("policy_groups.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    policy_id = Column(
        Integer,
        ForeignKey("policies.id", ondelete="RESTRICT"),
        nullable=False,
    )
    replaced_policy_id = Column(Integer, ForeignKey("policies.id", ondelete="RESTRICT"))
    actor_user_id = Column(String(255), ForeignKey("users.id"), nullable=False)
    action = Column(String(32), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class DecisionLogRecord(Base):
    __tablename__ = "decision_logs"

    id = Column(String(36), primary_key=True)
    request_id = Column(String(36), nullable=False, unique=True, index=True)
    organization_id = Column(
        String(255),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    policy_group_id = Column(String(36), ForeignKey("policy_groups.id"))
    policy_version_id = Column(Integer, ForeignKey("policies.id"))
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    decision_status = Column(String(32), nullable=False)
    decision_outcome = Column(String(255), nullable=False)
    decision_reason = Column(Text, nullable=False)
    input_snapshot = Column(JSON, nullable=False, default=dict)
    rules_evaluated = Column(JSON, nullable=False, default=list)
    matched_rule_ids = Column(JSON, nullable=False, default=list)
    engine_version = Column(String(64), nullable=False)
    request_source = Column(String(100), nullable=False, default="api")
    actor_user_id = Column(String(255), ForeignKey("users.id"))

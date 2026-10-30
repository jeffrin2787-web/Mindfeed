"""add phone verification and social interaction tables

Revision ID: 7b4d2a91c0ef
Revises: 4a31d537292e
Create Date: 2026-10-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "7b4d2a91c0ef"
down_revision = "4a31d537292e"
branch_labels = None
depends_on = None


def _table_names():
    return set(inspect(op.get_bind()).get_table_names())


def _index_names(table):
    return {item["name"] for item in inspect(op.get_bind()).get_indexes(table)}


def upgrade():
    tables = _table_names()
    if "phone_verifications" not in tables:
        op.create_table(
            "phone_verifications",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("phone", sa.String(24), nullable=False),
            sa.Column("otp_hash", sa.String(128), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("user_id", name="uq_phone_verifications_user_id"),
            sa.UniqueConstraint("phone", name="uq_phone_verifications_phone"),
        )
    if "post_comments" not in tables:
        op.create_table(
            "post_comments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("content", sa.String(1000), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "saved_posts" not in tables:
        op.create_table(
            "saved_posts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("post_id", "user_id", name="uq_saved_post_user"),
        )
    if "user_follows" not in tables:
        op.create_table(
            "user_follows",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("follower_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("followed_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("follower_id", "followed_id", name="uq_user_follow"),
        )
    tables = _table_names()
    for table, columns in {
        "phone_verifications": ["user_id", "phone"],
        "post_comments": ["post_id", "user_id"],
        "saved_posts": ["post_id", "user_id"],
        "user_follows": ["follower_id", "followed_id"],
    }.items():
        if table in tables:
            existing = _index_names(table)
            for col in columns:
                name = f"ix_{table}_{col}"
                if name not in existing:
                    op.create_index(name, table, [col], unique=False)


def downgrade():
    # These tables contain only the new social/verification data. Existing user/post data is untouched.
    for table in ("user_follows", "saved_posts", "post_comments", "phone_verifications"):
        if table in _table_names():
            op.drop_table(table)

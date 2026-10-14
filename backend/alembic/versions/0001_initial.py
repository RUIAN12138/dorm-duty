"""Initial six-table schema; frozen definitions independent from evolving application models."""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(32), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("nickname", sa.String(32), nullable=False),
        sa.Column("current_dorm_id", sa.Integer),
        sa.Column("push_enabled", sa.Boolean, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "dormitories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("invite_code", sa.String(16), nullable=False, unique=True),
        sa.Column("admin_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("rotation_order", sa.JSON, nullable=False),
        sa.Column("rotation_start_date", sa.Date, nullable=False),
        sa.Column("deadline_time", sa.String(5), nullable=False),
        sa.Column("task_text", sa.String(200), nullable=False),
        sa.Column("schedule_version", sa.Integer, nullable=False),
    )
    with op.batch_alter_table("users") as batch:
        batch.create_foreign_key("fk_user_dorm", "dormitories", ["current_dorm_id"], ["id"])
    op.create_table(
        "dorm_members",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("dorm_id", sa.Integer, sa.ForeignKey("dormitories.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False),
        sa.Column("joined_at", sa.DateTime, nullable=False),
        sa.Column("left_at", sa.DateTime),
        sa.UniqueConstraint("dorm_id", "user_id"),
        sa.CheckConstraint("role IN ('admin','member')"),
    )
    op.create_table(
        "duty_tasks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("dorm_id", sa.Integer, sa.ForeignKey("dormitories.id"), nullable=False),
        sa.Column("duty_date", sa.Date, nullable=False),
        sa.Column("assignee_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assignee_name_snapshot", sa.String(32), nullable=False),
        sa.Column("task_text", sa.String(200), nullable=False),
        sa.Column("deadline_at", sa.DateTime, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("completed_at", sa.DateTime),
        sa.Column("is_override", sa.Boolean, nullable=False),
        sa.UniqueConstraint("dorm_id", "duty_date"),
        sa.CheckConstraint("status IN ('pending','completed')"),
    )
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("dorm_id", sa.Integer, sa.ForeignKey("dormitories.id")),
        sa.Column("task_id", sa.Integer, sa.ForeignKey("duty_tasks.id")),
        sa.Column("reminder_kind", sa.String(32), nullable=False),
        sa.Column("scheduled_at", sa.DateTime, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("read_at", sa.DateTime),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("body", sa.String(300), nullable=False),
        sa.Column("dedupe_key", sa.String(120), nullable=False, unique=True),
        sa.Column("is_cancelled", sa.Boolean, nullable=False),
        sa.Column("delivery_state", sa.JSON, nullable=False),
    )
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("endpoint", sa.String(2048), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(256), nullable=False),
        sa.Column("auth", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False),
    )
    for table, column in [
        ("dorm_members", "dorm_id"),
        ("duty_tasks", "dorm_id"),
        ("notifications", "user_id"),
        ("push_subscriptions", "user_id"),
    ]:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table in ["push_subscriptions", "notifications", "duty_tasks", "dorm_members"]:
        op.drop_table(table)
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("fk_user_dorm", type_="foreignkey")
    op.drop_table("dormitories")
    op.drop_table("users")

"""Custom scheduling rules with backwards-compatible defaults."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("dormitories", sa.Column("schedule_rules", sa.JSON, nullable=False, server_default="{}"))


def downgrade():
    with op.batch_alter_table("dormitories") as batch:
        batch.drop_column("schedule_rules")

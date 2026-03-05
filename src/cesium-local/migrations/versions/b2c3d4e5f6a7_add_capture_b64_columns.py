"""add capture_image_b64 and capture_model_b64 to projects

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-05 09:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('projects')]
    if 'capture_image_b64' not in columns:
        op.add_column('projects', sa.Column('capture_image_b64', sa.Text(), nullable=True))
    if 'capture_model_b64' not in columns:
        op.add_column('projects', sa.Column('capture_model_b64', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('projects', 'capture_model_b64')
    op.drop_column('projects', 'capture_image_b64')

"""add panels_json to projects

Revision ID: a1b2c3d4e5f6
Revises: 83efbbc64b74
Create Date: 2026-03-05 06:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '83efbbc64b74'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('projects')]
    if 'panels_json' not in columns:
        op.add_column('projects', sa.Column('panels_json', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('projects', 'panels_json')

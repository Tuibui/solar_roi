"""initial schema

Revision ID: 9499407a2570
Revises: 
Create Date: 2026-02-25 03:11:22.904222

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9499407a2570'
down_revision = None
branch_labels = None
depends_on = None


def _table_exists(name):
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": name})
    return result.scalar()


def upgrade():
    if _table_exists('users'):
        return

    op.create_table('users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('username', sa.String(80), unique=True, nullable=False),
        sa.Column('email', sa.String(120), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(256), nullable=False),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
    )

    op.create_table('projects',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('latitude', sa.Float()),
        sa.Column('longitude', sa.Float()),
        sa.Column('address', sa.String(500)),
        sa.Column('shading_method', sa.String(20), server_default='ratio'),
        sa.Column('shading_ratio', sa.Float(), server_default='0.8'),
        sa.Column('shading_level', sa.String(20)),
        sa.Column('monthly_kwh', sa.Float()),
        sa.Column('annual_kwh', sa.Float()),
        sa.Column('tariff_price', sa.Float(), server_default='4.5'),
        sa.Column('tariff_currency', sa.String(10), server_default='THB'),
        sa.Column('grid_export_allowed', sa.Boolean(), server_default='true'),
        sa.Column('grid_export_price', sa.Float()),
        sa.Column('system_type', sa.String(20), server_default='auto'),
        sa.Column('selected_roof_index', sa.Integer(), server_default='0'),
        sa.Column('capture_image_path', sa.String(300)),
        sa.Column('capture_model_path', sa.String(300)),
        sa.Column('inverters_json', sa.Text()),
        sa.Column('batteries_json', sa.Text()),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
    )

    op.create_table('roofs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('index', sa.Integer(), nullable=False),
        sa.Column('tilt', sa.Float()),
        sa.Column('azimuth', sa.Float()),
        sa.Column('area', sa.Float()),
        sa.Column('panel_width', sa.Float()),
        sa.Column('panel_height', sa.Float()),
        sa.Column('panel_area', sa.Float()),
        sa.Column('color_name', sa.String(20)),
        sa.Column('is_flat', sa.Boolean(), server_default='false'),
        sa.Column('needs_user_input', sa.Boolean(), server_default='false'),
        sa.Column('user_tilt', sa.Float()),
        sa.Column('user_azimuth', sa.Float()),
        sa.Column('polygon_json', sa.Text()),
        sa.Column('created_at', sa.DateTime()),
    )

    op.create_table('appliances',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('power', sa.Float(), nullable=False),
        sa.Column('quantity', sa.Integer(), server_default='1'),
        sa.Column('usage_start', sa.String(5), server_default='06:00'),
        sa.Column('usage_end', sa.String(5), server_default='22:00'),
        sa.Column('created_at', sa.DateTime()),
    )


def downgrade():
    op.drop_table('appliances')
    op.drop_table('roofs')
    op.drop_table('projects')
    op.drop_table('users')

"""add equipment catalog tables

Revision ID: 83efbbc64b74
Revises: 9499407a2570
Create Date: 2026-03-04 16:14:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '83efbbc64b74'
down_revision = '9499407a2570'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()

    if 'solar_panels' not in existing:
        op.create_table('solar_panels',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('brand', sa.String(100), nullable=False, index=True),
            sa.Column('model', sa.String(200), nullable=False),
            sa.Column('power_w', sa.Integer(), nullable=False),
            sa.Column('efficiency', sa.Float(), nullable=False),
            sa.Column('voc', sa.Float()),
            sa.Column('isc', sa.Float()),
            sa.Column('vmp', sa.Float()),
            sa.Column('imp', sa.Float()),
            sa.Column('length_mm', sa.Integer()),
            sa.Column('width_mm', sa.Integer()),
            sa.Column('weight_kg', sa.Float()),
            sa.Column('price_usd', sa.Float()),
        )

    if 'inverters' not in existing:
        op.create_table('inverters',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('brand', sa.String(100), nullable=False, index=True),
            sa.Column('model', sa.String(200), nullable=False),
            sa.Column('power_kw', sa.Float(), nullable=False),
            sa.Column('max_dc_voltage', sa.Integer()),
            sa.Column('mppt_count', sa.Integer()),
            sa.Column('efficiency', sa.Float()),
            sa.Column('phase', sa.String(10)),
            sa.Column('price_usd', sa.Float()),
        )

    if 'batteries' not in existing:
        op.create_table('batteries',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('brand', sa.String(100), nullable=False, index=True),
            sa.Column('model', sa.String(200), nullable=False),
            sa.Column('capacity_kwh', sa.Float(), nullable=False),
            sa.Column('voltage', sa.Integer()),
            sa.Column('chemistry', sa.String(20)),
            sa.Column('cycle_life', sa.Integer()),
            sa.Column('max_discharge_kw', sa.Float()),
            sa.Column('price_usd', sa.Float()),
        )


def downgrade():
    op.drop_table('batteries')
    op.drop_table('inverters')
    op.drop_table('solar_panels')

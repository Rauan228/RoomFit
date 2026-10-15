"""Persistent photo generation queue and spending ledger; additive migration.

Revision ID: 20261015_photo_furniture
Revises: b528018698f8
"""
from alembic import op
from roomfit.photo_models import PhotoJob, PhotoCharge, PhotoLock

revision = "20261015_photo_furniture"
down_revision = "b528018698f8"
branch_labels = None
depends_on = None


def upgrade():
    for table in (PhotoJob.__table__, PhotoCharge.__table__, PhotoLock.__table__):
        table.create(op.get_bind(), checkfirst=True)


def downgrade():
    for table in (PhotoLock.__table__, PhotoCharge.__table__, PhotoJob.__table__):
        table.drop(op.get_bind(), checkfirst=True)

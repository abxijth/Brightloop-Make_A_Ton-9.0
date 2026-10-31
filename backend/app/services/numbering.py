"""Human-readable business numbers generated from PostgreSQL sequences.

The database sequences are the source of truth, so two requests can never
receive the same number. Gaps are acceptable: a rolled-back invoice still
consumes its number.
"""

from sqlalchemy import Sequence, select
from sqlalchemy.orm import Session

from app.models.invoice import invoice_number_seq
from app.models.subscription import subscription_number_seq

_SUBSCRIPTION_PREFIX = "SUB"
_INVOICE_PREFIX = "INV"
_PADDING = 4


def _next_value(db: Session, sequence: Sequence) -> int:
    return int(db.execute(select(sequence.next_value())).scalar_one())


def _format(prefix: str, value: int) -> str:
    return f"{prefix}-{str(value).zfill(_PADDING)}"


def next_subscription_number(db: Session) -> str:
    """Return the next number in the SUB-0001 series."""
    return _format(_SUBSCRIPTION_PREFIX, _next_value(db, subscription_number_seq))


def next_invoice_number(db: Session) -> str:
    """Return the next number in the INV-0001 series."""
    return _format(_INVOICE_PREFIX, _next_value(db, invoice_number_seq))

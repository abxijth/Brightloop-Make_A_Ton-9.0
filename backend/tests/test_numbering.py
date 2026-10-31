import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.numbering import next_invoice_number, next_subscription_number


def _restart(db: Session, sequence: str, value: int) -> None:
    # ALTER SEQUENCE takes no bind parameters; value is a test-controlled int.
    db.execute(text(f"ALTER SEQUENCE {sequence} RESTART WITH {value}"))


def test_subscription_numbers_start_at_one(db: Session) -> None:
    _restart(db, "subscription_number_seq", 1)
    assert next_subscription_number(db) == "SUB-0001"


def test_invoice_numbers_start_at_one(db: Session) -> None:
    _restart(db, "invoice_number_seq", 1)
    assert next_invoice_number(db) == "INV-0001"


def test_numbers_increment_within_a_series(db: Session) -> None:
    _restart(db, "subscription_number_seq", 41)
    assert next_subscription_number(db) == "SUB-0041"
    assert next_subscription_number(db) == "SUB-0042"


def test_numbers_grow_past_the_padding(db: Session) -> None:
    _restart(db, "invoice_number_seq", 9999)
    assert next_invoice_number(db) == "INV-9999"
    assert next_invoice_number(db) == "INV-10000"


def test_series_use_their_own_prefix(db: Session) -> None:
    _restart(db, "subscription_number_seq", 7)
    _restart(db, "invoice_number_seq", 7)
    assert re.fullmatch(r"SUB-\d{4,}", next_subscription_number(db))
    assert re.fullmatch(r"INV-\d{4,}", next_invoice_number(db))

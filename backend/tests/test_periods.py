from datetime import date

import pytest

from app.services.periods import BILLING_PERIODS, advance_period, period_end


@pytest.mark.parametrize(
    ("start", "period", "expected"),
    [
        (date(2026, 1, 31), "daily", date(2026, 2, 1)),
        (date(2026, 12, 31), "daily", date(2027, 1, 1)),
        (date(2026, 1, 1), "weekly", date(2026, 1, 8)),
        (date(2026, 1, 31), "monthly", date(2026, 2, 28)),
        (date(2024, 1, 31), "monthly", date(2024, 2, 29)),
        (date(2026, 3, 31), "monthly", date(2026, 4, 30)),
        (date(2026, 5, 15), "monthly", date(2026, 6, 15)),
        (date(2026, 12, 15), "monthly", date(2027, 1, 15)),
        (date(2024, 2, 29), "yearly", date(2025, 2, 28)),
        (date(2026, 3, 1), "yearly", date(2027, 3, 1)),
        (date(2026, 12, 31), "yearly", date(2027, 12, 31)),
    ],
)
def test_advance_period(start: date, period: str, expected: date) -> None:
    assert advance_period(start, period) == expected


@pytest.mark.parametrize(
    ("start", "period", "expected"),
    [
        (date(2026, 1, 31), "daily", date(2026, 1, 31)),
        (date(2026, 1, 1), "weekly", date(2026, 1, 7)),
        (date(2026, 1, 31), "monthly", date(2026, 2, 27)),
        (date(2024, 1, 31), "monthly", date(2024, 2, 28)),
        (date(2024, 2, 29), "yearly", date(2025, 2, 27)),
    ],
)
def test_period_end_is_inclusive(start: date, period: str, expected: date) -> None:
    assert period_end(start, period) == expected


def test_unknown_period_is_rejected() -> None:
    with pytest.raises(ValueError, match="fortnightly"):
        advance_period(date(2026, 1, 1), "fortnightly")


def test_billing_periods_lists_the_supported_values() -> None:
    assert BILLING_PERIODS == ("daily", "weekly", "monthly", "yearly")

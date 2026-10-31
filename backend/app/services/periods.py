"""Billing period arithmetic.

Invoice periods are inclusive: a monthly invoice starting on 2026-01-31 covers
2026-01-31 through 2026-02-27, and the next period starts on 2026-02-28. Month
and year steps clamp to the last valid day, so a period starting on the 31st
never skips a short month.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Literal

BillingPeriod = Literal["daily", "weekly", "monthly", "yearly"]

BILLING_PERIODS: tuple[BillingPeriod, ...] = ("daily", "weekly", "monthly", "yearly")

_DAYS_PER_PERIOD = {"daily": 1, "weekly": 7}


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year, month = divmod(month_index, 12)
    year += value.year
    month += 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def advance_period(start: date, period: str) -> date:
    """Return the first day of the period that follows the one starting on ``start``."""
    if period in _DAYS_PER_PERIOD:
        return start + timedelta(days=_DAYS_PER_PERIOD[period])
    if period == "monthly":
        return _add_months(start, 1)
    if period == "yearly":
        return _add_months(start, 12)
    raise ValueError(f"Unknown billing period: {period!r}")


def period_end(start: date, period: str) -> date:
    """Return the last day covered by the period starting on ``start`` (inclusive)."""
    return advance_period(start, period) - timedelta(days=1)

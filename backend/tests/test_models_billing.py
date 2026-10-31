from sqlalchemy.orm import configure_mappers

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.db import Base
from app.models.invoice import invoice_number_seq


def _table(name: str):
    return Base.metadata.tables[name]


def _constraint_names(name: str) -> set[str]:
    return {c.name for c in _table(name).constraints if c.name}


def _index_names(name: str) -> set[str]:
    return {i.name for i in _table(name).indexes}


def _index(table_name: str, index_name: str):
    return next(i for i in _table(table_name).indexes if i.name == index_name)


def _foreign_key(table_name: str, column_name: str):
    return next(iter(_table(table_name).c[column_name].foreign_keys))


def test_models_configure_cleanly() -> None:
    configure_mappers()


def test_billing_tables_are_registered() -> None:
    expected = {"invoices", "invoice_lines", "payments", "outbox"}
    assert expected <= set(Base.metadata.tables)


def test_invoices_are_unique_per_subscription_period() -> None:
    assert "uq_invoices_subscription_period" in _constraint_names("invoices")


def test_invoice_checks() -> None:
    assert {
        "ck_invoices_period_end_after_start",
        "ck_invoices_total_non_negative",
        "ck_invoices_amount_paid_within_total",
    } <= _constraint_names("invoices")


def test_invoice_indexes_match_the_data_model() -> None:
    assert {
        "ix_invoices_status_due_date",
        "ix_invoices_customer_id",
        "ix_invoices_issue_date",
    } <= _index_names("invoices")


def test_invoice_foreign_keys() -> None:
    assert (
        _foreign_key("invoices", "subscription_id").target_fullname
        == "subscriptions.id"
    )
    assert _foreign_key("invoices", "customer_id").target_fullname == "customers.id"


def test_invoice_and_line_enum_names() -> None:
    assert _table("invoices").c.status.type.name == "invoice_status"
    assert _table("invoice_lines").c.line_type.type.name == "invoice_line_type"


def test_invoice_lines_cascade_with_their_invoice() -> None:
    assert _foreign_key("invoice_lines", "invoice_id").ondelete == "CASCADE"


def test_a_discount_rule_applies_once_per_invoice() -> None:
    index = _index("invoice_lines", "uq_invoice_lines_invoice_discount")
    assert index.unique is True
    where = index.dialect_options["postgresql"]["where"]
    assert where is not None
    assert "line_type = 'discount'" in str(where)


def test_invoice_line_discount_rule_index() -> None:
    assert "ix_invoice_lines_discount_rule_id" in _index_names("invoice_lines")
    assert (
        _foreign_key("invoice_lines", "discount_rule_id").target_fullname
        == "discount_rules.id"
    )


def test_payment_checks_indexes_and_foreign_keys() -> None:
    assert "ck_payments_amount_positive" in _constraint_names("payments")
    assert {"ix_payments_invoice_id", "ix_payments_payment_date"} <= _index_names(
        "payments"
    )
    assert _foreign_key("payments", "invoice_id").target_fullname == "invoices.id"
    assert _foreign_key("payments", "customer_id").target_fullname == "customers.id"
    assert _foreign_key("payments", "recorded_by_id").target_fullname == "users.id"


def test_outbox_email_fields() -> None:
    assert _table("outbox").c.type.type.name == "email_type"
    assert _foreign_key("outbox", "invoice_id").target_fullname == "invoices.id"


def test_invoice_number_sequence_is_registered() -> None:
    assert invoice_number_seq.name == "invoice_number_seq"
    assert invoice_number_seq.metadata is Base.metadata

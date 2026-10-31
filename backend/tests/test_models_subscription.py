from sqlalchemy.orm import configure_mappers

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.db import Base
from app.models.subscription import subscription_number_seq


def _table(name: str):
    return Base.metadata.tables[name]


def _constraint_names(name: str) -> set[str]:
    return {c.name for c in _table(name).constraints if c.name}


def _index_names(name: str) -> set[str]:
    return {i.name for i in _table(name).indexes}


def _foreign_key(table_name: str, column_name: str):
    return next(iter(_table(table_name).c[column_name].foreign_keys))


def test_models_configure_cleanly() -> None:
    configure_mappers()


def test_subscription_tables_are_registered() -> None:
    expected = {
        "quotation_templates",
        "quotation_template_lines",
        "subscriptions",
        "subscription_lines",
    }
    assert expected <= set(Base.metadata.tables)


def test_subscription_number_is_unique() -> None:
    assert "uq_subscriptions_number" in _constraint_names("subscriptions")


def test_subscription_indexes_match_the_data_model() -> None:
    assert {
        "ix_subscriptions_status_next_billing_date",
        "ix_subscriptions_customer_id",
    } <= _index_names("subscriptions")


def test_subscription_expiry_must_not_precede_start() -> None:
    assert "ck_subscriptions_expiry_after_start" in _constraint_names("subscriptions")


def test_subscription_foreign_keys() -> None:
    assert _foreign_key("subscriptions", "customer_id").target_fullname == "customers.id"
    assert _foreign_key("subscriptions", "plan_id").target_fullname == "plans.id"


def test_subscription_status_enum_name() -> None:
    assert _table("subscriptions").c.status.type.name == "subscription_status"


def test_subscription_lines_cascade_with_their_subscription() -> None:
    assert _foreign_key("subscription_lines", "subscription_id").ondelete == "CASCADE"
    assert (
        "ck_subscription_lines_quantity_positive"
        in _constraint_names("subscription_lines")
    )


def test_quotation_constraints() -> None:
    assert (
        "ck_quotation_templates_validity_days_positive"
        in _constraint_names("quotation_templates")
    )
    assert (
        "ck_quotation_template_lines_quantity_positive"
        in _constraint_names("quotation_template_lines")
    )


def test_subscription_number_sequence_is_registered() -> None:
    assert subscription_number_seq.name == "subscription_number_seq"
    assert subscription_number_seq.metadata is Base.metadata

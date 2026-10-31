from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    STAFF = "staff"
    CUSTOMER = "customer"


class BillingPeriod(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class SubscriptionStatus(str, Enum):
    DRAFT = "draft"
    QUOTATION = "quotation"
    CONFIRMED = "confirmed"
    ACTIVE = "active"
    CLOSED = "closed"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    PAID = "paid"
    CANCELLED = "cancelled"


class InvoiceLineType(str, Enum):
    PRODUCT = "product"
    DISCOUNT = "discount"


class PaymentMethod(str, Enum):
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    CARD = "card"
    ONLINE = "online"
    OTHER = "other"


class ValueType(str, Enum):
    PERCENT = "percent"
    FIXED = "fixed"


class DiscountScope(str, Enum):
    SUBSCRIPTION = "subscription"
    PRODUCT = "product"


class EmailType(str, Enum):
    PASSWORD_RESET = "password_reset"
    INVOICE = "invoice"


def enum_values(enum_class: type[Enum]) -> list[str]:
    """Return the stored database values for a Python enum."""
    return [member.value for member in enum_class]

"""Demo data for Brightloop.

Run from ``backend/`` after ``alembic upgrade head``:

    python seed.py            # seed an empty database
    python seed.py --reset    # wipe every table first, then seed

Creates logins (admin, staff, three customers), the catalog (taxes, products,
variants, plans, quotation templates, discount rules), and a large, believable
history: thousands of subscriptions, many due for billing today, plus invoices
and payments with a mix of paid, partial, overdue, draft and cancelled.

The output is deterministic (fixed random seed), so every run gives the same
demo. Invoice maths mirrors ``app.services.billing`` so seeded invoices look
exactly like ones the billing run would create.
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from dataclasses import dataclass, field
from datetime import date, datetime, time as dtime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, insert, select, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.config import settings
from app.db import Base, SessionLocal
from app.models import (
    Customer,
    DiscountRule,
    DiscountScope,
    EmailType,
    Invoice,
    InvoiceLine,
    InvoiceLineType,
    InvoiceStatus,
    Outbox,
    PasswordResetToken,
    Payment,
    PaymentMethod,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    QuotationTemplateLine,
    Subscription,
    SubscriptionLine,
    SubscriptionStatus,
    Tax,
    User,
    UserRole,
    ValueType,
)
from app.models.enums import BillingPeriod
from app.security import hash_password
from app.services.periods import advance_period, period_end

# ---------------------------------------------------------------- settings --

SEED = 20260131
TODAY = date.today()
CUSTOMER_COUNT = 400
SUBSCRIPTION_COUNT = 3000
DUE_SHARE = 0.14  # share of active subscriptions that are due for billing today

ADMIN = ("admin@brightloop.com", "Admin@123", "Asha Admin")
STAFF = ("staff@brightloop.com", "Staff@123", "Sam Staff")
CUSTOMER_PASSWORD = "Customer@123"
DEMO_CUSTOMERS = [  # (login email, name, company)
    ("acme@example.com", "Priya Sharma", "Acme Robotics"),
    ("globex@example.com", "Daniel Okafor", "Globex Logistics"),
    ("initech@example.com", "Mei Tanaka", "Initech Systems"),
]

CENT = Decimal("0.01")
HUNDRED = Decimal("100")
ZERO = Decimal("0.00")
rng = random.Random(SEED)


def money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def at(day: date, hour: int = 9) -> datetime:
    return datetime.combine(day, dtime(hour, 0), tzinfo=timezone.utc)


def stamps(day: date) -> dict:
    moment = min(at(day), datetime.now(timezone.utc))
    return {"created_at": moment, "updated_at": moment}


def bulk(db: Session, model, rows: list[dict]) -> list[int]:
    """Insert rows in bulk and return their ids in the same order."""
    ids: list[int] = []
    for start in range(0, len(rows), 5000):
        result = db.execute(
            insert(model).returning(model.id, sort_by_parameter_order=True),
            rows[start : start + 5000],
        )
        ids.extend(row[0] for row in result)
    return ids


# ------------------------------------------------------------ static data --

TAXES = [  # key, name, type, value
    ("gst18", "GST 18%", ValueType.PERCENT, "18.00"),
    ("gst5", "GST 5%", ValueType.PERCENT, "5.00"),
    ("levy", "Service levy", ValueType.FIXED, "2.00"),
]

PRODUCTS = [  # key, name, type, price, tax key, variants [(attr, value, extra)]
    ("crm", "CRM Suite", "Software", "49.00", "gst18",
     [("Edition", "Standard", "0"), ("Edition", "Professional", "30"), ("Edition", "Enterprise", "90")]),
    ("host", "Cloud Hosting", "Service", "25.00", "gst18",
     [("Tier", "Basic", "0"), ("Tier", "Plus", "15"), ("Tier", "Max", "40")]),
    ("support", "Premium Support", "Service", "15.00", "gst18", []),
    ("analytics", "Analytics Add-on", "Software", "20.00", "gst18", []),
    ("security", "Email Security", "Software", "8.00", "gst5", []),
    ("backup", "Backup Storage", "Service", "12.00", "gst18",
     [("Size", "100 GB", "0"), ("Size", "1 TB", "25")]),
    ("training", "Training Credits", "Service", "100.00", "gst5", []),
    ("setup", "Onboarding Pack", "Service", "50.00", "levy", []),
]

PLANS = [  # key, name, price, period, min qty, from, to, auto_close, early_close, active, weight
    ("monthly", "Monthly Standard", "49.00", BillingPeriod.MONTHLY, 1, date(2024, 1, 1), None, False, True, True, 55),
    ("yearly", "Yearly Standard", "490.00", BillingPeriod.YEARLY, 1, date(2024, 1, 1), None, False, False, True, 12),
    ("weekly", "Weekly Starter", "12.00", BillingPeriod.WEEKLY, 1, date(2024, 1, 1), None, False, True, True, 8),
    ("team", "Team Monthly", "199.00", BillingPeriod.MONTHLY, 3, date(2024, 1, 1), None, False, True, True, 18),
    ("daily", "Daily Sandbox", "2.00", BillingPeriod.DAILY, 1, date(2024, 1, 1), None, False, False, True, 1),
    ("summer", "Summer Promo", "39.00", BillingPeriod.MONTHLY, 1, TODAY - timedelta(days=60),
     TODAY + timedelta(days=45), True, False, True, 6),
    ("legacy", "Legacy Monthly (retired)", "35.00", BillingPeriod.MONTHLY, 1, date(2024, 1, 1),
     date(2025, 12, 31), False, False, False, 0),
]

# Max days back a new subscription on this plan can start (keeps invoice counts sane).
START_SPAN = {"monthly": 240, "yearly": 730, "weekly": 56, "team": 240, "daily": 9, "summer": 55}

TEMPLATES = [  # name, plan key, validity days, [(product key, variant value or None, qty)]
    ("Starter CRM", "monthly", 30, [("crm", "Standard", 1), ("support", None, 1)]),
    ("Team Workspace", "team", 15, [("crm", "Professional", 3), ("analytics", None, 3), ("security", None, 3)]),
    ("Enterprise Annual", "yearly", 60, [("crm", "Enterprise", 5), ("host", "Max", 1), ("backup", "1 TB", 1)]),
]

FIRST = ["Aarav", "Olivia", "Liam", "Sofia", "Noah", "Ananya", "Mateo", "Isla", "Ethan", "Zara",
         "Lucas", "Hana", "Arjun", "Emma", "Omar", "Chloe", "Kabir", "Nora", "Felix", "Leila",
         "Ravi", "Maya", "Diego", "Ines", "Jonas", "Amara", "Yusuf", "Elena", "Tariq", "Grace"]
LAST = ["Patel", "Nguyen", "Smith", "Garcia", "Kim", "Okonkwo", "Rossi", "Silva", "Khan", "Müller",
        "Brown", "Ivanov", "Costa", "Singh", "Lopez", "Haddad", "Novak", "Reyes", "Sato", "Walker"]
CO_A = ["Blue", "North", "Bright", "Atlas", "Nimbus", "Vertex", "Orbit", "Summit", "Cobalt", "Ember",
        "Harbor", "Lumen", "Quartz", "Zenith", "Pioneer", "Cedar", "Falcon", "Maple", "Helix", "Delta"]
CO_B = ["Labs", "Works", "Logistics", "Systems", "Studios", "Foods", "Retail", "Energy", "Health",
        "Media", "Partners", "Analytics", "Mobility", "Textiles", "Capital"]
STREETS = ["Market St", "Park Ave", "Lake Rd", "Station Rd", "High St", "Mill Ln", "Ocean Dr", "Elm St"]
CITIES = ["Austin", "Berlin", "Bengaluru", "Lisbon", "Toronto", "Singapore", "Dublin", "Nairobi", "Sydney", "Oslo"]
TERMS = [(7, 15), (15, 40), (30, 35), (45, 10)]  # (payment_terms_days, weight)
METHODS = [PaymentMethod.BANK_TRANSFER, PaymentMethod.CARD, PaymentMethod.ONLINE,
           PaymentMethod.CASH, PaymentMethod.OTHER]
METHOD_WEIGHTS = [35, 25, 25, 8, 7]


# ------------------------------------------------------------- data shapes --

@dataclass
class LineSpec:
    product_id: int
    variant_id: int | None
    description: str
    quantity: int
    unit_price: Decimal
    tax_name: str | None
    tax_kind: ValueType | None
    tax_value: Decimal | None


@dataclass
class PaymentSpec:
    method: PaymentMethod
    amount: Decimal
    payment_date: date
    note: str | None
    recorded_by_id: int | None


@dataclass
class InvoiceSpec:
    period_start: date
    period_end: date
    status: InvoiceStatus
    issue_date: date
    due_date: date
    product_lines: list[dict]
    discount_line: dict | None
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    payments: list[PaymentSpec] = field(default_factory=list)

    @property
    def amount_paid(self) -> Decimal:
        return sum((p.amount for p in self.payments), ZERO)


@dataclass
class SubSpec:
    customer_idx: int
    plan_key: str
    status: SubscriptionStatus
    start_date: date
    expiry_date: date | None
    terms: int
    next_billing_date: date | None
    lines: list[LineSpec]
    force: str | None = None  # "overdue" | "open" (demo customers)
    invoices: list[InvoiceSpec] = field(default_factory=list)
    number: str = ""


@dataclass
class Catalog:
    taxes: dict[str, Tax]
    products: dict[str, Product]
    variants: dict[tuple[str, str], ProductVariant]
    plans: dict[str, Plan]
    percent_rule: DiscountRule


# ----------------------------------------------------------------- reset ---

def reset_database(db: Session) -> None:
    names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    db.execute(text("ALTER SEQUENCE subscription_number_seq RESTART WITH 1"))
    db.execute(text("ALTER SEQUENCE invoice_number_seq RESTART WITH 1"))


# ---------------------------------------------------------------- seeders ---

def seed_users(db: Session) -> dict[str, User]:
    users = {}
    for key, (email, password, name, role) in {
        "admin": (*ADMIN, UserRole.ADMIN),
        "staff": (*STAFF, UserRole.STAFF),
    }.items():
        users[key] = User(email=email, password_hash=hash_password(password), full_name=name, role=role)
    customer_hash = hash_password(CUSTOMER_PASSWORD)
    for email, name, _ in DEMO_CUSTOMERS:
        users[email] = User(email=email, password_hash=customer_hash, full_name=name, role=UserRole.CUSTOMER)
    db.add_all(users.values())
    db.flush()
    return users


def seed_catalog(db: Session) -> Catalog:
    taxes = {k: Tax(name=n, type=t, value=Decimal(v)) for k, n, t, v in TAXES}
    db.add_all(taxes.values())
    db.flush()

    products: dict[str, Product] = {}
    variants: dict[tuple[str, str], ProductVariant] = {}
    for key, name, kind, price, tax_key, variant_defs in PRODUCTS:
        product = Product(name=name, type=kind, sales_price=Decimal(price), tax_id=taxes[tax_key].id)
        for attribute, value, extra in variant_defs:
            variant = ProductVariant(attribute=attribute, value=value, extra_price=Decimal(extra))
            product.variants.append(variant)
            variants[(key, value)] = variant
        products[key] = product
    db.add_all(products.values())

    plans = {
        key: Plan(name=name, price=Decimal(price), billing_period=period, min_quantity=min_qty,
                  available_from=start, available_to=end, auto_close=auto_close,
                  allow_early_close=early, is_active=active)
        for key, name, price, period, min_qty, start, end, auto_close, early, active, _ in PLANS
    }
    db.add_all(plans.values())
    db.flush()

    for name, plan_key, validity, lines in TEMPLATES:
        template = QuotationTemplate(name=name, plan_id=plans[plan_key].id, validity_days=validity)
        for product_key, variant_value, quantity in lines:
            variant = variants.get((product_key, variant_value)) if variant_value else None
            template.lines.append(
                QuotationTemplateLine(
                    product_id=products[product_key].id,
                    variant_id=variant.id if variant else None,
                    quantity=quantity,
                )
            )
        db.add(template)

    percent_rule = DiscountRule(
        name="Loyalty 10% off", type=ValueType.PERCENT, value=Decimal("10"), min_purchase=Decimal("200"),
        start_date=date(2024, 1, 1), scope=DiscountScope.SUBSCRIPTION,
    )
    db.add(percent_rule)
    db.add_all([
        DiscountRule(  # a time-limited rule that has already ended, to show the Expired state
            name="Spring Sale $15 off", type=ValueType.FIXED, value=Decimal("15"),
            start_date=date(2025, 3, 1), end_date=date(2025, 4, 30), scope=DiscountScope.SUBSCRIPTION,
        ),
        DiscountRule(  # a product rule with a usage cap, to show limits in the UI
            name="CRM launch 20% off", type=ValueType.PERCENT, value=Decimal("20"), min_quantity=2,
            start_date=TODAY - timedelta(days=30), end_date=TODAY + timedelta(days=60), usage_limit=100,
            scope=DiscountScope.PRODUCT, product_id=products["crm"].id,
        ),
    ])
    db.flush()
    return Catalog(taxes, products, variants, plans, percent_rule)


def seed_customers(db: Session, users: dict[str, User]) -> list[int]:
    rows: list[dict] = []
    used_emails: set[str] = set()
    for email, name, company in DEMO_CUSTOMERS:
        rows.append({
            "user_id": users[email].id, "name": name, "company": company, "email": email,
            "phone": f"+1 555 01{len(rows):02d}", "address": "1 Demo Plaza, Austin",
            **stamps(TODAY - timedelta(days=400)),
        })
        used_emails.add(email)
    while len(rows) < CUSTOMER_COUNT:
        first, last = rng.choice(FIRST), rng.choice(LAST)
        company = f"{rng.choice(CO_A)} {rng.choice(CO_B)}"
        slug = company.lower().replace(" ", "")
        email = f"{first}.{last}@{slug}.com".lower().replace("ü", "u")
        if email in used_emails:
            continue
        used_emails.add(email)
        rows.append({
            "user_id": None, "name": f"{first} {last}", "company": company if rng.random() < 0.85 else None,
            "email": email, "phone": f"+1 555 {rng.randint(100, 999)} {rng.randint(1000, 9999)}",
            "address": f"{rng.randint(1, 999)} {rng.choice(STREETS)}, {rng.choice(CITIES)}",
            **stamps(TODAY - timedelta(days=rng.randint(30, 700))),
        })
    return bulk(db, Customer, rows)


# ------------------------------------------------- subscription generation --

def pick_lines(cat: Catalog, plan: Plan) -> list[LineSpec]:
    count = rng.choices([1, 2, 3], weights=[50, 35, 15])[0]
    chosen = rng.sample(list(cat.products), count)
    lines: list[LineSpec] = []
    for index, key in enumerate(chosen):
        product = cat.products[key]
        options = [(k[1], v) for k, v in cat.variants.items() if k[0] == key]
        variant = rng.choice(options)[1] if options and rng.random() < 0.7 else None
        unit_price = product.sales_price + (variant.extra_price if variant else Decimal("0"))
        quantity = rng.randint(1, 4)
        if index == 0:
            quantity = max(quantity, plan.min_quantity)
        tax = next((t for t in cat.taxes.values() if t.id == product.tax_id), None)
        lines.append(LineSpec(
            product_id=product.id,
            variant_id=variant.id if variant else None,
            description=f"{product.name} ({variant.attribute}: {variant.value})" if variant else product.name,
            quantity=quantity,
            unit_price=money(unit_price),
            tax_name=tax.name if tax else None,
            tax_kind=tax.type if tax else None,
            tax_value=tax.value if tax else None,
        ))
    return lines


def period_starts(first: date, period: str, last: date) -> list[date]:
    starts, current = [], first
    while current <= last:
        starts.append(current)
        current = advance_period(current, period)
    return starts


def build_subscription(cat: Catalog, customer_idx: int, force: str | None = None) -> SubSpec:
    plan_key = "monthly" if force else rng.choices(
        [p[0] for p in PLANS if p[-1]], weights=[p[-1] for p in PLANS if p[-1]]
    )[0]
    plan = cat.plans[plan_key]
    period = plan.billing_period.value
    terms = 15 if force else rng.choices([t for t, _ in TERMS], weights=[w for _, w in TERMS])[0]
    lines = pick_lines(cat, plan)

    if force:
        status = SubscriptionStatus.ACTIVE
    else:
        status = rng.choices(
            [SubscriptionStatus.ACTIVE, SubscriptionStatus.CLOSED, SubscriptionStatus.CONFIRMED,
             SubscriptionStatus.QUOTATION, SubscriptionStatus.DRAFT],
            weights=[70, 12, 5, 6, 7],
        )[0]

    spec = SubSpec(customer_idx, plan_key, status, TODAY, None, terms, None, lines, force)
    if status in (SubscriptionStatus.DRAFT, SubscriptionStatus.QUOTATION, SubscriptionStatus.CONFIRMED):
        spec.start_date = TODAY + timedelta(days=rng.randint(-20, 30))
        return spec

    span = START_SPAN[plan_key]
    if force == "overdue":
        spec.start_date = TODAY - timedelta(days=terms + 25)  # first invoice is already overdue
    elif status == SubscriptionStatus.CLOSED:
        spec.start_date = TODAY - timedelta(days=rng.randint(max(span // 2, 20), span + 120))
        spec.expiry_date = spec.start_date + timedelta(days=rng.randint(15, max((TODAY - spec.start_date).days - 5, 16)))
    else:
        spec.start_date = TODAY - timedelta(days=rng.randint(0, span))
        if rng.random() < 0.2:
            spec.expiry_date = max(TODAY, spec.start_date) + timedelta(days=rng.randint(30, 300))
    spec.start_date = max(spec.start_date, plan.available_from)
    if spec.expiry_date and spec.expiry_date < spec.start_date:
        spec.expiry_date = spec.start_date

    horizon = min(spec.expiry_date, TODAY) if spec.expiry_date else TODAY
    starts = period_starts(spec.start_date, period, horizon)
    unbilled = 0
    if status == SubscriptionStatus.ACTIVE and starts and (force is None and rng.random() < DUE_SHARE):
        unbilled = min(len(starts), rng.choices([1, 2], weights=[80, 20])[0])
    billed = starts[: len(starts) - unbilled]
    spec.next_billing_date = starts[len(billed)] if unbilled else advance_period(starts[-1], period) if starts else spec.start_date
    spec.invoices = [make_invoice(cat, spec, plan, start, index == len(billed) - 1, index == 0)
                     for index, start in enumerate(billed)]
    return spec


def make_invoice(cat: Catalog, sub: SubSpec, plan: Plan, start: date, is_last: bool, is_first: bool) -> InvoiceSpec:
    """Mirror app.services.billing.build_invoice_draft for one period."""
    totals = [money(line.unit_price * line.quantity) for line in sub.lines]
    subtotal = money(sum(totals, ZERO))
    rule = cat.percent_rule
    discount = ZERO
    shares = [ZERO] * len(totals)
    if rule.min_purchase is not None and subtotal >= rule.min_purchase and start >= rule.start_date:
        discount = money(subtotal * rule.value / HUNDRED)
        remaining = discount
        for i, line_total in enumerate(totals):
            shares[i] = min(money(discount * line_total / subtotal), line_total, remaining)
            remaining -= shares[i]
        shares[-1] += remaining  # the rounding remainder goes on the last line
        shares[-1] = min(shares[-1], totals[-1])
        discount = money(sum(shares, ZERO))

    product_lines, tax_total = [], ZERO
    for line, line_total, share in zip(sub.lines, totals, shares):
        taxable = max(line_total - share, ZERO)
        if line.tax_kind == ValueType.PERCENT:
            tax_amount, tax_rate = money(taxable * line.tax_value / HUNDRED), line.tax_value
        elif line.tax_kind == ValueType.FIXED:
            tax_amount, tax_rate = money(line.tax_value), None
        else:
            tax_amount, tax_rate = ZERO, None
        tax_total += tax_amount
        product_lines.append({
            "description": line.description, "quantity": line.quantity, "unit_price": line.unit_price,
            "tax_name": line.tax_name, "tax_rate": tax_rate, "tax_amount": tax_amount, "line_total": line_total,
        })
    tax_total = money(tax_total)
    total = max(money(subtotal - discount + tax_total), ZERO)
    discount_line = None
    if discount > 0:
        discount_line = {"description": rule.name, "unit_price": -discount, "line_total": -discount}

    issue = start
    due = issue + timedelta(days=sub.terms)
    status, paid_fraction = decide_outcome(sub, issue, due, is_last, is_first)
    invoice = InvoiceSpec(
        period_start=start, period_end=period_end(start, plan.billing_period.value),
        status=InvoiceStatus.DRAFT if status == "draft" else
        InvoiceStatus.CANCELLED if status == "cancelled" else
        InvoiceStatus.PAID if status == "paid" else InvoiceStatus.CONFIRMED,
        issue_date=issue, due_date=due, product_lines=product_lines, discount_line=discount_line,
        subtotal=subtotal, discount_total=discount, tax_total=tax_total, total=total,
    )
    invoice.payments = make_payments(status, paid_fraction, invoice, sub.terms)
    return invoice


def decide_outcome(sub: SubSpec, issue: date, due: date, is_last: bool, is_first: bool) -> tuple[str, float]:
    """Return (kind, fraction paid). Kinds: paid, partial, open, draft, cancelled."""
    if sub.force == "overdue" and is_first:
        return "open", 0.0
    if sub.force == "open" and is_last:
        return "open", 0.0
    age = (TODAY - issue).days
    r = rng.random()
    if due >= TODAY:  # not yet due: the latest invoices
        if r < 0.15 and age <= 10:
            return "draft", 0.0
        if r < 0.55:
            return "paid", 1.0
        if r < 0.60:
            return "partial", rng.uniform(0.25, 0.75)
        return "open", 0.0
    p_open = 0.08 if age <= 120 else 0.03
    if r < 0.03:
        return "cancelled", 0.0
    if r < 0.03 + p_open:
        return "open", 0.0
    if r < 0.03 + p_open + 0.03:
        return "partial", rng.uniform(0.25, 0.75)
    return "paid", 1.0


def make_payments(kind: str, fraction: float, invoice: InvoiceSpec, terms: int) -> list[PaymentSpec]:
    if kind not in ("paid", "partial") or invoice.total <= 0:
        return []
    amounts = [invoice.total] if kind == "paid" else [money(invoice.total * Decimal(str(round(fraction, 2))))]
    if kind == "paid" and rng.random() < 0.2:  # paid in two instalments
        first = money(invoice.total * Decimal(str(round(rng.uniform(0.3, 0.7), 2))))
        amounts = [first, invoice.total - first]
    if kind == "partial":
        amounts[0] = min(max(amounts[0], Decimal("0.01")), invoice.total - Decimal("0.01"))

    payments, when = [], invoice.issue_date
    for amount in amounts:
        when = min(TODAY, max(when, invoice.issue_date) + timedelta(days=rng.randint(0, terms + 10)))
        method = rng.choices(METHODS, weights=METHOD_WEIGHTS)[0]
        note = rng.choice([f"Ref TXN-{rng.randint(10000, 99999)}", "Paid after reminder", None, None, None, None])
        payments.append(PaymentSpec(method, amount, when, note, None if method == PaymentMethod.ONLINE else 0))
    return payments


# ------------------------------------------------------------------ writes --

def write_subscriptions(db: Session, specs: list[SubSpec], cat: Catalog, customer_ids: list[int]) -> list[int]:
    specs.sort(key=lambda s: (s.start_date, s.customer_idx))
    for number, spec in enumerate(specs, start=1):
        spec.number = f"SUB-{number:04d}"
    ids = bulk(db, Subscription, [{
        "number": s.number, "customer_id": customer_ids[s.customer_idx], "plan_id": cat.plans[s.plan_key].id,
        "status": s.status, "start_date": s.start_date, "expiry_date": s.expiry_date,
        "payment_terms_days": s.terms, "next_billing_date": s.next_billing_date, **stamps(s.start_date),
    } for s in specs])
    bulk(db, SubscriptionLine, [{
        "subscription_id": sub_id, "product_id": line.product_id, "variant_id": line.variant_id,
        "quantity": line.quantity, "unit_price": line.unit_price, **stamps(spec.start_date),
    } for spec, sub_id in zip(specs, ids) for line in spec.lines])
    db.execute(text("SELECT setval('subscription_number_seq', :n)"), {"n": len(specs)})
    return ids


def write_invoices(db: Session, specs: list[SubSpec], sub_ids: list[int], customer_ids: list[int],
                   cat: Catalog, staff_ids: list[int]) -> list[tuple[int, SubSpec, InvoiceSpec]]:
    pending = [(spec, sub_id, inv) for spec, sub_id in zip(specs, sub_ids) for inv in spec.invoices]
    pending.sort(key=lambda t: (t[2].issue_date, t[0].number))
    rows = [{
        "number": f"INV-{n:04d}", "subscription_id": sub_id, "customer_id": customer_ids[spec.customer_idx],
        "period_start": inv.period_start, "period_end": inv.period_end, "status": inv.status,
        "issue_date": inv.issue_date, "due_date": inv.due_date, "subtotal": inv.subtotal,
        "discount_total": inv.discount_total, "tax_total": inv.tax_total, "total": inv.total,
        "amount_paid": inv.amount_paid, **stamps(inv.issue_date),
    } for n, (spec, sub_id, inv) in enumerate(pending, start=1)]
    invoice_ids = bulk(db, Invoice, rows)

    line_rows, payment_rows = [], []
    for invoice_id, (spec, _, inv) in zip(invoice_ids, pending):
        for line in inv.product_lines:
            line_rows.append({"invoice_id": invoice_id, "line_type": InvoiceLineType.PRODUCT,
                              "discount_rule_id": None, **line, **stamps(inv.issue_date)})
        if inv.discount_line:
            line_rows.append({
                "invoice_id": invoice_id, "line_type": InvoiceLineType.DISCOUNT, "quantity": 1,
                "tax_name": None, "tax_rate": None, "tax_amount": ZERO,
                "discount_rule_id": cat.percent_rule.id, **inv.discount_line, **stamps(inv.issue_date),
            })
        for pay in inv.payments:
            payment_rows.append({
                "invoice_id": invoice_id, "customer_id": customer_ids[spec.customer_idx], "method": pay.method,
                "amount": pay.amount, "payment_date": pay.payment_date, "note": pay.note,
                "recorded_by_id": rng.choice(staff_ids) if pay.recorded_by_id == 0 else None,
                **stamps(pay.payment_date),
            })
    bulk(db, InvoiceLine, line_rows)
    bulk(db, Payment, payment_rows)
    db.execute(text("SELECT setval('invoice_number_seq', :n)"), {"n": len(pending)})
    return [(i, s, inv) for i, (s, _, inv) in zip(invoice_ids, pending)]


def write_outbox(db: Session, written, customer_ids: list[int], users: dict[str, User]) -> int:
    """Invoice emails for the demo customers' sent invoices, plus one password reset."""
    demo = {customer_ids[i]: DEMO_CUSTOMERS[i] for i in range(len(DEMO_CUSTOMERS))}
    rows, per_customer = [], {}
    for invoice_id, spec, inv in written:
        customer_id = customer_ids[spec.customer_idx]
        if customer_id not in demo or inv.status in (InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED):
            continue
        if per_customer.get(customer_id, 0) >= 3:
            continue
        per_customer[customer_id] = per_customer.get(customer_id, 0) + 1
        email, name, _ = demo[customer_id]
        rows.append({
            "type": EmailType.INVOICE, "to_email": email, "invoice_id": invoice_id,
            "subject": f"Your Brightloop invoice for {spec.number}",
            "body_html": f"<p>Hi {name},</p><p>Your invoice for subscription {spec.number} is "
                         f"{inv.total} due on {inv.due_date}.</p>",
            **stamps(inv.issue_date),
        })
    token = "seed-reset-token-initech-0001"
    initech = users[DEMO_CUSTOMERS[2][0]]
    db.add(PasswordResetToken(user_id=initech.id, token=token, expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    rows.append({
        "type": EmailType.PASSWORD_RESET, "to_email": initech.email, "invoice_id": None,
        "subject": "Reset your Brightloop password",
        "body_html": f'<p>Hi {initech.full_name},</p><p><a href="{link}">Reset your password</a></p>'
                     "<p>This link works once and expires in 1 hour.</p>",
        **stamps(TODAY),
    })
    bulk(db, Outbox, rows)
    return len(rows)


# -------------------------------------------------------------------- main --

def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the Brightloop database with demo data.")
    parser.add_argument("--reset", action="store_true", help="wipe every table before seeding")
    args = parser.parse_args()

    started = time.perf_counter()
    with SessionLocal() as db:
        if args.reset:
            reset_database(db)
        elif db.scalar(select(func.count()).select_from(User)):
            print("Database already has data. Re-run with --reset to wipe it and reseed.", file=sys.stderr)
            return 1

        users = seed_users(db)
        cat = seed_catalog(db)
        customer_ids = seed_customers(db, users)

        specs: list[SubSpec] = []
        for demo_index in range(len(DEMO_CUSTOMERS)):  # guaranteed overdue and open invoices to demo
            specs.append(build_subscription(cat, demo_index, "overdue"))
            specs.append(build_subscription(cat, demo_index, "open"))
        while len(specs) < SUBSCRIPTION_COUNT:
            # Demo customers keep a small, readable portfolio; the rest are spread over everyone else.
            specs.append(build_subscription(cat, rng.randrange(len(DEMO_CUSTOMERS), len(customer_ids))))

        sub_ids_sorted_specs = specs
        sub_ids = write_subscriptions(db, sub_ids_sorted_specs, cat, customer_ids)
        written = write_invoices(db, specs, sub_ids, customer_ids, cat, [users["admin"].id, users["staff"].id])
        emails = write_outbox(db, written, customer_ids, users)
        db.commit()

        due = db.scalar(select(func.count()).select_from(Subscription).where(
            Subscription.status == SubscriptionStatus.ACTIVE, Subscription.next_billing_date <= TODAY))
        overdue = db.scalar(select(func.count()).select_from(Invoice).where(
            Invoice.status == InvoiceStatus.CONFIRMED, Invoice.amount_paid < Invoice.total, Invoice.due_date < TODAY))
        payments = db.scalar(select(func.count()).select_from(Payment))

    print(f"Seeded in {time.perf_counter() - started:.1f}s: {len(customer_ids)} customers, "
          f"{len(specs)} subscriptions ({due} due for billing), {len(written)} invoices "
          f"({overdue} overdue), {payments} payments, {emails} outbox emails.")
    print(f"\nAdmin    {ADMIN[0]} / {ADMIN[1]}\nStaff    {STAFF[0]} / {STAFF[1]}")
    for email, name, company in DEMO_CUSTOMERS:
        print(f"Customer {email} / {CUSTOMER_PASSWORD}  ({name}, {company})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

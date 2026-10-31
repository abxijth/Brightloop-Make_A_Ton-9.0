# Brightloop Subscription Management: Team Plan (4 members, 8 hours)

Who builds what, in what order, and where the pieces meet. Companion to `UX_DESIGN.md`, `DATA_MODEL.md` and `TECH_STACK.md`. Members are numbered 1 to 4; assign names at kickoff.

## 1. Approach

- **Vertical slices.** Each member owns a feature area end to end: API, data and UI.
- **Parallel foundations in hour 1.** Nobody waits for a group setup. Each member builds one foundation piece, then moves into their slice.
- **One schema, one owner at a time.** The initial migration is written once, by Member 2, at the end of hour 1. After that, schema changes go through pull requests (see section 7).

## 2. Roles at a glance

| Member | First-hour foundation | Slice owned |
|---|---|---|
| **1: Platform and identity** | Repo skeleton, `docker-compose`, README, backend app structure, auth and role dependencies | Auth, signup and reset, staff, customers, Outbox |
| **2: Catalog and discounts** | Models for identity, catalog and discounts, plus the single initial Alembic migration | Products, variants, plans, taxes, discounts |
| **3: Subscriptions and billing** | Models for subscriptions, templates and invoices, plus the seed script outline | Subscriptions, templates (seeded), billing run, seed volume |
| **4: Frontend shell, money and reporting** | Vite, Tailwind, shadcn/ui, theme tokens, both layouts, routing by role, shared components | Invoices, payments, portal, mock checkout, dashboard |

## 3. Hour-by-hour

| Hours | Everyone | Notes |
|---|---|---|
| **0 to 1** | Foundations (section 4) | Member 1 pushes the skeleton in the first 15 minutes so others can branch from it. |
| **1** | **Checkpoint 1** (10 minutes): migration merged, `docker compose up` and the seed outline work, shell renders both layouts | Nobody starts slice work until this passes, except Member 3 and 4, who can start as soon as their foundation is merged. |
| **1 to 4** | Slice work, API first, then UI | Merge to `main` at least every 45 minutes. |
| **4** | **Checkpoint 2** (10 minutes): every slice has a working list page and one create flow against the real API | If a slice is behind, cut scope in `UX_DESIGN.md` section 6 instead of slipping. |
| **4 to 6** | Finish slices, wire cross-slice flows (section 5), add pytest for the must-not-break logic | Billing, payments and discounts meet here. |
| **6 to 7** | Polish, seed volume check (under 2 seconds), empty states, error states | Members swap and test each other's slices. |
| **7 to 8** | Dark mode (only if everything else works), README, demo rehearsal, bug fixes | Feature freeze at hour 7. Only bug fixes after that. |

## 4. First-hour foundations

### Member 1: Platform
- Repo skeleton exactly as in `TECH_STACK.md` section 3, pushed to `main` in the first 15 minutes.
- `docker-compose.yml` with PostgreSQL, `.env.example`, and a README with the one-command setup.
- Backend app structure: routers, settings, database session, error handler that returns field-level validation errors in a single agreed JSON shape.
- Auth core: password hashing, JWT in an httpOnly cookie, `get_current_user`, and role dependencies (`require_admin`, `require_staff_or_admin`, `require_customer`).
- **Hand-off:** tell the others the error JSON shape and the role dependency names as soon as they exist.

### Member 2: Models and migration
- SQLAlchemy models for **identity** (`users`, `customers`, `password_reset_tokens`), **catalog** (`taxes`, `products`, `product_variants`, `plans`) and **discounts** (`discount_rules`), exactly as in `DATA_MODEL.md`.
- Pull Member 3's models for subscriptions, templates and invoices (they merge theirs by minute 45), then generate **one initial Alembic migration** for all 16 tables, including every constraint and index in `DATA_MODEL.md`.
- Merge the migration to `main` by the end of hour 1. Announce it.
- Write the `find_applicable_discounts(subscription, subtotal)` signature and a stub (the interface Member 3 calls; see section 5).

### Member 3: Subscription and invoice models and seed outline
- SQLAlchemy models for `quotation_templates`, `quotation_template_lines`, `subscriptions`, `subscription_lines`, `invoices`, `invoice_lines`, `payments` and `outbox`, exactly as in `DATA_MODEL.md`. Push them by minute 45 for Member 2's migration.
- Number sequences for `SUB-0001` and `INV-0001`.
- `seed.py` outline: a function per area, with Member 3 owning the high-volume part (thousands of subscriptions, many due for billing, historical invoices and payments with paid and overdue mixes).
- Sketch the billing service function signature.

### Member 4: Frontend shell
- Vite, React, TypeScript, Tailwind, shadcn/ui, React Router, TanStack Query.
- **Theme tokens** for colors, including the fixed status colors (Draft, Quotation, Confirmed, Active, Closed, Overdue).
- Both layouts: the sidebar back-office shell and the top-nav portal shell, chosen by role, with the navigation table from `UX_DESIGN.md` section 2. The login page can use a fake role until Member 1's auth lands.
- **Shared components, pushed by the end of hour 1 because everyone depends on them:** `DataTable` (server-side pagination, sorting, filters in the URL), `StatusBadge`, `Stepper`, `Drawer`, form field with inline error, confirm dialog, toasts.
- Set up `openapi-typescript` generation and a one-line command to regenerate types, and tell the team.

## 5. Slices

### Member 1: Auth, identity, Outbox
- Signup (with the live password checklist), login, logout, forgot and reset password. Reset links are written to the outbox.
- Staff page (admin only): list and add staff, deactivate.
- Customers: list, detail with Subscriptions, Invoices and Payments tabs, create and edit. (The tabs call other members' list endpoints with a customer filter.)
- Outbox page (admin and staff): list, expand a row, working links.
- Global search box in the top bar.
- pytest: password rules, duplicate email, role checks, customer isolation.

### Member 2: Catalog and discounts
- Products (with inline variants table and live final-price preview), plans (with auto-close and allow-early-close toggles), taxes: list and form pages, admin only.
- Discounts: rule form, list with usage bar and Active, Expired or Exhausted badge.
- `find_applicable_discounts` implementation: active, in date range, not exhausted (usage counted from `invoice_lines`), matching scope, minimum purchase and minimum quantity.
- pytest: percent and fixed discounts, minimum conditions, expiry, usage limit, tax calculated on the discounted amount.

### Member 3: Subscriptions and billing
- Subscriptions: list (server-side filters, status badges), create from a template or blank (seeded templates), editable form with sticky totals, the status stepper and its transitions, Close action.
- **Billing Run page and `POST /billing/run`:** due list with checkboxes and warnings, "Confirm invoices after creating", results summary (created, skipped, failed with reasons), idempotent re-run showing everything skipped.
- Calls Member 2's `find_applicable_discounts` and creates discount lines.
- Seed volume: thousands of subscriptions, and checking the list endpoints stay under 2 seconds with indexes from `DATA_MODEL.md`.
- pytest: billing idempotency (run twice, one invoice per period), failure of one subscription doesn't stop the batch, `next_billing_date` advances, auto-close.

### Member 4: Invoices, payments, portal, dashboard
- Invoices: list (filters, search, Overdue quick filter with days overdue), detail with the Draft, Confirmed, Paid stepper and action bar (Confirm, Send into the Outbox, Print with a print stylesheet, Cancel), totals panel with discount lines.
- Payments: "Register payment" drawer, global Payments list. **The payment service** (row lock, balance check, update `amount_paid`, set Paid) is shared by staff payments and the mock checkout.
- Customer portal: My Subscriptions cards, subscription detail with Close early, Invoices, Account.
- **Mock checkout:** Test mode banner, partial amount, Simulate success and Simulate failure, double-click protection.
- Finance dashboard: KPI cards, revenue chart, overdue table, date-range filter, KPI click-through to filtered lists. A limited version for staff.
- pytest: overpayment rejected, partial then full payment, Paid status, concurrent payment safety.

## 6. Cross-slice interfaces (agree these early)

| Interface | Owner | Used by | Contract |
|---|---|---|---|
| Error JSON shape | Member 1 | everyone | One shape for field-level validation errors, so the frontend can map them onto fields. |
| Role dependencies | Member 1 | everyone | `require_admin`, `require_staff_or_admin`, `require_customer`. |
| `find_applicable_discounts(subscription, subtotal)` | Member 2 | Member 3 | Returns the discount lines to add, each with the rule, amount and description. |
| Payment service `record_payment(invoice_id, amount, method, ...)` | Member 4 | Member 4 (drawer and checkout) | One code path for all payments. |
| Invoice creation service | Member 3 | Member 4 | Billing creates invoices; Member 4 only reads and changes status. |
| List endpoints with `customer_id` filter | Members 3 and 4 | Member 1 (customer tabs) | Subscriptions, invoices and payments lists accept `customer_id`. |
| Generated TypeScript types | Member 4 sets up | everyone | Regenerate after any API change; commit the generated file. |
| Shared UI components | Member 4 | everyone | `DataTable`, `StatusBadge`, `Stepper`, `Drawer`, form field, confirm dialog, toasts. Ask Member 4 before changing their API. |

## 7. Git workflow

- Never commit directly to `main`. Branch per feature: `feat/<area>-<thing>`, for example `feat/billing-run`.
- Small pull requests, merged often (at least every 45 minutes). **Each pull request is reviewed by another member**, not the author. A review can be a quick read plus running it.
- Everyone commits and everyone reviews, so repo management is shared.
- **Schema changes after the initial migration:** open a pull request with a new Alembic migration, tag Member 2 as reviewer, and tell the team on merge. Everyone then runs `alembic upgrade head`.
- Resolve conflicts by talking to the file's owner, not by overwriting.
- Commit messages: short and imperative ("Add billing run endpoint").

## 8. Cutting scope

If a slice runs behind at a checkpoint, cut in this order (see also `UX_DESIGN.md` section 6):
1. Dark mode.
2. Customer detail tabs and the global search box.
3. Staff dashboard variant (show only a plain overdue list).
4. Print stylesheet polish.
5. Product-scoped discounts (keep whole-subscription only).

## 9. Demo plan

Rehearse this flow in hour 7 to 8, with Member 3 driving billing, Member 4 driving payment, and the others narrating:
1. Log in as admin. Show the dashboard with seeded data.
2. Show a list of thousands of subscriptions filtering instantly.
3. Create a discount rule.
4. Open Billing Run, generate invoices, show the summary and the discount line on an invoice.
5. Click Generate again: everything is skipped.
6. Log in as a customer in the portal, open an invoice, Pay now, simulate success.
7. Back as admin: the payment shows as Online, and the dashboard moved.
8. Show the Outbox with a password reset link, and the API docs at `/docs`.

## 10. Open items

1. Names for Members 1 to 4. Assign based on who is strongest at: DevOps and auth (1), data modeling (2), business logic (3), frontend (4).
2. Staff dashboard contents (still open from `UX_DESIGN.md`).
3. Does everyone have Docker, Python and Node installed and working before the clock starts? Check at kickoff.

# PENDING: MVP essentials only

Scope comes from `PROBLEM_STATEMENT.md`. Anything not required there is listed under "Out of scope" at the bottom.

Rule for every item: replace mock/hardcoded data with the real API, validate input, and keep pages under 2 seconds.

## Frontend: replace mock data with the API (backend endpoints already exist)

- [x] **Subscriptions (back office)** `SubscriptionsBackOfficePage`: use `/subscriptions` for list, create, edit, `transition` (Draft, Quotation, Confirmed, Active, Closed) and `close`. Remove `mockSubscriptions`.
- [x] **Invoices (back office)** `BackOfficeInvoicesPage`: use `GET /invoices` plus `confirm`, `cancel` and `send`. Print stays client-side. Remove `mockInvoices`.
- [x] **Billing run** `BillingRunPage`: use `POST /billing/run` with real subscriptions. Remove the hardcoded selected IDs and items. Billing must be idempotent (nothing billed twice or skipped).
- [x] **Payments** `PaymentsPage`: use `GET /payments` and `POST /invoices/{id}/payments` (method, amount, date, note). Remove `MOCK_PAYMENTS`.

## Backend plus frontend: gaps

- [x] **Customer portal: my invoices.** `GET /invoices` is staff-only, so customers can't list their own invoices. Add customer-scoped listing (a customer sees only their own invoices), then wire `InvoicesPage` and remove `mockInvoices`.
- [x] **Customer portal: my subscriptions.** Make sure `GET /subscriptions` returns only the logged-in customer's rows for the customer role, then wire `MySubscriptionsPage` (including its invoice list) and remove the mocks.
- [x] **Finance dashboard.** Add one summary endpoint (active subscriptions, revenue collected, amount outstanding, overdue invoices, with date filters), wire `DashboardPage`, and remove `INITIAL_OVERDUE_INVOICES`. Overdue invoices must be listable. Check the response time against seeded data in the thousands.

## Verification before calling the MVP done

- [x] End-to-end demo path works with real data and no mock imports left in `frontend/src` (`grep -r "mock" frontend/src` is clean apart from unrelated UI wording).
- [x] Customer isolation is tested: a customer cannot see another customer's subscriptions, invoices or payments. Only the admin can create staff, discounts, taxes, products and plans.
- [x] `cd backend && pytest` and `ruff check .` pass.
- [x] README demo-logins section filled in (the seed script exists).

## Notes from wiring the pages

- `GET /invoices` and `GET /payments` now accept customers and are always filtered to their own rows (customers never see draft invoices). `GET /invoices?overdue=true` lists overdue invoices.
- `GET /reports/summary?date_from&date_to` (staff/admin) powers the dashboard: period figures (revenue collected, invoiced, new subscriptions, monthly trend) plus as-of-today balances (active subscriptions, MRR, outstanding, overdue list). Tested at about 3,000 subscriptions and 5,000+ invoices: well under 2 s (about 40 ms on the seeded data).
- Fixed: invoice `confirm` and `cancel` returned 500 (`FOR UPDATE` on an outer join); cancelling an already-cancelled invoice is now rejected.
- The portal "Pay now" mock checkout was removed (out of scope below); staff record payments from Invoices, Payments or the dashboard.
- All mock data modules were deleted; `grep -ri mock frontend/src` is clean.

## Still open (nice to have)

- [ ] Browser click-through of the demo path in README (API flows verified with curl against seeded data; frontend typechecks, lints and builds).
- [ ] Frontend bundle is over 500 kB; route-level code splitting would help first load.

## Out of scope for the MVP (not required by the problem statement)

- Online "Pay now" checkout in the portal (staff record payments instead).
- Change-password on `AccountPage` (forgot/reset already covers the password requirement).
- Real email sending (the outbox log is enough), real payment gateway, PDF generation, and automatic scheduled billing.

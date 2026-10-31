# PENDING: MVP essentials only

Scope comes from `PROBLEM_STATEMENT.md`. Anything not required there is listed under "Out of scope" at the bottom.

Rule for every item: replace mock/hardcoded data with the real API, validate input, and keep pages under 2 seconds.

## Frontend: replace mock data with the API (backend endpoints already exist)

- [ ] **Subscriptions (back office)** `SubscriptionsBackOfficePage`: use `/subscriptions` for list, create, edit, `transition` (Draft, Quotation, Confirmed, Active, Closed) and `close`. Remove `mockSubscriptions`.
- [ ] **Invoices (back office)** `BackOfficeInvoicesPage`: use `GET /invoices` plus `confirm`, `cancel` and `send`. Print stays client-side. Remove `mockInvoices`.
- [ ] **Billing run** `BillingRunPage`: use `POST /billing/run` with real subscriptions. Remove the hardcoded selected IDs and items. Billing must be idempotent (nothing billed twice or skipped).
- [ ] **Payments** `PaymentsPage`: use `GET /payments` and `POST /invoices/{id}/payments` (method, amount, date, note). Remove `MOCK_PAYMENTS`.

## Backend plus frontend: gaps

- [ ] **Customer portal: my invoices.** `GET /invoices` is staff-only, so customers can't list their own invoices. Add customer-scoped listing (a customer sees only their own invoices), then wire `InvoicesPage` and remove `mockInvoices`.
- [ ] **Customer portal: my subscriptions.** Make sure `GET /subscriptions` returns only the logged-in customer's rows for the customer role, then wire `MySubscriptionsPage` (including its invoice list) and remove the mocks.
- [ ] **Finance dashboard.** Add one summary endpoint (active subscriptions, revenue collected, amount outstanding, overdue invoices, with date filters), wire `DashboardPage`, and remove `INITIAL_OVERDUE_INVOICES`. Overdue invoices must be listable. Check the response time against seeded data in the thousands.

## Verification before calling the MVP done

- [ ] End-to-end demo path works with real data and no mock imports left in `frontend/src` (`grep -r "mock" frontend/src` is clean apart from unrelated UI wording).
- [ ] Customer isolation is tested: a customer cannot see another customer's subscriptions, invoices or payments. Only the admin can create staff, discounts, taxes, products and plans.
- [ ] `cd backend && pytest` and `ruff check .` pass.
- [ ] README demo-logins section filled in (the seed script exists).

## Out of scope for the MVP (not required by the problem statement)

- Mock "Pay now" checkout in the portal (staff record payments instead). `MockCheckoutModal` can stay unused.
- Change-password on `AccountPage` (forgot/reset already covers the password requirement).
- Real email sending (the outbox log is enough), real payment gateway, PDF generation, and automatic scheduled billing.

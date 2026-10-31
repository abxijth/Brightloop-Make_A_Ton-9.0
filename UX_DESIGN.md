# Brightloop Subscription Management: UX Design (8-hour MVP)

Source requirements are in `PROBLEM_STATEMENT.md`. Stack is in `TECH_STACK.md`; schema is in `DATA_MODEL.md`.

This is the scoped-down version for an 8-hour hackathon. Anything cut is listed in section 6 ("Later") so nothing is lost.

## 1. Wow moments (protect these)

These are what we show, so they get polish time first. Everything else exists to support them.

1. **One-click billing day.** The Billing Run page shows every due subscription, we click "Generate invoices", and hundreds of correct invoices appear with a created/skipped/failed summary. **Click it a second time and everything shows "skipped: already billed".** That is the "nothing billed twice" requirement, demonstrated live.
2. **Discount appears on its own.** An admin creates a discount rule. The next billing run adds it to the invoice as its own line with the rule's name, and the usage counter (e.g. 12/50) goes up.
3. **Customer pays, staff see it instantly.** In the portal, "Pay now" runs the mock checkout. The invoice flips to Paid, and the same payment shows up for staff as method "Online" and moves the dashboard numbers.
4. **Finance dashboard.** KPI cards, a revenue chart and an overdue table, driven by one date filter. Each KPI clicks through to the filtered list behind it.
5. **Fast with thousands of rows.** The seed script creates thousands of subscriptions and invoices. Lists page, filter and search on the server and stay under 2 seconds. We can say it, and show it.
6. **Status stepper.** Subscriptions and invoices show a stepper, so "where does this stand?" is visible at a glance.
7. **Password reset that works.** The reset link arrives in an in-app Outbox page and can be clicked.

## 2. Structure and roles

- **One app, two shells.** One codebase and one login. The shell is chosen by role after login.
- **Back-office shell (Admin, Staff):** left sidebar. Under tablet width it collapses to a hamburger.
- **Customer portal shell (Customer):** simple top-nav, mobile-first, no sidebar.
- Menus a role can't use are hidden, not greyed out. The server enforces permissions too.

### Back-office navigation

| Group | Items | Visible to |
|---|---|---|
| Dashboard | Dashboard | Admin (full), Staff (limited) |
| Sales | Subscriptions | Admin, Staff |
| Billing | Invoices, Payments, Billing Run, Outbox | Admin, Staff |
| Customers | Customers | Admin, Staff |
| Catalog | Products, Plans | Admin |
| Configuration | Taxes, Discounts, Staff | Admin |

### Roles

| Role | Can do |
|---|---|
| Admin | Everything. Also acts as the finance lead (assumption; a Finance role can be added later). |
| Staff | Create and edit customers, subscriptions, invoices and payments. Cannot touch products, plans, taxes, discounts or staff. |
| Customer | See and manage only their own subscriptions and invoices. |

- **Staff dashboard:** operational widgets only (overdue invoices, active subscriptions). No revenue totals or MRR.
- **Staff page (Admin):** a simple list with an "Add staff" form (name, email, temporary password). Staff can be deactivated, not deleted.
- The top bar has a search box for customers and subscriptions (by name, email or number), and a theme toggle (see section 4).

## 3. Flows

### 3.1 Sign up and password reset
- Single-page signup form: email, password, confirm password.
- A live checklist ticks off the password rules: more than 8 characters, an uppercase letter, a lowercase letter, a special character.
- A duplicate email shows an inline error on the email field.
- After signup the customer lands on the portal's empty state with a "Browse plans" prompt.
- "Forgot password" asks for an email. Emails are log-only, so the page confirms "If that email is registered, a reset link has been sent", and the link is opened from the Outbox page.

### 3.2 Catalog setup (Admin)
- **Product form:** name, type, sales price, tax, plus an inline variants table (attribute, value, extra price, e.g. Brand: Odoo +560) with a live "final price" preview.
- **Plan form:** price, billing period (daily, weekly, monthly, yearly), minimum quantity, availability dates, and two toggles: **auto-close at end** and **allow early close**. These toggles decide which buttons appear (see 3.9).
- Plain list and form pages for both. No wizard.

### 3.3 Quote to subscription
- "New Subscription" opens a picker: a quotation template, or blank. Templates are seeded (two or three), and there is no template management screen.
- A template prefills the plan and lines, and shows its validity (e.g. "valid 30 days"), with the expiry date computed from today.
- The form has customer, start date, expiry date, payment terms and line items (product, quantity, unit price, tax, amount). A sticky totals panel updates live.
- A horizontal stepper shows Draft → Quotation → Confirmed → Active → Closed, with one primary button for the next valid step. Close sits in a secondary menu.
- Subscriptions get their own number. List views show colored status badges and a status filter.
- Print is the browser print dialog with a print stylesheet.

### 3.4 Billing run (wow moment 1)
- The **Billing Run** page lists every due subscription with a checkbox, the expected amount and a warning if the period was already billed.
- Options: "Select all", and a checkbox "Confirm invoices after creating" (so hundreds of invoices don't need individual confirming).
- "Generate invoices" shows a progress state, then a results summary: **created, skipped, failed** counts, with a list of skipped and failed items and their reasons.
- Running it again shows everything as skipped. No run history page.
- A scheduler can run the same endpoint automatically (stretch).

### 3.5 Invoices
- The detail page has a Draft → Confirmed → Paid stepper and an action bar: Confirm, Send (adds an Outbox entry), Print, Cancel. Only valid actions are enabled.
- **Overdue** is a red badge derived from the due date. It is not a separate status.
- The list has filters (status, customer, date range), search, sorting, and an **Overdue** quick filter showing days overdue.
- The totals panel shows Subtotal, Discount, Tax and Total. Discounts appear as their own line with the rule name (wow moment 2).

### 3.6 Payments
- "Register payment" on an invoice (and on overdue rows in the dashboard) opens a side drawer: method, amount (prefilled with the balance due), date, note.
- Partial payments are allowed. The badge changes to Paid when the balance reaches zero.
- A Payments page lists all payments with filters (method, date range).

### 3.7 Discounts (Admin only)
- Rule form: type (fixed or percent), value, min purchase, min quantity, start and end dates, usage limit, and scope (whole subscription, or one specific product).
- The list shows a usage bar (e.g. 12/50) and an Active, Expired or Exhausted badge.
- Applied discounts show as their own invoice line.

### 3.8 Taxes (Admin only)
- A simple list and form: name, percent or fixed, active toggle. Each product has a default tax. Staff cannot override tax on a line.

### 3.9 Customer portal
- **My Subscriptions:** cards with status, next billing date and amount.
- **Subscription detail:** lines and invoice history, plus **Close early** if the plan allows it, behind a confirm dialog that states the consequence.
- **Invoices:** view, print, and "Pay now" for unpaid invoices.
- **Nav:** My Subscriptions, Invoices, Account.

### 3.10 Mock checkout (wow moment 3)
- "Pay now" opens a checkout that says **Test mode, no real money is charged**.
- It shows the invoice number and the amount due (prefilled with the balance, editable down for a partial payment), with a simple card-style form.
- **Simulate success** and **Simulate failure** buttons make the demo predictable.
- **Success:** a confirmation screen, and the invoice becomes Paid. Staff see the payment as method "Online".
- **Failure:** an inline error, nothing changes, and the customer can retry.
- The submit button is disabled while processing, so a double click can't record the payment twice.

### 3.11 Outbox (Admin, Staff)
- Billing > Outbox is a simple paginated list: date, recipient, subject, type. Clicking a row expands the email body, and its links work (this is how the reset link is used).
- A note at the top says emails are logged, not delivered.
- "Send" on an invoice shows a toast with a "View in Outbox" link.

### 3.12 Customers (Back-office)
- A customer page with a header (name, email, outstanding balance) and tabs for Subscriptions, Invoices and Payments, with "New subscription" and "Register payment" shortcuts.

### 3.13 Finance dashboard (Admin; wow moment 4)
- KPI cards: Active subscriptions, MRR, Revenue collected, Outstanding, Overdue count.
- Below: a revenue-over-time chart and an overdue invoices table with a "Register payment" action.
- One date-range filter drives everything. Each KPI links to the filtered list behind it.

## 4. Cross-cutting UX

### Lists (subscriptions, invoices, payments, customers)
- Server-side pagination (25 rows), filters, search and sortable columns. Filter state lives in the URL.
- Skeleton loaders. On mobile, rows collapse into stacked cards.
- Target: under 2 seconds with thousands of rows (wow moment 5).

### Validation and feedback
- Fields validate on blur, with the message under the field. Submit is blocked until the form is valid.
- The server re-validates everything and returns field-level errors that map onto the same fields.
- Destructive actions (cancel invoice, close subscription) get a confirm dialog. Success and failure use short toasts.

### Visual style
- One brand accent and fixed status colors, **defined as theme tokens from day one**:

| Status | Color |
|---|---|
| Draft | Grey |
| Quotation | Blue |
| Confirmed | Indigo |
| Active | Green |
| Closed | Slate |
| Overdue | Red |

- **Dark mode** stays in scope, but only because shadcn/ui and Tailwind give it almost for free when the colors are tokens. It's a final-hour polish item, so if time runs short, cut it first.
- One shared component set: tables, badges, drawers, forms, steppers, dialogs, toasts.
- Back-office is desktop-first, and the portal is mobile-first.

## 5. Suggested build order (8 hours)

1. Repo skeleton, schema, seed data, UI shell with tokens.
2. Auth, roles, signup and password reset (with Outbox).
3. Catalog (products, variants, plans, taxes).
4. Subscriptions with the stepper.
5. Billing run (wow 1 and 2), with the discount rule.
6. Invoices and payments, then mock checkout in the portal (wow 3).
7. Dashboard (wow 4).
8. Polish: dark mode, empty states, the demo script.

## 6. Later (cut from the MVP)

- Quotation template management screens (templates are seeded).
- Billing run history page.
- Bulk Confirm and Send on the invoice list (replaced by "Confirm invoices after creating").
- CSV export.
- PDF generation (browser print instead).
- Pause and Renew for subscriptions (only Close early is built).
- Staff-only reports pages beyond the dashboard.
- Product-scoped discounts with multiple products (MVP supports one product per rule).
- "Send reminder" on overdue rows.
- A Finance role.
- A scheduled automatic billing run.

## 7. Open questions

1. Does the staff dashboard need anything beyond the operational widgets above?

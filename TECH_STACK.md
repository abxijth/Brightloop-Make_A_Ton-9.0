# Brightloop Subscription Management: Tech Stack (8-hour MVP)

Decisions from the tech-stack discussion, scoped for an 8-hour hackathon. UX is in `UX_DESIGN.md`, the schema is in `DATA_MODEL.md`, and requirements are in `PROBLEM_STATEMENT.md`.

## 1. Summary

| Layer | Choice |
|---|---|
| Database | PostgreSQL (local via `docker compose`) |
| Backend | Python, FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Frontend | React, Vite, TypeScript, TanStack Query, Tailwind CSS, shadcn/ui |
| API contract | OpenAPI, generated from FastAPI; TypeScript types generated with `openapi-typescript` |
| Auth | argon2 or bcrypt hashes, JWT in an httpOnly cookie, role checks as FastAPI dependencies |
| Billing run | One idempotent endpoint called from the Billing Run page (a scheduler is a stretch goal) |
| Printing | Browser print with a print stylesheet (no PDF library) |

## 2. Why this shape

- **Separate backend API.** The brief values the ability to design backend APIs, model data and set up a local database. A standalone FastAPI service with a documented schema shows each of these directly.
- **Python backend.** The team is comfortable with Python.
- **FastAPI.** Pydantic validates every request and returns field-level errors, which map onto the inline form errors in `UX_DESIGN.md`. The server is the source of truth. OpenAPI docs are served at `/docs` automatically, which also doubles as a demo of the API design.
- **Vite instead of Next.js.** With a separate API, Next's server features would go unused, so plain React with Vite is simpler.
- **PostgreSQL.** Billing needs transactions and constraints (see section 5).
- **Newer tech only where it adds value.** No microservices, GraphQL, queues or real-time sockets. Normal fetching with pagination meets the two-second target.
- **Boring where time matters.** No PDF library, no email server, no job scheduler, no payment gateway. Each is replaced by something simpler (sections 4 and 10) so time goes into the key demo features in `UX_DESIGN.md`.

## 3. Repository: single repo (monorepo)

One Git repository holds everything. Several members commit through branches and pull requests.

```
Brightloop-Make_A_Ton-9.0/
├── backend/            # FastAPI app
│   ├── app/            # routers, models, schemas, services, deps
│   ├── alembic/        # migrations
│   ├── seed.py         # demo data (see section 8)
│   └── tests/
├── frontend/           # React + Vite app
│   └── src/
├── docker-compose.yml  # PostgreSQL
├── PROBLEM_STATEMENT.md
├── UX_DESIGN.md
├── DATA_MODEL.md
├── TECH_STACK.md
└── README.md           # one-command local setup
```

## 4. Backend

- **FastAPI** with routers per domain: auth, users/staff, customers, products, plans, subscriptions, invoices, payments, discounts, taxes, billing, outbox, dashboard.
- **SQLAlchemy 2** (typed models) with **Alembic** migrations. Start with one initial migration generated from the models. Schema changes are migrations, never manual edits.
- **Pydantic** schemas for requests and responses.
- **Roles (Admin, Staff, Customer)** enforced server-side with FastAPI dependencies. The UI hiding menus is a convenience only.
- **Customer data isolation:** customer-role queries are always filtered to the logged-in customer.
- **Passwords:** more than 8 characters with an uppercase letter, a lowercase letter and a special character, validated server-side. Email is unique per account. Reset links are time-limited, single-use tokens (stored as is in the MVP; hashing is a later step).
- **Printing:** invoices and quotes are HTML pages with a print stylesheet, printed from the browser. No PDF library.
- **Email** (reset link, invoice send): log-only. Each email is stored in an `outbox` table and shown on an in-app Outbox page; nothing is sent over SMTP.
- **Online payment:** a mock checkout endpoint that records a payment with method "Online" through the same code path as staff payments.
- **Billing endpoint:** `POST /billing/run` returns created, skipped and failed items with reasons. No run history is stored.

## 5. Data integrity and performance

- **No double billing:** a unique constraint on (subscription, billing period) on invoices. The billing endpoint is idempotent, so running it twice creates nothing new, and the second run reports everything as skipped.
- **Billing run in a transaction** per subscription, so one failure doesn't block the batch.
- **Payments:** one transaction locks the invoice row, checks the amount against the balance, inserts the payment and updates `amount_paid`. A check constraint keeps `amount_paid` between 0 and the total.
- **Money:** stored as `NUMERIC(12,2)`, never floats.
- **Indexes** as listed in `DATA_MODEL.md`.
- **Server-side pagination, filtering and sorting** on all large lists (25 rows per page). Dashboard figures come from aggregate queries, not loading rows into memory.
- **Target:** every page responds in under 2 seconds with thousands of subscriptions. The seed script generates that dataset so the claim can be shown.

## 6. Frontend

- **React with Vite and TypeScript.** React Router for the two shells (back-office and customer portal) selected by role after login.
- **TanStack Query** for fetching, caching and paginated lists. Filter state lives in the URL.
- **Tailwind CSS with shadcn/ui** for the shared components: tables, badges, drawers, dialogs, steppers, forms, toasts.
- **Theming:** colors defined as CSS variable tokens from the first commit, including the fixed status colors from `UX_DESIGN.md`. Dark mode comes almost for free with this and is a last-hour polish item.
- **Forms:** React Hook Form. Field errors from the server are mapped back onto the same fields.
- **Charts:** Recharts for the dashboard revenue trend.

## 7. Contract between backend and frontend

- FastAPI generates the OpenAPI schema.
- `openapi-typescript` generates frontend types from it, so the two sides can't drift apart unnoticed.
- The API is the shared contract that lets backend and frontend members work in parallel.

## 8. Local development and tooling

- `docker compose up` starts PostgreSQL. Backend and frontend run with their own dev servers.
- Environment config in `.env` files (never committed); `.env.example` is committed.
- **Seed script (`seed.py`) is part of the demo**, not an afterthought. It creates:
  - an admin, a staff user and a few customer logins (known passwords, listed in the README);
  - sample products with variants, plans, taxes, two or three quotation templates and one discount rule;
  - a large set of subscriptions (thousands), many of them due for billing, plus historical invoices and payments with a mix of paid and overdue.
- **Backend tooling:** ruff, and pytest for the logic that must not break: billing idempotency, discount application and usage limits, payment balance and overpayment checks, role and customer isolation.
- **Frontend tooling:** ESLint and Prettier. No frontend unit tests in the MVP.

## 9. Git workflow

- Branch per feature, pull requests into `main`, at least one review from another member.
- Every member commits. Small, clear commit messages.
- Keep pull requests small and merge often, so the slices in section 10 don't drift apart.

## 10. Decisions

1. **Portal payment:** a mock "Pay now" checkout (no real money) with simulate-success and simulate-failure buttons. On success the backend records a real payment with method "Online", the invoice balance drops, and the badge changes to Paid. It can be swapped for a real gateway later.
2. **Email:** log-only. Emails are written to an `outbox` table and never sent. An in-app Outbox page lets staff see what was "sent", and lets the password reset link be clicked from there so the flow stays demoable.
3. **Deployment:** local only via `docker compose`, with a README for one-command setup. A hosted demo is not planned.
4. **Work split:** vertical slices by feature area, each member owning API, data and UI end to end:
   1. Auth, roles, signup and reset, staff and customers.
   2. Catalog (products, variants, plans, taxes) and discounts.
   3. Subscriptions, quotation templates and the billing run.
   4. Invoices, payments, portal, mock checkout and dashboard.

   **First hour, done together:** repo skeleton, schema and migration, seed script outline, and the UI shell with theme tokens and the role-based layouts. After that the slices run in parallel without colliding.

## 11. Later (cut from the MVP)

- PDF generation (WeasyPrint or similar).
- A scheduled automatic billing run (APScheduler).
- Real SMTP email, with Mailpit for local testing.
- Real payment gateway in test mode.
- Hashed password reset tokens.
- Frontend unit tests (Vitest).
- A hosted demo deployment.

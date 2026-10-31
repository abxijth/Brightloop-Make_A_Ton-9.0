# Brightloop-Make_A_Ton-9.0

One unified software platform that runs the full life of a subscription business, from setting up products and plans to sending invoices, collecting payments and reporting revenue.

Design docs: [`PROBLEM_STATEMENT.md`](PROBLEM_STATEMENT.md), [`UX_DESIGN.md`](UX_DESIGN.md), [`DATA_MODEL.md`](DATA_MODEL.md), [`TECH_STACK.md`](TECH_STACK.md), [`TEAM_PLAN.md`](TEAM_PLAN.md).

## Prerequisites

Docker (with Compose v2), Python 3.12+, Node 20+.

## Local setup

```bash
# 1. Config
cp .env.example .env

# 2. Database (PostgreSQL 16 on localhost:5432)
docker compose up -d db

# 3. Backend (http://localhost:8000, API docs at /docs)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python seed.py                # demo data; `python seed.py --reset` wipes and reseeds
uvicorn app.main:app --reload

# 4. Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Check the backend: `curl http://localhost:8000/health` returns `{"status":"ok"}`.

## Useful commands

| Task | Command |
|---|---|
| Start / stop the database | `docker compose up -d db` / `docker compose down` |
| Reset the database (deletes all data) | `docker compose down -v && docker compose up -d db` |
| Open a SQL shell | `docker compose exec db psql -U brightloop` |
| Run backend tests | `cd backend && pytest` |
| Lint backend | `cd backend && ruff check .` |
| Reseed demo data (deletes all data) | `cd backend && python seed.py --reset` |
| Typecheck / lint / build frontend | `cd frontend && npx tsc -b && npm run lint && npm run build` |

## Demo logins

`python seed.py` creates these accounts, plus 400 customers, 3,000 subscriptions and about 9,700 invoices
(with overdue ones) so every page can be checked against realistic volume.

| Role | Email | Password | Lands on |
|---|---|---|---|
| Admin | `admin@brightloop.com` | `Admin@123` | Finance dashboard (`/dashboard`) |
| Staff | `staff@brightloop.com` | `Staff@123` | Operational dashboard |
| Customer | `acme@example.com` | `Customer@123` | Portal: own subscriptions and invoices |
| Customer | `globex@example.com` | `Customer@123` | Portal |
| Customer | `initech@example.com` | `Customer@123` | Portal |

Each demo customer has at least one overdue and one open invoice.

## Demo path

1. Admin: dashboard shows active subscriptions, MRR, revenue collected, outstanding and overdue invoices; switch the period filter.
2. Staff: **Subscriptions → New Subscription**, pick a customer and a quotation template, then Send Quotation → Confirm → Activate.
3. **Billing → Billing Run**: the new subscription is due today; generate its invoice. Running it again skips it (already billed).
4. **Billing → Invoices**: open the draft, Confirm, Send (it appears in **Outbox**), then Record Payment (partial, then the rest: it becomes Paid).
5. **Billing → Payments** lists the payments; the dashboard figures update.
6. Log in as `acme@example.com`: the portal shows only Acme's subscriptions and invoices; close an active subscription early if its plan allows it.

## Git workflow

Branch per feature (`feat/<area>-<thing>`), small pull requests reviewed by another member, never commit directly to `main`. See `TEAM_PLAN.md` section 7.

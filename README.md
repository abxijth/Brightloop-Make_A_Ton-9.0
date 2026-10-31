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
alembic upgrade head          # once the initial migration is merged
python seed.py                # once the seed script is merged
uvicorn app.main:app --reload

# 4. Frontend (http://localhost:5173), once the shell is merged
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

## Demo logins

Filled in when `seed.py` lands.

## Git workflow

Branch per feature (`feat/<area>-<thing>`), small pull requests reviewed by another member, never commit directly to `main`. See `TEAM_PLAN.md` section 7.

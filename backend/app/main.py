from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_error_handlers
from app.routers import auth, customers, discounts, invoices, operations, outbox, plans, products, staff, taxes

app = FastAPI(title="Brightloop Subscription Management")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)
app.include_router(auth.router)
app.include_router(invoices.router)
app.include_router(operations.router)
app.include_router(outbox.router)
app.include_router(staff.router)
app.include_router(customers.router)
app.include_router(taxes.router)
app.include_router(products.router)
app.include_router(plans.router)
app.include_router(discounts.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}

"""One JSON error shape for the whole API.

    {"error": {"code": "validation_error",
               "message": "Please fix the highlighted fields.",
               "fields": {"email": "Email is already registered"}}}

`fields` is always present (empty object when the error is not about a field),
and keys are the request field names, so the frontend can map them onto inputs.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


class AppError(Exception):
    """Raise from services/routers for a business-rule failure."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "bad_request",
        status_code: int = 400,
        fields: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.fields = fields or {}


def error_body(code: str, message: str, fields: dict[str, str] | None = None) -> dict:
    return {"error": {"code": code, "message": message, "fields": fields or {}}}


_HTTP_CODES = {
    400: "bad_request",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
}


def _field_name(loc: tuple) -> str:
    # loc looks like ("body", "email") or ("query", "page"); drop the source.
    parts = [str(p) for p in loc[1:]] if len(loc) > 1 else [str(p) for p in loc]
    return ".".join(parts) or "_"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.code, exc.message, exc.fields), status_code=exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for err in exc.errors():
            msg = err["msg"].removeprefix("Value error, ")
            fields.setdefault(_field_name(err["loc"]), msg)
        return JSONResponse(
            error_body("validation_error", "Please fix the highlighted fields.", fields),
            status_code=422,
        )

    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "error")
        return JSONResponse(
            error_body(code, str(exc.detail)),
            status_code=exc.status_code,
            headers=exc.headers,
        )

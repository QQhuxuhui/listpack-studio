"""Error envelope mirrors of `packages/shared-schemas/src/errors.ts`."""

from typing import Any

from pydantic import BaseModel


class ApiErrorBody(BaseModel):
    type: str
    code: str | None = None
    message: str
    detail: Any | None = None
    request_id: str | None = None


class ApiError(BaseModel):
    error: ApiErrorBody


def make_api_error(
    type_: str,
    message: str,
    *,
    code: str | None = None,
    detail: Any | None = None,
    request_id: str | None = None,
) -> ApiError:
    return ApiError(
        error=ApiErrorBody(
            type=type_,
            message=message,
            code=code,
            detail=detail,
            request_id=request_id,
        ),
    )

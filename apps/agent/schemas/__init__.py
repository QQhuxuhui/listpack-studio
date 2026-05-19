"""Pydantic mirrors of `packages/shared-schemas` (TypeScript / zod).

Keep these in lock-step with the TS side. When changing a schema:
1. Update the TS file under `packages/shared-schemas/src/`.
2. Update the matching Python file here in the same commit.
3. Update `packages/shared-schemas/README.md` if the mapping changes.

This manual mirror is intentional during D1-D5; we revisit codegen once schemas grow.
"""

from .errors import ApiError, ApiErrorBody, make_api_error
from .hello import HelloRequest, HelloResponse
from .sse import (
    RunCompletedEvent,
    RunFailedEvent,
    RunStartedEvent,
    SSEEvent,
    SSEEventName,
    StepCompletedEvent,
    StepIntermediateEvent,
)

__all__ = [
    "ApiError",
    "ApiErrorBody",
    "make_api_error",
    "HelloRequest",
    "HelloResponse",
    "RunCompletedEvent",
    "RunFailedEvent",
    "RunStartedEvent",
    "SSEEvent",
    "SSEEventName",
    "StepCompletedEvent",
    "StepIntermediateEvent",
]

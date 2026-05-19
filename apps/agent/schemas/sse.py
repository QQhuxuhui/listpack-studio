"""SSE envelope mirrors of `packages/shared-schemas/src/sse.ts`."""

from typing import Literal, Union

from pydantic import BaseModel

SSEEventName = Literal[
    "run.started",
    "run.completed",
    "run.failed",
    "step.started",
    "step.intermediate",
    "step.completed",
    "step.failed",
    "agent.plan",
    "awaiting_user",
    "cost_warning",
]


class RunStartedData(BaseModel):
    run_id: str
    message: str | None = None


class RunStartedEvent(BaseModel):
    event: Literal["run.started"] = "run.started"
    data: RunStartedData


class RunCompletedData(BaseModel):
    run_id: str
    cost_usd: float | None = None


class RunCompletedEvent(BaseModel):
    event: Literal["run.completed"] = "run.completed"
    data: RunCompletedData


class RunFailedData(BaseModel):
    run_id: str
    error: str


class RunFailedEvent(BaseModel):
    event: Literal["run.failed"] = "run.failed"
    data: RunFailedData


class StepCompletedData(BaseModel):
    node: str
    output: object  # JSON-serialisable; loosely typed to mirror zod's z.unknown()


class StepCompletedEvent(BaseModel):
    event: Literal["step.completed"] = "step.completed"
    data: StepCompletedData


class StepIntermediateData(BaseModel):
    node: str
    update: object


class StepIntermediateEvent(BaseModel):
    event: Literal["step.intermediate"] = "step.intermediate"
    data: StepIntermediateData


SSEEvent = Union[
    RunStartedEvent,
    RunCompletedEvent,
    RunFailedEvent,
    StepCompletedEvent,
    StepIntermediateEvent,
]

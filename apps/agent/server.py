"""ListPack agent service — FastAPI entry point.

Endpoints:
- GET  /health                        liveness probe
- POST /v1/hello                      one-shot hello (returns final state)
- GET  /v1/hello/stream               SSE-streamed hello (Painter-Commenter UX pattern)

The streaming pattern here is the template for all real agent endpoints:
SSE with event/data lines, EventSource-friendly, no WebSocket dependency.
"""

import json
import os
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from graphs.hello import build_graph

load_dotenv()

AGENT_SERVICE_TOKEN = os.environ.get("AGENT_SERVICE_TOKEN", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build compiled graphs once at startup, share across requests."""
    app.state.hello_graph = build_graph().compile()
    yield


app = FastAPI(
    title="ListPack Agent Service",
    version="0.1.0",
    description="LangGraph-backed agent service for cross-border e-commerce listing packs",
    lifespan=lifespan,
)


def require_service_token(request: Request) -> None:
    """Service-to-service auth: web → agent must present shared token.

    Skipped if AGENT_SERVICE_TOKEN is empty (local dev convenience).
    """
    if not AGENT_SERVICE_TOKEN:
        return
    presented = request.headers.get("x-agent-service-token", "")
    if presented != AGENT_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="invalid service token")


class HelloRequest(BaseModel):
    message: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "listpack-agent", "version": "0.1.0"}


@app.post("/v1/hello")
async def hello_oneshot(req: HelloRequest, request: Request) -> dict:
    """One-shot run: returns final state."""
    require_service_token(request)
    graph = request.app.state.hello_graph
    result = await graph.ainvoke({"message": req.message, "plan": [], "response": ""})
    return result


@app.get("/v1/hello/stream")
async def hello_stream(message: str, request: Request) -> EventSourceResponse:
    """SSE stream: emits each step's state as a `step` event.

    Matches the streaming pattern described in PRD 01 § 4.3.
    """
    require_service_token(request)
    graph = request.app.state.hello_graph
    run_id = str(uuid.uuid4())

    async def event_generator():
        yield {
            "event": "run.started",
            "data": json.dumps({"run_id": run_id, "message": message}),
        }
        async for event in graph.astream(
            {"message": message, "plan": [], "response": ""}, stream_mode="updates"
        ):
            # event is dict keyed by node name -> node output
            for node, output in event.items():
                yield {
                    "event": "step.completed",
                    "data": json.dumps({"node": node, "output": output}),
                }
        yield {"event": "run.completed", "data": json.dumps({"run_id": run_id})}

    return EventSourceResponse(event_generator())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=os.environ.get("AGENT_HOST", "0.0.0.0"),
        port=int(os.environ.get("AGENT_PORT", "8000")),
        reload=True,
    )

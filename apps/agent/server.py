"""ListPack agent service — FastAPI entry point.

Endpoints:
- GET  /health                               liveness probe
- POST /v1/hello                             one-shot hello demo
- GET  /v1/hello/stream                      SSE hello demo (D3)
- POST /v1/compliance/check                  multipart image upload → ComplianceReport (D10)
- GET  /v1/compliance/rules                  list active rules in DB
- POST /v1/compliance/rules/reload           bust in-process rule cache

Streaming uses SSE; one-shot calls return JSON.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from compliance.engine import run_compliance_check
from compliance.fixers import fixer_registry
from compliance.loader import (
    list_all_active_rules,
    load_active_rules,
    reload_rules,
)
from compliance.schemas import ComplianceReport
from generators import C2PAStamper, ImageExecutor, InMemoryImageCache, PlatformAdapter
from graphs.hello import build_graph
from graphs.listing_pack import Critic, Planner
from graphs.listing_pack.nodes import Services as ListingPackServices
from models import ModelRouter
from models.sparkcode_client import SparkcodeClient
from runtime import (
    HITLError,
    InvalidStateTransition,
    RunNotFound,
    cancel_run,
    fork_run,
    get_agent_run,
    list_agent_steps,
    pause_run,
    resume_run,
    run_listing_pack_streamed,
)
from scene_spec import SceneJsonExecutor

load_dotenv()

# D47 — JSON-line logs in production; readable text in dev.
if os.environ.get("LOG_FORMAT", "").lower() == "json":
    from observability import install_json_handler

    install_json_handler()
else:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

AGENT_SERVICE_TOKEN = os.environ.get("AGENT_SERVICE_TOKEN", "")

# Match `platformEnum` in apps/web/lib/db/schema.ts
PlatformLiteral = Literal["amazon", "shopify", "ebay", "temu", "shein"]


def _build_listing_pack_services() -> ListingPackServices:
    """Wire production Services (router + executors + planner + critic)."""
    clients = {}
    sparkcode_url = os.environ.get("SPARKCODE_BASE_URL")
    sparkcode_key = os.environ.get("SPARKCODE_API_KEY")
    if sparkcode_url and sparkcode_key:
        clients["sparkcode"] = SparkcodeClient(
            base_url=sparkcode_url,
            api_key=sparkcode_key,
        )
    router = ModelRouter(clients=clients)
    scene_exec = SceneJsonExecutor(router)
    image_exec = ImageExecutor(router=router, cache=InMemoryImageCache())
    return ListingPackServices(
        router=router,
        scene_executor=scene_exec,
        image_executor=image_exec,
        platform_adapter=PlatformAdapter(),
        c2pa_stamper=C2PAStamper(),
        planner=Planner(router) if clients else None,
        critic=Critic(router) if clients else None,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build compiled graphs once at startup, share across requests."""
    app.state.hello_graph = build_graph().compile()
    app.state.listing_pack_services = _build_listing_pack_services()
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


# ───────────────────────────────────────────────────────── health
class HelloRequest(BaseModel):
    message: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "listpack-agent", "version": "0.1.0"}


# ───────────────────────────────────────────────────────── hello (D3)
@app.post("/v1/hello")
async def hello_oneshot(req: HelloRequest, request: Request) -> dict:
    require_service_token(request)
    graph = request.app.state.hello_graph
    return await graph.ainvoke({"message": req.message, "plan": [], "response": ""})


@app.get("/v1/hello/stream")
async def hello_stream(message: str, request: Request) -> EventSourceResponse:
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
            for node, output in event.items():
                yield {
                    "event": "step.completed",
                    "data": json.dumps({"node": node, "output": output}),
                }
        yield {"event": "run.completed", "data": json.dumps({"run_id": run_id})}

    return EventSourceResponse(event_generator())


# ───────────────────────────────────────────────────────── compliance (D10)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB, matches PRD § 01 § 2.1 upload cap

ALLOWED_UPLOAD_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/tiff",
    "image/heic",
    "image/gif",
}


@app.post("/v1/compliance/check", response_model=ComplianceReport)
async def compliance_check(
    request: Request,
    file: Annotated[UploadFile, File(description="Image to check")],
    target_platform: Annotated[PlatformLiteral, Form()],
    target_category: Annotated[str | None, Form()] = None,
) -> ComplianceReport:
    """Run all active rules for (platform, category) against an uploaded image.

    Does NOT consume the workspace's SKU quota (PRD § 01 § 4.2 — checks are
    free; only successful auto-fix or generation consumes SKUs).
    """
    require_service_token(request)

    mime = (file.content_type or "").lower()
    if mime and mime not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(415, f"unsupported media type: {mime}")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(400, "empty upload")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            f"file too large: {len(image_bytes)} bytes > limit {MAX_UPLOAD_BYTES}",
        )

    # Both load_active_rules (DB I/O) and run_compliance_check (CV inference)
    # are sync, sometimes slow (PaddleOCR / DETR). Run on the FastAPI threadpool
    # so the event loop stays responsive.
    rules = await run_in_threadpool(
        load_active_rules, target_platform, target_category
    )
    report = await run_in_threadpool(
        run_compliance_check,
        image_bytes,
        mime or "image/jpeg",
        rules,
        target_platform=target_platform,
        target_category=target_category,
        rule_set_version=1,
    )
    return report


@app.get("/v1/compliance/rules")
async def list_rules(request: Request) -> dict:
    """List all active rules in DB, grouped by platform.

    Intended for admin debugging / docs. Not paginated — there's < 1000 rules.
    """
    require_service_token(request)

    by_platform: dict[str, list[dict]] = {}
    for rule in await run_in_threadpool(lambda: list(list_all_active_rules())):
        by_platform.setdefault(rule.platform, []).append(
            {
                "rule_key": rule.rule_key,
                "applies_to_slot": rule.applies_to_slot,
                "applies_to_category": rule.applies_to_category,
                "detector_type": rule.detector_type,
                "severity": rule.severity.value,
                "version": rule.version,
                "title_en": rule.display_title.get("en"),
                "title_zh": rule.display_title.get("zh"),
            }
        )
    total = sum(len(v) for v in by_platform.values())
    return {"total": total, "by_platform": by_platform}


@app.post("/v1/compliance/rules/reload")
async def reload_rules_endpoint(request: Request) -> dict:
    """Drop the in-process rule cache; next check re-reads from DB."""
    require_service_token(request)
    reload_rules()
    return {"reloaded": True}


@app.post("/v1/compliance/auto-fix")
async def compliance_auto_fix(
    request: Request,
    file: Annotated[UploadFile, File(description="Image to fix")],
    actions: Annotated[str, Form(description="JSON array of {type, spec} actions")],
) -> dict:
    """Apply one or more auto-fix actions in sequence.

    Body is multipart so the image streams. `actions` is a JSON-encoded
    array of `{type: str, spec: dict}` objects matching the `auto_fix`
    blobs from ComplianceReport. Actions are applied in order, each
    feeding the next.

    Consumes 1 SKU from the caller's quota (PRD § 01 § 4.2). For now we
    apply that cap at the web proxy layer; D11+ will move metering here
    once UsageRecord writes are wired in.
    """
    require_service_token(request)

    mime = (file.content_type or "").lower()
    if mime and mime not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(415, f"unsupported media type: {mime}")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(400, "empty upload")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"file too large: {len(image_bytes)} bytes")

    try:
        action_list = json.loads(actions)
        assert isinstance(action_list, list)
    except (json.JSONDecodeError, AssertionError) as exc:
        raise HTTPException(400, f"actions must be a JSON array: {exc}") from exc

    current_bytes = image_bytes
    current_mime = mime or "image/jpeg"
    applied: list[dict] = []

    for i, action in enumerate(action_list):
        if not isinstance(action, dict) or "type" not in action:
            raise HTTPException(400, f"action[{i}] must be {{type, spec}}")
        fix_type = action["type"]
        spec = action.get("spec", {})

        fixer = fixer_registry.get(fix_type)
        if fixer is None:
            raise HTTPException(
                400, f"unknown fixer: {fix_type!r} (known: {sorted(fixer_registry)})"
            )

        # Each fixer is CPU-bound (Pillow / numpy); use threadpool.
        result = await run_in_threadpool(fixer, current_bytes, current_mime, spec)
        current_bytes = result.bytes_out
        current_mime = result.mime_out
        applied.append({"type": fix_type, "metadata": result.metadata})

    import base64

    return {
        "image_base64": base64.b64encode(current_bytes).decode("ascii"),
        "mime": current_mime,
        "size_bytes": len(current_bytes),
        "applied": applied,
    }


# ───────────────────────────────────────────────────────── listing_pack agent (D24)


@app.post("/v1/agent/listing-pack/runs")
async def listing_pack_run(
    request: Request,
    file: Annotated[UploadFile, File(description="Source product image")],
    listing_pack_id: Annotated[str, Form(description="ListingPack row id")],
    target_platforms: Annotated[
        str, Form(description="JSON array of target platforms, e.g. [\"amazon\"]")
    ],
    target_category: Annotated[str | None, Form()] = None,
    user_intent: Annotated[str | None, Form()] = None,
    cost_cap_usd: Annotated[str, Form()] = "0.50",
) -> EventSourceResponse:
    """Start a listing_pack run and stream every step as SSE.

    Each event is one of:
    - `run.started`      — emitted before any node runs
    - `step.completed`   — one per executed step (plan, compliance_check, scene_json, ...)
    - `run.completed`    — terminal, success
    - `run.failed`       — terminal, with `error` payload

    The run is persisted to `agent_runs` + `agent_steps` in Postgres so
    the UI can resume / replay.
    """
    require_service_token(request)

    mime = (file.content_type or "").lower()
    if mime and mime not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(415, f"unsupported media type: {mime}")
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(400, "empty upload")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"file too large: {len(image_bytes)} bytes")

    try:
        platforms = json.loads(target_platforms)
        if not isinstance(platforms, list) or not platforms:
            raise ValueError("target_platforms must be a non-empty JSON array")
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc

    services = request.app.state.listing_pack_services
    persist = bool(os.environ.get("POSTGRES_URL"))

    async def event_generator():
        async for sse in run_listing_pack_streamed(
            services,
            input_={
                "run_id": "(generated)",
                "source_image_bytes": image_bytes,
                "source_image_mime": mime or "image/jpeg",
                "target_platforms": platforms,
                "target_category": target_category,
                "user_intent": user_intent,
                "cost_cap_usd": cost_cap_usd,
            },
            listing_pack_id=listing_pack_id,
            persist=persist,
            enforce_quota=persist,  # gate when DB is reachable (PRD § 00 § 5)
        ):
            yield sse

    return EventSourceResponse(event_generator())


@app.get("/v1/agent/listing-pack/runs/{run_id}")
async def get_listing_pack_run(run_id: str, request: Request) -> dict:
    """Snapshot of a run — latest state, plan, cost, steps."""
    require_service_token(request)

    record = await run_in_threadpool(get_agent_run, run_id)
    if record is None:
        raise HTTPException(404, f"run {run_id} not found")

    steps = await run_in_threadpool(list_agent_steps, run_id)

    return {
        "run": {
            "id": record.id,
            "listing_pack_id": record.listing_pack_id,
            "status": record.status,
            "current_step": record.current_step,
            "plan": record.plan,
            "state": record.state,
            "cost_cap_usd": str(record.cost_cap_usd) if record.cost_cap_usd else None,
            "cost_spent_usd": str(record.cost_spent_usd),
            "started_at": record.started_at.isoformat() if record.started_at else None,
            "ended_at": record.ended_at.isoformat() if record.ended_at else None,
            "error": record.error,
            "created_at": record.created_at.isoformat(),
        },
        "steps": [
            {
                "id": s.id,
                "step_name": s.step_name,
                "status": s.status,
                "outputs": s.outputs,
                "error": s.error,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            }
            for s in steps
        ],
    }


# ───────────────────────────────────────────────────────── HITL (D25)


class ForkOverrides(BaseModel):
    plan: dict | None = None
    cost_cap_usd: str | None = None


class CancelBody(BaseModel):
    reason: str | None = None


def _hitl_error_to_http(exc: HITLError) -> HTTPException:
    if isinstance(exc, RunNotFound):
        return HTTPException(404, str(exc))
    if isinstance(exc, InvalidStateTransition):
        return HTTPException(409, str(exc))
    return HTTPException(400, str(exc))


@app.post("/v1/agent/listing-pack/runs/{run_id}/pause")
async def hitl_pause(run_id: str, request: Request) -> dict:
    """Cooperative pause. Runner stops after the current step finishes."""
    require_service_token(request)
    try:
        new_status = await run_in_threadpool(pause_run, run_id)
    except HITLError as exc:
        raise _hitl_error_to_http(exc) from exc
    return {"run_id": run_id, "status": new_status}


@app.post("/v1/agent/listing-pack/runs/{run_id}/resume")
async def hitl_resume(run_id: str, request: Request) -> dict:
    """Flip back to running. Caller must re-POST /runs to actually re-drive
    the graph (D25 v1; D34 will swap in LangGraph checkpointer)."""
    require_service_token(request)
    try:
        new_status = await run_in_threadpool(resume_run, run_id)
    except HITLError as exc:
        raise _hitl_error_to_http(exc) from exc
    return {"run_id": run_id, "status": new_status}


@app.post("/v1/agent/listing-pack/runs/{run_id}/cancel")
async def hitl_cancel(run_id: str, request: Request, body: CancelBody | None = None) -> dict:
    require_service_token(request)
    reason = body.reason if body else None
    try:
        new_status = await run_in_threadpool(cancel_run, run_id, reason=reason)
    except HITLError as exc:
        raise _hitl_error_to_http(exc) from exc
    return {"run_id": run_id, "status": new_status, "reason": reason}


@app.post("/v1/agent/listing-pack/runs/{run_id}/fork")
async def hitl_fork(run_id: str, request: Request, body: ForkOverrides | None = None) -> dict:
    """Branch off into a new pending run; caller can re-POST /runs against it."""
    require_service_token(request)
    overrides: dict | None = None
    if body:
        from decimal import Decimal as _Dec

        overrides = {}
        if body.plan is not None:
            overrides["plan"] = body.plan
        if body.cost_cap_usd is not None:
            try:
                overrides["cost_cap_usd"] = _Dec(body.cost_cap_usd)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(400, f"invalid cost_cap_usd: {exc}") from exc
    try:
        new_id = await run_in_threadpool(fork_run, run_id, overrides=overrides)
    except HITLError as exc:
        raise _hitl_error_to_http(exc) from exc
    return {"source_run_id": run_id, "new_run_id": new_id, "status": "pending"}


# ───────────────────────────────────────────────────────── main
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=os.environ.get("AGENT_HOST", "0.0.0.0"),
        port=int(os.environ.get("AGENT_PORT", "8000")),
        reload=True,
    )

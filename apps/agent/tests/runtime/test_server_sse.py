"""D24 server-level integration test for /v1/agent/listing-pack/runs.

Uses FastAPI's TestClient + a stubbed listing_pack_services that bypasses
real LLM / DB calls. Verifies the SSE response contains the expected
event types in order.
"""

from __future__ import annotations

import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import server


def _white_jpeg() -> bytes:
    img = Image.new("RGB", (512, 512), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


def _parse_sse(body: str) -> list[dict]:
    """Parse SSE body into a list of {event, data(json)} dicts."""
    events = []
    current_event = None
    current_data = []
    for line in body.splitlines():
        if line.startswith("event:"):
            current_event = line[len("event:") :].strip()
        elif line.startswith("data:"):
            current_data.append(line[len("data:") :].strip())
        elif line == "":
            if current_event:
                events.append(
                    {
                        "event": current_event,
                        "data": json.loads("\n".join(current_data)) if current_data else None,
                    }
                )
            current_event = None
            current_data = []
    return events


@pytest.fixture
def client_with_mocked_services(mocked_services, monkeypatch):
    """Build a TestClient that uses the mocked Services bag (no real LLM)."""
    # Ensure POSTGRES_URL is unset so the endpoint skips persistence
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    # The token is read at module import time; clear at module scope too
    monkeypatch.setattr(server, "AGENT_SERVICE_TOKEN", "")

    def _build():
        return mocked_services

    monkeypatch.setattr(server, "_build_listing_pack_services", _build)

    with TestClient(server.app) as tc:
        yield tc


def test_post_listing_pack_run_streams_sse_events(client_with_mocked_services):
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs",
        files={"file": ("p.jpg", _white_jpeg(), "image/jpeg")},
        data={
            "listing_pack_id": "00000000-0000-0000-0000-000000000001",
            "target_platforms": json.dumps(["amazon"]),
            "cost_cap_usd": "1.00",
        },
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")

    events = _parse_sse(resp.text)
    event_names = [e["event"] for e in events]

    assert event_names[0] == "run.started"
    assert event_names[-1] == "run.completed"
    # at least one of every node
    step_events = [e for e in events if e["event"] == "step.completed"]
    step_names = {e["data"]["step"] for e in step_events}
    for required in ("plan", "compliance_check", "scene_json", "image_gen", "platform_adapt", "c2pa_stamp"):
        assert required in step_names, f"missing {required}: {sorted(step_names)}"

    # final run.completed carries success
    final = events[-1]["data"]
    assert final["status"] == "completed"
    assert int(final["platform_outputs_count"]) >= 1


def test_post_listing_pack_run_rejects_bad_platforms(client_with_mocked_services):
    """target_platforms must be a JSON array, non-empty."""
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs",
        files={"file": ("p.jpg", _white_jpeg(), "image/jpeg")},
        data={
            "listing_pack_id": "00000000-0000-0000-0000-000000000001",
            "target_platforms": "[]",
            "cost_cap_usd": "1.00",
        },
    )
    assert resp.status_code == 400


def test_post_listing_pack_run_rejects_empty_upload(client_with_mocked_services):
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs",
        files={"file": ("p.jpg", b"", "image/jpeg")},
        data={
            "listing_pack_id": "00000000-0000-0000-0000-000000000001",
            "target_platforms": json.dumps(["amazon"]),
        },
    )
    assert resp.status_code == 400


def test_post_listing_pack_run_rejects_unsupported_mime(client_with_mocked_services):
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs",
        files={"file": ("p.txt", b"hello", "text/plain")},
        data={
            "listing_pack_id": "00000000-0000-0000-0000-000000000001",
            "target_platforms": json.dumps(["amazon"]),
        },
    )
    assert resp.status_code == 415


# ─── HITL endpoints (D25) — unit, using monkey-patched runtime fns ─


def test_hitl_pause_endpoint_returns_paused(client_with_mocked_services, monkeypatch):
    monkeypatch.setattr(server, "pause_run", lambda run_id: "paused")
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs/00000000-0000-0000-0000-000000000abc/pause"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "run_id": "00000000-0000-0000-0000-000000000abc",
        "status": "paused",
    }


def test_hitl_pause_unknown_run_returns_404(client_with_mocked_services, monkeypatch):
    from runtime.hitl import RunNotFound

    def _raise(_id: str):
        raise RunNotFound("nope")

    monkeypatch.setattr(server, "pause_run", _raise)
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs/zzz/pause"
    )
    assert resp.status_code == 404


def test_hitl_pause_terminal_returns_409(client_with_mocked_services, monkeypatch):
    from runtime.hitl import InvalidStateTransition

    def _raise(_id: str):
        raise InvalidStateTransition("already canceled")

    monkeypatch.setattr(server, "pause_run", _raise)
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs/yyy/pause"
    )
    assert resp.status_code == 409


def test_hitl_cancel_endpoint_with_reason(client_with_mocked_services, monkeypatch):
    captured: dict = {}

    def _stub(run_id, *, reason=None):
        captured["run_id"] = run_id
        captured["reason"] = reason
        return "canceled"

    monkeypatch.setattr(server, "cancel_run", _stub)
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs/r1/cancel",
        json={"reason": "user changed their mind"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "canceled"
    assert captured == {"run_id": "r1", "reason": "user changed their mind"}


def test_hitl_fork_endpoint_returns_new_run_id(client_with_mocked_services, monkeypatch):
    monkeypatch.setattr(server, "fork_run", lambda src, *, overrides=None: "new-1")
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs/r1/fork",
        json={"plan": {"render_banner": True}, "cost_cap_usd": "2.0"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_run_id"] == "r1"
    assert body["new_run_id"] == "new-1"


def test_hitl_resume_endpoint_returns_running(client_with_mocked_services, monkeypatch):
    monkeypatch.setattr(server, "resume_run", lambda run_id: "running")
    resp = client_with_mocked_services.post(
        "/v1/agent/listing-pack/runs/r1/resume"
    )
    assert resp.status_code == 200
    assert resp.json() == {"run_id": "r1", "status": "running"}

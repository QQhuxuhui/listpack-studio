# ListPack Agent Service

Python LangGraph + FastAPI service that runs the multi-step image-generation agents.

## Stack

- **LangGraph** — agent orchestration with checkpointer + interrupt + streaming
- **FastAPI** — HTTP entry point (called by `apps/web`)
- **SSE (sse-starlette)** — streaming agent progress to web clients
- **PaddleOCR** (D2+) — in-process OCR for compliance checks
- **c2pa-python** (D2+) — compliance metadata stamping
- **uv** — Python dependency manager

## Local dev

```bash
# from repo root
pnpm agent:install        # creates .venv via uv
cp apps/agent/.env.example apps/agent/.env

# start the service (auto-reloads)
pnpm agent:dev            # → http://localhost:8000
```

Try it:

```bash
curl http://localhost:8000/health

curl -X POST http://localhost:8000/v1/hello \
  -H "content-type: application/json" \
  -d '{"message":"world"}'

curl -N "http://localhost:8000/v1/hello/stream?message=world"
```

## Project layout

```
apps/agent/
├── pyproject.toml          uv project + deps
├── .python-version         3.12
├── .env.example
├── server.py               FastAPI entry
└── graphs/
    ├── __init__.py
    └── hello.py            placeholder graph; will be replaced by:
                            - listing_pack.py
                            - refinement_loop.py
                            - scene_json.py
                            (see ../../docs/prd/02-agent-orchestration.md)
```

## Web ↔ Agent contract

See [`../../docs/prd/01-system-design.md § 4`](../../docs/prd/01-system-design.md) — REST + SSE.
Auth: shared bearer token in `x-agent-service-token` header.

## Deployment

D5+ decision. Candidates:
- **Fly.io** — simplest for FastAPI + persistent volume (sqlite checkpointer)
- **Railway** — similar
- **Modal** — serverless GPU available if we ever self-host models
- **LangGraph Cloud** — managed LangGraph, includes studio UI

Until decided, runs locally and on a small VPS via Docker.

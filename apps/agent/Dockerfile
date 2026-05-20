# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────
#  apps/agent — Python 3.12 + uv + uvicorn.
#
#  Build (from repo root or apps/agent):
#      docker build -f apps/agent/Dockerfile -t listpack/agent apps/agent
#
#  Run:
#      docker run --rm -p 8000:8000 \
#        -e POSTGRES_URL=... -e AGENT_SERVICE_TOKEN=secret \
#        -e SPARKCODE_BASE_URL=... -e SPARKCODE_API_KEY=... \
#        -v listpack_storage:/storage \
#        listpack/agent
#
#  Notes:
#    - The agent image is heavy (PaddleOCR, transformers CPU wheels,
#      OpenCV, torch ~2 GB). Keep it on a sidecar host or pre-warmed
#      Fly machine, not a serverless function.
#    - STORAGE_ROOT defaults to /storage; mount a persistent volume so
#      outputs survive restarts (must match web's STORAGE_ROOT — see
#      docker-compose.yml).
# ─────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

# Tools + system libs PaddleOCR / OpenCV need
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        ca-certificates \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
 && rm -rf /var/lib/apt/lists/*

# Install uv (Astral's Python package manager — pyproject.toml workflow)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
 && mv /root/.local/bin/uv /usr/local/bin/uv

WORKDIR /app

# Lock first, then code — keeps the heavy `uv sync` layer cached when
# only source files change.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

ENV PYTHONUNBUFFERED=1 \
    LOG_FORMAT=json \
    AGENT_HOST=0.0.0.0 \
    AGENT_PORT=8000 \
    STORAGE_ROOT=/storage

RUN mkdir -p /storage \
 && groupadd -r agent && useradd -r -g agent -d /app agent \
 && chown -R agent:agent /app /storage
USER agent

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uv", "run", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]

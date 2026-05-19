"""Build synthetic test fixtures used by D8 object-detection tests.

DETR is trained on natural images and won't reliably classify
PIL-drawn rectangles. So we fetch a handful of clean public-domain
product photos (Wikimedia Commons / unsplash CC0) once and cache locally.

Run directly with `python -m tests.fixtures.build` or it'll be invoked
lazily by the test loader when a fixture file is missing.
"""

from __future__ import annotations

import os
import ssl
import urllib.request
from pathlib import Path

import certifi

FIXTURES = Path(__file__).resolve().parent


def _build_ssl_context() -> ssl.SSLContext:
    """SSL context that works in dev, CI, AND sandboxed envs with a TLS proxy.

    Order of preference:
    1. Explicit override via env var REQUESTS_CA_BUNDLE / SSL_CERT_FILE
    2. NODE_EXTRA_CA_CERTS (Claude Code / similar sandboxes inject proxy CA here)
    3. System-wide bundle /etc/ssl/certs/ca-certificates.crt
       (Linux containers usually merge sandbox CAs into this)
    4. certifi's stock Mozilla bundle (offline dev, no proxy)
    """
    candidates: list[str] = []
    for env_var in ("REQUESTS_CA_BUNDLE", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"):
        v = os.environ.get(env_var)
        if v and Path(v).is_file():
            candidates.append(v)
    candidates.append("/etc/ssl/certs/ca-certificates.crt")
    candidates.append(certifi.where())

    chosen = next((p for p in candidates if Path(p).is_file()), None)
    if chosen is None:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=chosen)


_SSL_CTX = _build_ssl_context()

# Public-domain / permissively-licensed product photos suitable for DETR.
# Choices kept small (<300KB each) so the repo doesn't bloat.
SOURCES: dict[str, str] = {
    # Single bottle on white-ish background → person_in_image pass case
    "bottle_clean_white.jpg": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/"
        "Bottle_of_wine.jpg/512px-Bottle_of_wine.jpg"
    ),
    # Person visibly holding a bottle → person_in_image fail case
    "person_holding_bottle.jpg": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/"
        "Glass_of_beer.jpg/512px-Glass_of_beer.jpg"
    ),
    # Multiple bottles in frame → object_count fail case
    "multiple_bottles.jpg": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/"
        "Bottles_of_Coca-Cola_collection.jpg/512px-Bottles_of_Coca-Cola_collection.jpg"
    ),
}

USER_AGENT = "ListPack-Studio/0.1 (compliance test fixture builder)"


def build_all() -> None:
    """Download every fixture that isn't present yet."""
    for name, url in SOURCES.items():
        target = FIXTURES / name
        if target.is_file() and target.stat().st_size > 0:
            continue
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
            target.write_bytes(resp.read())
        print(f"downloaded {name} → {target}")


if __name__ == "__main__":
    build_all()

"""D37 storage path + put helpers — unit tests (no PG required)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from runtime import storage


@pytest.fixture
def tmp_root(monkeypatch):
    with tempfile.TemporaryDirectory(prefix="listpack-agent-storage-") as d:
        monkeypatch.setenv("STORAGE_ROOT", d)
        yield Path(d).resolve()


def test_ext_for_known_mimes():
    assert storage.ext_for("image/jpeg") == "jpg"
    assert storage.ext_for("image/png") == "png"
    assert storage.ext_for("image/webp") == "webp"
    assert storage.ext_for("application/octet-stream") == "bin"


def test_build_asset_key_format():
    key = storage.build_asset_key("ws-1", "asset-9", "image/png")
    assert key == "workspaces/ws-1/assets/asset-9.png"


def test_public_url_percent_encodes_slashes():
    url = storage.public_url("workspaces/abc/assets/xyz.jpg")
    assert url.startswith("/api/assets/by-key/")
    assert "workspaces%2Fabc%2Fassets%2Fxyz.jpg" in url


def test_put_bytes_writes_file_and_mime_sidecar(tmp_root):
    key = "workspaces/w1/assets/a1.png"
    data = b"\x89PNG\r\n\x1a\nfake"
    out = storage.put_bytes(key=key, data=data, mime="image/png")

    assert out.size == len(data)
    assert len(out.sha256) == 64
    assert out.storage_key == key

    full = tmp_root / key
    assert full.read_bytes() == data
    assert full.with_suffix(full.suffix + ".mime").read_text() == "image/png"


def test_put_bytes_rejects_traversal_keys(tmp_root):
    with pytest.raises(ValueError, match="escapes root"):
        storage.put_bytes(
            key="../escape.png", data=b"x", mime="image/png"
        )

"""D18 C2PAStamper tests — AI-disclosure metadata round-trip."""

from __future__ import annotations

import io
from datetime import datetime, timezone

import pytest
from PIL import Image

from generators import (
    DISCLOSURE_LABEL,
    C2PAStamper,
    is_ai_disclosed,
    read_disclosure,
)


@pytest.fixture
def stamper() -> C2PAStamper:
    return C2PAStamper()


def _jpeg() -> bytes:
    img = Image.new("RGB", (200, 200), (180, 180, 180))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _png() -> bytes:
    img = Image.new("RGBA", (200, 200), (180, 180, 180, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _webp() -> bytes:
    img = Image.new("RGB", (200, 200), (180, 180, 180))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=85)
    return buf.getvalue()


# ─── happy-path round trip per format ────────────────────────────


def test_jpeg_round_trip(stamper):
    src = _jpeg()
    assert not is_ai_disclosed(src)

    out = stamper.stamp(src, mime="image/jpeg", model_id="nano-banana")
    assert out.mime == "image/jpeg"

    assert is_ai_disclosed(out.bytes_out)
    parsed = read_disclosure(out.bytes_out)
    assert parsed is not None
    assert parsed["Disclosure"] == DISCLOSURE_LABEL
    assert parsed["GenModel"] == "nano-banana"
    assert "CreatedAt" in parsed


def test_png_round_trip(stamper):
    src = _png()
    out = stamper.stamp(
        src,
        mime="image/png",
        model_id="gpt-image-2",
        manifest_uri="https://listpack.io/manifests/abc123",
    )
    assert out.mime == "image/png"
    parsed = read_disclosure(out.bytes_out)
    assert parsed is not None
    assert parsed["GenModel"] == "gpt-image-2"
    assert parsed["DisclosureUri"] == "https://listpack.io/manifests/abc123"


def test_webp_round_trip(stamper):
    src = _webp()
    out = stamper.stamp(src, mime="image/webp", model_id="flux-kontext")
    assert out.mime == "image/webp"
    parsed = read_disclosure(out.bytes_out)
    assert parsed is not None
    assert parsed["GenModel"] == "flux-kontext"


# ─── unknown format gracefully re-encodes ───────────────────────


def test_unknown_format_falls_back_to_png():
    """TIFF input — we re-encode as PNG so metadata has a place to live."""
    tiff = Image.new("RGB", (100, 100), (200, 200, 200))
    buf = io.BytesIO()
    tiff.save(buf, format="TIFF")
    stamper = C2PAStamper()

    out = stamper.stamp(buf.getvalue(), mime="image/tiff", model_id="x")
    assert out.mime == "image/png"
    parsed = read_disclosure(out.bytes_out)
    assert parsed is not None


# ─── created_at is honoured + ISO 8601 ──────────────────────────


def test_created_at_explicit_value_round_trips(stamper):
    when = datetime(2026, 5, 19, 12, 34, 56, tzinfo=timezone.utc)
    out = stamper.stamp(_jpeg(), mime="image/jpeg", created_at=when)
    parsed = read_disclosure(out.bytes_out)
    assert parsed is not None
    assert parsed["CreatedAt"] == "2026-05-19T12:34:56Z"


def test_created_at_defaults_to_now(stamper):
    out = stamper.stamp(_jpeg(), mime="image/jpeg")
    parsed = read_disclosure(out.bytes_out)
    assert parsed is not None
    # Just sanity check the format; recent times are noisy in CI
    assert parsed["CreatedAt"].endswith("Z") and "T" in parsed["CreatedAt"]


# ─── audit helpers ──────────────────────────────────────────────


def test_is_ai_disclosed_on_unstamped_image():
    """Plain image without disclosure → False."""
    assert is_ai_disclosed(_jpeg()) is False


def test_read_disclosure_on_unstamped_returns_none():
    assert read_disclosure(_jpeg()) is None


# ─── pixels survive stamping ────────────────────────────────────


def test_jpeg_pixels_substantially_preserved(stamper):
    """Metadata write must not visibly change the picture."""
    src_img = Image.new("RGB", (200, 200), (90, 130, 200))
    buf = io.BytesIO()
    src_img.save(buf, format="JPEG", quality=92)
    out = stamper.stamp(buf.getvalue(), mime="image/jpeg")

    stamped_img = Image.open(io.BytesIO(out.bytes_out)).convert("RGB")
    centre = stamped_img.getpixel((100, 100))
    # Allow tiny JPEG re-encode wobble (±3 per channel)
    assert all(abs(c - t) <= 3 for c, t in zip(centre, (90, 130, 200))), centre

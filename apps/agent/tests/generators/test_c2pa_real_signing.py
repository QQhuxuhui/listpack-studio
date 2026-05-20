"""D55 — verify c2pa-python integration paths.

Two paths to cover:
1. C2PA_SIGNER_* env unset → XMP fallback still works, c2pa_signed=False
2. c2pa-python library available → Reader can probe the signed image
   (we DON'T set up real signing certs here — that requires PKI infra
   and is tested manually in DEPLOYMENT.md smoke test)
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from generators.c2pa_stamper import (
    C2PAStamper,
    has_c2pa_manifest,
    is_ai_disclosed,
    read_disclosure,
)


def _png(width: int = 200, height: int = 200) -> bytes:
    img = Image.new("RGB", (width, height), (180, 180, 180))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_stamp_falls_back_to_xmp_when_no_cert_configured(monkeypatch):
    monkeypatch.delenv("C2PA_SIGNER_CERT_PATH", raising=False)
    monkeypatch.delenv("C2PA_SIGNER_KEY_PATH", raising=False)

    stamper = C2PAStamper()
    result = stamper.stamp(_png(), mime="image/png", model_id="nano-banana-v1")

    assert result.c2pa_signed is False, "no cert → should fall back to XMP"
    assert result.mime == "image/png"
    # XMP disclosure round-trips
    assert is_ai_disclosed(result.bytes_out) is True
    parsed = read_disclosure(result.bytes_out)
    assert parsed is not None
    assert parsed["GenModel"] == "nano-banana-v1"
    assert parsed["DigitalSourceType"].endswith("trainedAlgorithmicMedia")


def test_stamp_includes_iptc_digital_source_type(monkeypatch):
    """PRD § 03 § 9 — IPTC NewsCodes value publishers (Reuters / AFP)
    use for AI-generated submissions."""
    monkeypatch.delenv("C2PA_SIGNER_CERT_PATH", raising=False)
    stamper = C2PAStamper()
    r = stamper.stamp(_png(), mime="image/png")
    parsed = read_disclosure(r.bytes_out)
    assert parsed is not None
    assert (
        parsed["DigitalSourceType"]
        == "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
    )


def test_stamp_handles_jpeg_format(monkeypatch):
    monkeypatch.delenv("C2PA_SIGNER_CERT_PATH", raising=False)
    img = Image.new("RGB", (200, 200), (200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)

    stamper = C2PAStamper()
    r = stamper.stamp(buf.getvalue(), mime="image/jpeg")
    assert r.mime == "image/jpeg"
    # JPEG XMP round-trips too
    assert is_ai_disclosed(r.bytes_out)


def test_has_c2pa_manifest_handles_unsigned():
    """Probing an XMP-only image shouldn't crash even when the c2pa
    library IS installed; it returns False (no manifest)."""
    img = _png()
    # img has no manifest — has_c2pa_manifest must return False, not raise
    assert has_c2pa_manifest(img) is False


def test_signer_path_validation_skips_when_files_missing(monkeypatch, tmp_path):
    """Setting C2PA_SIGNER_CERT_PATH to a non-existent file logs warn +
    falls back to XMP rather than crashing."""
    monkeypatch.setenv("C2PA_SIGNER_CERT_PATH", str(tmp_path / "nope.pem"))
    monkeypatch.setenv("C2PA_SIGNER_KEY_PATH", str(tmp_path / "nope.key"))

    stamper = C2PAStamper()
    r = stamper.stamp(_png(), mime="image/png")
    assert r.c2pa_signed is False
    assert is_ai_disclosed(r.bytes_out)


def test_signed_field_on_stamp_result_defaults_false():
    """API stability: callers (D37 persist_outputs metadata) read
    StampResult.c2pa_signed to decide whether to mark the output
    as 'auditor-ready'. Default must be False."""
    from generators.c2pa_stamper import StampResult

    r = StampResult(bytes_out=b"x", mime="image/png", disclosure={"k": "v"})
    assert r.c2pa_signed is False

"""C2PAStamper — embed AI-disclosure metadata for EU AI Act / 加州 SB 942.

PRD § 03 § 9: every AI-generated image leaving the system must carry
machine-readable provenance.

D55 wires the real `c2pa-python` SDK (Apache 2.0, https://github.com/contentauth/c2pa-python)
so outputs carry a cryptographically signed C2PA manifest that passes
`c2patool verify`. The previous v1 XMP-only path remains as fallback:

   Decision tree per call:
     - C2PA_SIGNER_CERT_PATH + C2PA_SIGNER_KEY_PATH set → real C2PA sign
     - c2pa-python import or sign failed → XMP-only fallback (warn-log)
     - env vars unset → XMP-only fallback (debug-log)

   In both cases we ALSO write the human-readable XMP packet so legacy
   tools that don't parse C2PA can still see the disclosure.

The signing cert can be self-signed for dev; production should use an
issuer chain that's pinned in the C2PA Trust List (CAI or Adobe-managed).
Cert generation is a one-liner with openssl — see DEPLOYMENT.md.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, PngImagePlugin

logger = logging.getLogger("listpack.generators.c2pa_stamper")

DISCLOSURE_LABEL = "AI-generated"
XMP_NS = "http://listpack.io/ns/c2pa/1.0/"

# IPTC NewsCodes value spec'd by C2PA for purely-AI-generated media.
IPTC_DIGITAL_SOURCE_TYPE = (
    "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
)


# ─── XMP fallback (D47 path, kept for environments without signing cert) ───


@dataclass
class StampResult:
    bytes_out: bytes
    mime: str
    disclosure: dict[str, str]
    c2pa_signed: bool = False


def _xmp_packet(disclosure: dict[str, str]) -> bytes:
    fields = "".join(
        f'<listpack:{k}>{_xml_escape(v)}</listpack:{k}>' for k, v in disclosure.items()
    )
    body = (
        f'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
        f'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        f'xmlns:xmp="http://ns.adobe.com/xap/1.0/" '
        f'xmlns:listpack="{XMP_NS}">'
        f'<rdf:Description rdf:about="">'
        f'<dc:creator><rdf:Seq><rdf:li>ListPack Studio</rdf:li></rdf:Seq></dc:creator>'
        f'<xmp:Label>{DISCLOSURE_LABEL}</xmp:Label>'
        f'<xmp:CreatorTool>ListPack Studio</xmp:CreatorTool>'
        f'{fields}'
        f'</rdf:Description></rdf:RDF>'
    )
    packet = (
        f'<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
        f'<x:xmpmeta xmlns:x="adobe:ns:meta/">{body}</x:xmpmeta>'
        f'<?xpacket end="w"?>'
    )
    return packet.encode("utf-8")


def _xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


# ─── C2PA manifest construction ─────────────────────────────────────


def _build_manifest(
    *,
    title: str,
    fmt: str,
    model_id: str | None,
    manifest_uri: str | None,
    created: str,
) -> dict:
    """Spec the C2PA manifest. Schema-org + c2pa.actions are the two
    industry-standard assertions adopted by Adobe / Microsoft / Truepic.

    The `trainedAlgorithmicMedia` digital_source_type is the IPTC code
    publishers (Reuters, AFP, NYT) require for AI-generated submissions.
    """
    actions = [
        {
            "action": "c2pa.created",
            "softwareAgent": "ListPack Studio",
            "when": created,
            "digitalSourceType": IPTC_DIGITAL_SOURCE_TYPE,
        }
    ]
    if model_id:
        actions[0]["parameters"] = {"model": model_id}

    assertions: list[dict] = [
        {
            "label": "stds.schema-org.CreativeWork",
            "data": {
                "@context": "https://schema.org",
                "@type": "CreativeWork",
                "author": [{"@type": "Organization", "name": "ListPack Studio"}],
                "dateCreated": created,
            },
        },
        {"label": "c2pa.actions", "data": {"actions": actions}},
    ]
    if manifest_uri:
        assertions.append(
            {
                "label": "stds.iptc.photo-metadata",
                "data": {"DigitalSourceType": IPTC_DIGITAL_SOURCE_TYPE},
            }
        )

    return {
        "claim_generator": "ListPack-Studio/0.1.0 c2pa-python",
        "claim_generator_info": [
            {"name": "ListPack Studio", "version": "0.1.0"}
        ],
        "title": title,
        "format": _format_to_mime(fmt),
        "assertions": assertions,
    }


def _format_to_mime(fmt: str) -> str:
    f = fmt.upper()
    if f in ("JPEG", "JPG"):
        return "image/jpeg"
    if f == "PNG":
        return "image/png"
    if f == "WEBP":
        return "image/webp"
    return "application/octet-stream"


def _signing_paths() -> tuple[Path | None, Path | None]:
    cert = os.environ.get("C2PA_SIGNER_CERT_PATH")
    key = os.environ.get("C2PA_SIGNER_KEY_PATH")
    if not cert or not key:
        return None, None
    cp, kp = Path(cert), Path(key)
    if not cp.is_file() or not kp.is_file():
        logger.warning(
            "C2PA_SIGNER_CERT_PATH / C2PA_SIGNER_KEY_PATH set but file(s) missing"
        )
        return None, None
    return cp, kp


def _try_sign_c2pa(
    *,
    image_bytes: bytes,
    fmt: str,
    manifest: dict,
) -> bytes | None:
    """Attempt to sign + embed a C2PA manifest. Returns the signed bytes
    or None on any failure (caller falls back to XMP).

    c2pa-python uses tempfiles internally for some adapters; we pass
    bytes via in-memory streams when the SDK version supports it.
    """
    cert_path, key_path = _signing_paths()
    if not cert_path or not key_path:
        return None

    try:
        from c2pa import Builder, Signer, SigningAlg  # type: ignore[import-not-found]
    except ImportError:
        logger.warning("c2pa-python not installed; skipping real C2PA sign")
        return None

    try:
        # c2pa-python's signer chooses the right alg from the cert.
        cert_pem = cert_path.read_bytes()
        key_pem = key_path.read_bytes()
        alg_name = os.environ.get("C2PA_SIGNER_ALG", "PS256").lower()
        alg = getattr(SigningAlg, alg_name.upper(), SigningAlg.PS256)

        signer = Signer.from_info(
            alg=alg,
            certs=cert_pem,
            private_key=key_pem,
            tsa_url=os.environ.get("C2PA_TSA_URL") or None,
        )
        builder = Builder(manifest)

        in_stream = io.BytesIO(image_bytes)
        out_stream = io.BytesIO()
        mime = _format_to_mime(fmt)
        builder.sign(signer, mime, in_stream, out_stream)
        return out_stream.getvalue()
    except Exception as exc:  # noqa: BLE001 — never let signing crash the run
        logger.exception("C2PA signing failed (%s); falling back to XMP", exc)
        return None


class C2PAStamper:
    """Apply disclosure metadata to an image.

    Stateless. `model_id` and `manifest_uri` come from per-call args so
    we can attribute each output image to the model that produced it.
    """

    def stamp(
        self,
        image_bytes: bytes,
        *,
        mime: str,
        model_id: str | None = None,
        manifest_uri: str | None = None,
        created_at: datetime | None = None,
        title: str = "AI-generated product image",
    ) -> StampResult:
        created = (created_at or datetime.now(timezone.utc)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        disclosure = {
            "Disclosure": DISCLOSURE_LABEL,
            "CreatedAt": created,
            "DigitalSourceType": IPTC_DIGITAL_SOURCE_TYPE,
        }
        if model_id:
            disclosure["GenModel"] = model_id
        if manifest_uri:
            disclosure["DisclosureUri"] = manifest_uri

        with Image.open(io.BytesIO(image_bytes)) as img:
            fmt = (img.format or "").upper()
            if fmt not in ("PNG", "JPEG", "JPG", "WEBP"):
                # Re-encode unknowns as PNG so XMP + C2PA have a container.
                img = img.convert("RGBA")
                fmt = "PNG"

        # Always build the XMP first — it's our durable fallback.
        if fmt == "PNG":
            xmp_bytes, out_mime = self._stamp_png(image_bytes, disclosure)
        else:
            xmp_bytes, out_mime = self._stamp_jpeg_or_webp(
                image_bytes, disclosure, fmt
            )

        # Try to upgrade to a signed C2PA manifest.
        manifest = _build_manifest(
            title=title,
            fmt=fmt,
            model_id=model_id,
            manifest_uri=manifest_uri,
            created=created,
        )
        signed = _try_sign_c2pa(image_bytes=xmp_bytes, fmt=fmt, manifest=manifest)
        if signed is not None:
            return StampResult(
                bytes_out=signed,
                mime=out_mime,
                disclosure=disclosure,
                c2pa_signed=True,
            )

        return StampResult(
            bytes_out=xmp_bytes,
            mime=out_mime,
            disclosure=disclosure,
            c2pa_signed=False,
        )

    # ── per-format XMP writers ───────────────────────────────────

    @staticmethod
    def _stamp_jpeg_or_webp(
        image_bytes: bytes,
        disclosure: dict[str, str],
        fmt: str,
    ) -> tuple[bytes, str]:
        xmp = _xmp_packet(disclosure)
        buf = io.BytesIO()
        with Image.open(io.BytesIO(image_bytes)) as img:
            save_kwargs: dict = {"quality": 92, "optimize": True, "xmp": xmp}
            if fmt == "WEBP":
                save_kwargs = {"quality": 92, "xmp": xmp}
            img.save(buf, format=fmt, **save_kwargs)
        return buf.getvalue(), f"image/{fmt.lower().replace('jpg', 'jpeg')}"

    @staticmethod
    def _stamp_png(
        image_bytes: bytes,
        disclosure: dict[str, str],
    ) -> tuple[bytes, str]:
        meta = PngImagePlugin.PngInfo()
        meta.add_itxt("XML:com.adobe.xmp", _xmp_packet(disclosure).decode("utf-8"))
        for k, v in disclosure.items():
            meta.add_text(f"listpack.{k}", v)
        buf = io.BytesIO()
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.save(buf, format="PNG", pnginfo=meta, optimize=True)
        return buf.getvalue(), "image/png"


# ─── reverse: detect disclosure for tests / audit endpoint ────────


def is_ai_disclosed(image_bytes: bytes) -> bool:
    """True iff the image carries our AI-disclosure metadata
    (either signed C2PA manifest or XMP fallback)."""
    if has_c2pa_manifest(image_bytes):
        return True
    return read_disclosure(image_bytes) is not None


def has_c2pa_manifest(image_bytes: bytes) -> bool:
    """Probe for a real C2PA manifest. Returns False when c2pa-python
    isn't installed (the image's manifest may still be present —
    re-check with `c2patool verify`)."""
    try:
        from c2pa import Reader  # type: ignore[import-not-found]
    except ImportError:
        return False
    try:
        Reader.from_stream("image/jpeg", io.BytesIO(image_bytes))
        return True
    except Exception:
        return False


def read_disclosure(image_bytes: bytes) -> dict[str, str] | None:
    """Return parsed disclosure dict, or None if the image lacks one."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            fmt = (img.format or "").upper()
            if fmt == "PNG":
                out: dict[str, str] = {}
                for k, v in img.info.items():
                    if isinstance(k, str) and k.startswith("listpack."):
                        out[k[len("listpack.") :]] = v
                if out:
                    return out
                xmp = img.info.get("XML:com.adobe.xmp")
                if isinstance(xmp, str) and DISCLOSURE_LABEL in xmp:
                    return _parse_xmp_to_dict(xmp)
                return None
            xmp_bytes = img.info.get("xmp")
            if not xmp_bytes:
                return None
            xmp_text = (
                xmp_bytes.decode("utf-8", errors="ignore")
                if isinstance(xmp_bytes, bytes)
                else str(xmp_bytes)
            )
            if DISCLOSURE_LABEL not in xmp_text:
                return None
            return _parse_xmp_to_dict(xmp_text)
    except Exception:
        return None


def _parse_xmp_to_dict(xmp_text: str) -> dict[str, str]:
    import re

    pattern = re.compile(r"<listpack:([A-Za-z]+)>(.*?)</listpack:\1>", re.DOTALL)
    return {m.group(1): m.group(2) for m in pattern.finditer(xmp_text)}

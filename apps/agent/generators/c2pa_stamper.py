"""C2PAStamper — embed AI-disclosure metadata for EU AI Act / 加州 SB 942.

PRD § 03 § 9: every AI-generated image leaving the system must carry
machine-readable provenance. Full C2PA cryptographic manifests require
the `c2pa-python` SDK (Apache 2.0) + a signing key, which we'll wire in
v1.5. v1 ships a simpler always-on disclosure:

- JPEG / WebP: write XMP packet containing
    xmp:Label              "AI-generated"
    xmp:CreatorTool        "ListPack Studio"
    dc:creator             "ListPack Studio"
    listpack:DisclosureUri (manifest URL, optional)
    listpack:GenModel      (model id from Usage)
    listpack:CreatedAt     (ISO 8601)
- PNG: write iTXt chunks with the same keys

This satisfies the "AI-assisted vs AI-generated" disclosure boundary
under FTC + EU AI Act enforcement guidance (PRD § 03 § 9.1–9.2) and
gives downstream auditors a hash-comparable provenance trail without
needing the full PKI ceremony yet.

Detection side (`is_ai_disclosed`) checks for the presence of the
listpack-specific XMP key so we can round-trip in tests.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from PIL import Image, PngImagePlugin

DISCLOSURE_LABEL = "AI-generated"
XMP_NS = "http://listpack.io/ns/c2pa/1.0/"

# ─── stamper ─────────────────────────────────────────────────────


@dataclass
class StampResult:
    bytes_out: bytes
    mime: str
    disclosure: dict[str, str]


def _xmp_packet(disclosure: dict[str, str]) -> bytes:
    """Build a minimal XMP packet containing AI disclosure fields.

    XMP is RDF-in-XML wrapped by `<?xpacket?>` markers. We hand-roll the
    minimum needed for both human-readable + auditor-parseable disclosure.
    """
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


class C2PAStamper:
    """Apply disclosure metadata to an image.

    Stateless. `model_id` and `manifest_uri` come from per-call args so we
    can attribute each output image to the model that produced it.
    """

    def stamp(
        self,
        image_bytes: bytes,
        *,
        mime: str,
        model_id: str | None = None,
        manifest_uri: str | None = None,
        created_at: datetime | None = None,
    ) -> StampResult:
        created = (created_at or datetime.now(timezone.utc)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        disclosure = {
            "Disclosure": DISCLOSURE_LABEL,
            "CreatedAt": created,
        }
        if model_id:
            disclosure["GenModel"] = model_id
        if manifest_uri:
            disclosure["DisclosureUri"] = manifest_uri

        with Image.open(io.BytesIO(image_bytes)) as img:
            fmt = (img.format or "").upper()
            if fmt == "PNG":
                out_bytes, out_mime = self._stamp_png(img, disclosure)
            elif fmt in ("JPEG", "JPG", "WEBP"):
                out_bytes, out_mime = self._stamp_jpeg_or_webp(img, disclosure, fmt)
            else:
                # Re-encode unknown formats as PNG so we have a place to write metadata
                out_bytes, out_mime = self._stamp_png(img.convert("RGBA"), disclosure)

        return StampResult(bytes_out=out_bytes, mime=out_mime, disclosure=disclosure)

    # ── per-format writers ────────────────────────────────────────

    @staticmethod
    def _stamp_jpeg_or_webp(
        img: Image.Image,
        disclosure: dict[str, str],
        fmt: str,
    ) -> tuple[bytes, str]:
        xmp = _xmp_packet(disclosure)
        buf = io.BytesIO()
        save_kwargs: dict = {"quality": 92, "optimize": True, "xmp": xmp}
        # WEBP doesn't accept `optimize`
        if fmt == "WEBP":
            save_kwargs = {"quality": 92, "xmp": xmp}
        img.save(buf, format=fmt, **save_kwargs)
        return buf.getvalue(), f"image/{fmt.lower().replace('jpg', 'jpeg')}"

    @staticmethod
    def _stamp_png(
        img: Image.Image,
        disclosure: dict[str, str],
    ) -> tuple[bytes, str]:
        meta = PngImagePlugin.PngInfo()
        # XMP packet
        meta.add_itxt("XML:com.adobe.xmp", _xmp_packet(disclosure).decode("utf-8"))
        # Individual tEXt for grep-ability (auditors don't always parse XMP)
        for k, v in disclosure.items():
            meta.add_text(f"listpack.{k}", v)
        buf = io.BytesIO()
        img.save(buf, format="PNG", pnginfo=meta, optimize=True)
        return buf.getvalue(), "image/png"


# ─── reverse: detect disclosure for tests / audit endpoint ────────


def is_ai_disclosed(image_bytes: bytes) -> bool:
    """True iff the image carries our AI-disclosure metadata."""
    return read_disclosure(image_bytes) is not None


def read_disclosure(image_bytes: bytes) -> dict[str, str] | None:
    """Return parsed disclosure dict, or None if the image lacks one."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            fmt = (img.format or "").upper()
            if fmt == "PNG":
                # PNG keeps our tEXt chunks for human-readable disclosure
                out: dict[str, str] = {}
                for k, v in img.info.items():
                    if isinstance(k, str) and k.startswith("listpack."):
                        out[k[len("listpack.") :]] = v
                if out:
                    return out
                # Also try parsed XMP namespace if Pillow exposed it
                xmp = img.info.get("XML:com.adobe.xmp")
                if isinstance(xmp, str) and DISCLOSURE_LABEL in xmp:
                    return _parse_xmp_to_dict(xmp)
                return None
            # JPEG / WEBP — XMP is in image.info["xmp"] (bytes) on modern Pillow
            xmp_bytes = img.info.get("xmp")
            if not xmp_bytes:
                return None
            if isinstance(xmp_bytes, bytes):
                xmp_text = xmp_bytes.decode("utf-8", errors="ignore")
            else:
                xmp_text = str(xmp_bytes)
            if DISCLOSURE_LABEL not in xmp_text:
                return None
            return _parse_xmp_to_dict(xmp_text)
    except Exception:
        return None


def _parse_xmp_to_dict(xmp_text: str) -> dict[str, str]:
    """Tiny tag-text extractor — full XML parse would be overkill for our 4-5 fields."""
    import re

    pattern = re.compile(
        r"<listpack:([A-Za-z]+)>(.*?)</listpack:\1>", re.DOTALL
    )
    return {m.group(1): m.group(2) for m in pattern.finditer(xmp_text)}

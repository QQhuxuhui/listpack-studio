"""Shared test fixtures.

`make_image` returns synthetic test images with controllable properties
(size / format / background colour / color space) so each detector can be
exercised without checking in binary fixtures.
"""

from __future__ import annotations

import io
from typing import Callable

import pytest
from PIL import Image


@pytest.fixture
def make_image() -> Callable[..., tuple[bytes, str]]:
    """Return a factory that produces (image_bytes, mime) tuples."""

    def factory(
        *,
        width: int = 2000,
        height: int = 2000,
        background: tuple[int, int, int] = (255, 255, 255),
        format: str = "JPEG",
        mode: str = "RGB",
        quality: int = 90,
        embed_logo: tuple[int, int, int] | None = None,
    ) -> tuple[bytes, str]:
        img = Image.new(mode, (width, height), background)

        # Optional small coloured square in the centre — used to simulate a
        # product so background detectors don't catch the product itself.
        if embed_logo is not None:
            cx, cy = width // 2, height // 2
            s = min(width, height) // 4
            for y in range(cy - s, cy + s):
                for x in range(cx - s, cx + s):
                    img.putpixel((x, y), embed_logo)

        buf = io.BytesIO()
        save_kwargs: dict = {}
        if format.upper() == "JPEG":
            save_kwargs["quality"] = quality
        img.save(buf, format=format, **save_kwargs)
        mime = {
            "JPEG": "image/jpeg",
            "PNG": "image/png",
            "TIFF": "image/tiff",
            "WEBP": "image/webp",
        }.get(format.upper(), f"image/{format.lower()}")
        return buf.getvalue(), mime

    return factory

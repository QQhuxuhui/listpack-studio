"""D8 object-detection tests: person_in_image + object_count.

DETR (facebook/detr-resnet-50) downloads ~160MB on first run + ~5-10s CPU
inference per image. We use real product photos rather than synthetic
rectangles because DETR is trained on natural images and won't reliably
detect a coloured rectangle as a class.

Test images live under tests/fixtures/ (committed binary) so CI is reproducible.
Generated on demand by tests/fixtures/build.py if missing.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("transformers", reason="DETR tests require transformers + torch")


def _detr_locally_cached() -> bool:
    """True iff DETR weights + processor config are already on disk.

    HuggingFace Hub is blocked in some sandboxes (TLS proxy returns 502).
    Skipping the whole module instead of failing keeps `pytest` green for
    contributors who don't need to exercise object detection.
    """
    try:
        from transformers import AutoImageProcessor

        AutoImageProcessor.from_pretrained(
            "facebook/detr-resnet-50", local_files_only=True
        )
        return True
    except Exception:
        return False


if not _detr_locally_cached():
    pytest.skip(
        "DETR weights not cached locally and HuggingFace Hub appears unreachable. "
        "On a machine with open HTTPS, run: "
        "`uv run python -c \"from transformers import AutoImageProcessor, DetrForObjectDetection; "
        "AutoImageProcessor.from_pretrained('facebook/detr-resnet-50'); "
        "DetrForObjectDetection.from_pretrained('facebook/detr-resnet-50')\"`",
        allow_module_level=True,
    )

from compliance.engine import run_compliance_check  # noqa: E402
from compliance.rules import AMAZON_RULES  # noqa: E402
from compliance.schemas import OverallStatus, RuleSeverity, RuleSpec  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _rule(key: str) -> RuleSpec:
    return next(r for r in AMAZON_RULES if r.rule_key == key)


def _load(name: str) -> tuple[bytes, str]:
    """Load a fixture image; skip the test if it's missing AND we can't
    fetch it (common in sandboxes with TLS-intercepting proxies).

    Run `uv run python -m tests.fixtures.build` from a machine with
    unrestricted HTTPS to pre-populate the cache.
    """
    p = FIXTURES / name
    if not p.is_file():
        try:
            from tests.fixtures.build import build_all  # type: ignore[import-not-found]

            build_all()
        except Exception as exc:
            pytest.skip(
                f"fixture {name!r} unavailable and download failed ({type(exc).__name__}: {exc}). "
                f"Run `uv run python -m tests.fixtures.build` on a machine with open HTTPS."
            )
    if not p.is_file():
        pytest.skip(f"fixture {name!r} still missing after build attempt")
    return p.read_bytes(), "image/jpeg"


# ─── person_in_image ─────────────────────────────────────────────────


def test_person_in_image_pass_on_bare_product():
    """A product on white background with no person → passes."""
    img, mime = _load("bottle_clean_white.jpg")
    report = run_compliance_check(
        img, mime, [_rule("amazon.main_image.no_person")], target_platform="amazon"
    )
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.pass_, ev
    assert ev["person_count"] == 0


def test_person_in_image_fail_when_model_present():
    """Image with a person holding the product → fails."""
    img, mime = _load("person_holding_bottle.jpg")
    report = run_compliance_check(
        img, mime, [_rule("amazon.main_image.no_person")], target_platform="amazon"
    )
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.fail, ev
    assert ev["person_count"] >= 1


# ─── object_count ────────────────────────────────────────────────────


def test_object_count_pass_single_product():
    img, mime = _load("bottle_clean_white.jpg")
    report = run_compliance_check(
        img, mime,
        [_rule("amazon.main_image.single_product")],
        target_platform="amazon",
    )
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.pass_, ev
    assert ev["actual_count"] <= 1


def test_object_count_fail_multiple_products():
    """Image with multiple bottles → fails single_product rule."""
    img, mime = _load("multiple_bottles.jpg")
    report = run_compliance_check(
        img, mime,
        [_rule("amazon.main_image.single_product")],
        target_platform="amazon",
    )
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.fail, ev
    assert ev["actual_count"] >= 2


def test_object_count_class_exclude_skips_person():
    """`single_product` excludes 'person'; an image with person + bottle
    is fine as far as this rule is concerned (no_person catches the person)."""
    img, mime = _load("person_holding_bottle.jpg")
    report = run_compliance_check(
        img, mime,
        [_rule("amazon.main_image.single_product")],
        target_platform="amazon",
    )
    ev = report.rule_results[0].evidence
    assert "person" not in ev["counts_by_class"], ev
    # Whether it passes depends on whether DETR saw exactly one non-person
    # object. We only assert the exclusion worked, not the overall outcome.


# ─── ad-hoc rule for class_filter ────────────────────────────────────


def test_object_count_class_filter_only_bottles():
    """Counting only 'bottle' objects (class_filter narrows detection)."""
    img, mime = _load("multiple_bottles.jpg")
    rule = RuleSpec(
        rule_key="test.bottle_count",
        platform="amazon",
        applies_to_slot="main",
        detector_type="object_count",
        spec={
            "max_count": 0,  # any bottle → fail
            "class_filter": ["bottle"],
            "min_confidence": 0.6,
        },
        severity=RuleSeverity.warn,
        display_title={"en": "x", "zh": "x"},
        display_message={"en": "x", "zh": "x"},
    )
    report = run_compliance_check(img, mime, [rule], target_platform="amazon")
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.warn
    assert ev["counts_by_class"].get("bottle", 0) >= 1

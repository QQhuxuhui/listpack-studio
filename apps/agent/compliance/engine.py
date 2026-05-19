"""Compliance engine entry point.

`run_compliance_check(image_bytes, rules, ...)` evaluates a list of rules
against one asset and returns a `ComplianceReport`. Pure function — no I/O,
no DB, no LLM calls. Detectors that *do* need I/O (e.g. SAM/OCR via API)
handle that themselves; engine only orchestrates.

Aggregation rule for `overall`:
- any block-severity failure → fail
- else any warn-severity failure → warn
- else → pass
"""

from __future__ import annotations

import io
import logging
from typing import Iterable

from PIL import Image

from .registry import detector_registry
from .schemas import (
    ComplianceReport,
    DetectorContext,
    OverallStatus,
    PlatformName,
    RuleResult,
    RuleSeverity,
    RuleSpec,
)

logger = logging.getLogger("listpack.compliance")


def _build_context(image_bytes: bytes, mime: str) -> DetectorContext:
    """Decode common metadata once so per-rule detectors don't re-parse."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        # Pillow's `mode` ≈ color space ("RGB", "CMYK", "L", "RGBA", ...)
        color_space = img.mode
        width, height = img.size
        # ICC profile, if embedded
        icc = img.info.get("icc_profile")
        exif: dict = {}
        try:
            raw = img.getexif()
            exif = {k: str(v) for k, v in raw.items()}
        except Exception:
            exif = {}

    return DetectorContext(
        image_bytes=image_bytes,
        mime=mime,
        width=width,
        height=height,
        file_size=len(image_bytes),
        color_space=color_space,
        icc_profile=icc,
        exif=exif,
    )


def run_compliance_check(
    image_bytes: bytes,
    mime: str,
    rules: Iterable[RuleSpec],
    *,
    target_platform: PlatformName,
    target_category: str | None = None,
    rule_set_version: int = 1,
) -> ComplianceReport:
    """Evaluate `rules` against the image and aggregate into a report."""
    ctx = _build_context(image_bytes, mime)

    results: list[RuleResult] = []
    fix_suggestions: list[dict] = []
    any_block_fail = False
    any_warn_fail = False

    for rule in rules:
        detector = detector_registry.get(rule.detector_type)
        if detector is None:
            logger.warning(
                "no detector registered for %s (rule=%s)",
                rule.detector_type,
                rule.rule_key,
            )
            # An unknown detector is a configuration bug, not a user violation.
            # Surface as a warn-severity failure with explicit evidence so the
            # operator notices, but don't block the upload.
            results.append(
                RuleResult(
                    rule_key=rule.rule_key,
                    severity=RuleSeverity.warn,
                    passed=False,
                    evidence={"error": f"unknown detector: {rule.detector_type}"},
                    display_title=rule.display_title,
                    display_message=rule.display_message,
                    source_url=rule.source_url,
                )
            )
            any_warn_fail = True
            continue

        try:
            outcome = detector(ctx, rule.spec)
        except Exception as exc:  # pragma: no cover — defensive
            logger.exception("detector %s crashed on rule %s", rule.detector_type, rule.rule_key)
            results.append(
                RuleResult(
                    rule_key=rule.rule_key,
                    severity=RuleSeverity.warn,
                    passed=False,
                    evidence={"error": f"{type(exc).__name__}: {exc}"},
                    display_title=rule.display_title,
                    display_message=rule.display_message,
                    source_url=rule.source_url,
                )
            )
            any_warn_fail = True
            continue

        results.append(
            RuleResult(
                rule_key=rule.rule_key,
                severity=rule.severity,
                passed=outcome.passed,
                evidence=outcome.evidence,
                display_title=rule.display_title,
                display_message=rule.display_message,
                fix_action=(
                    rule.auto_fix.get("type")
                    if (not outcome.passed and rule.auto_fix)
                    else None
                ),
                source_url=rule.source_url,
            )
        )

        if not outcome.passed:
            if rule.severity is RuleSeverity.block:
                any_block_fail = True
            elif rule.severity is RuleSeverity.warn:
                any_warn_fail = True
            if rule.auto_fix:
                fix_suggestions.append(
                    {
                        "rule_key": rule.rule_key,
                        **rule.auto_fix,
                    }
                )

    overall = (
        OverallStatus.fail
        if any_block_fail
        else OverallStatus.warn
        if any_warn_fail
        else OverallStatus.pass_
    )

    return ComplianceReport(
        target_platform=target_platform,
        target_category=target_category,
        overall=overall,
        rule_results=results,
        fix_suggestions=fix_suggestions,
        rule_set_version=rule_set_version,
    )

"""Pydantic schemas for the compliance engine.

Wire-format mirrors `PlatformRule.spec` JSONB column from
`apps/web/lib/db/schema.ts` and the `ComplianceReport.rule_results` shape.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ─── enums (mirror Postgres enums) ─────────────────────────────────────


class RuleSeverity(str, Enum):
    block = "block"
    warn = "warn"
    info = "info"


class OverallStatus(str, Enum):
    pass_ = "pass"  # `pass` is a Python keyword
    warn = "warn"
    fail = "fail"


PlatformName = Literal[
    "amazon", "shopify", "ebay", "temu", "shein", "global"
]


# ─── detector input ────────────────────────────────────────────────────


class DetectorContext(BaseModel):
    """All ambient metadata about the image the detector can read.

    Detectors should prefer reading from ctx rather than re-decoding the bytes
    when possible (cheaper, especially in a loop over many rules).
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    image_bytes: bytes
    mime: str
    width: int
    height: int
    file_size: int
    color_space: str | None = None  # "sRGB" | "RGB" | "CMYK" | None
    icc_profile: bytes | None = None
    exif: dict[str, Any] = Field(default_factory=dict)


# ─── detector output ───────────────────────────────────────────────────


class DetectorResult(BaseModel):
    """Outcome of a single detector run.

    `passed`: whether the image satisfies the spec.
    `evidence`: machine-readable measurements (what was detected, thresholds,
                pixel coordinates if any).  Surfaced verbatim in the
                ComplianceReport so users can debug "why did this fail?".
    """

    passed: bool
    evidence: dict[str, Any] = Field(default_factory=dict)


# ─── rule spec (declarative, JSONB-serialisable) ───────────────────────


class RuleSpec(BaseModel):
    """A single platform rule.

    Mirrors `platform_rules` table row, minus DB-only fields (id, timestamps).
    The `spec` dict is detector-specific; engine forwards it untouched.
    """

    rule_key: str
    platform: PlatformName
    applies_to_slot: str = "any"
    applies_to_category: list[str] | None = None
    detector_type: str
    spec: dict[str, Any]
    severity: RuleSeverity = RuleSeverity.warn
    auto_fix: dict[str, Any] | None = None
    display_title: dict[str, str]  # {"en": "...", "zh": "..."}
    display_message: dict[str, str]
    fix_cta: dict[str, str] | None = None
    version: int = 1
    source_url: str | None = None


# ─── compliance report (engine output) ─────────────────────────────────


class RuleResult(BaseModel):
    rule_key: str
    severity: RuleSeverity
    passed: bool
    evidence: dict[str, Any]
    display_title: dict[str, str]
    display_message: dict[str, str]
    fix_action: str | None = None  # e.g. "whiten_background", null if no fix
    source_url: str | None = None


class ComplianceReport(BaseModel):
    """Engine output — also the shape persisted to `compliance_reports`."""

    target_platform: PlatformName
    target_category: str | None = None
    overall: OverallStatus
    rule_results: list[RuleResult]
    fix_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    rule_set_version: int = 1

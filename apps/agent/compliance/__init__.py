"""ListPack compliance engine.

Implements PRD `docs/prd/03-compliance-engine.md`:
- Detectors: pluggable image-property checks (file_size, background_color, ...)
- Fixers:    auto-fix actions matched to failing detectors
- Engine:    orchestrates detector list against a target asset + platform
- Rules:     declarative JSON specs that bind detectors+fixers+thresholds,
             seeded into the `platform_rules` PG table (D9)

The framework purposefully does NOT couple to:
- LangGraph (compliance is a pure function; called by Agent tools)
- Postgres (detector code reads ctx in-memory; seed scripts write rules)
- HTTP (FastAPI endpoints wrap this engine; see server.py D10)

Public entry: `compliance.engine.run_compliance_check(...)`.
"""

from .engine import run_compliance_check
from .registry import detector_registry, register_detector
from .schemas import (
    ComplianceReport,
    DetectorContext,
    DetectorResult,
    RuleSeverity,
    RuleSpec,
    RuleResult,
    OverallStatus,
)

__all__ = [
    "ComplianceReport",
    "DetectorContext",
    "DetectorResult",
    "OverallStatus",
    "RuleResult",
    "RuleSeverity",
    "RuleSpec",
    "detector_registry",
    "register_detector",
    "run_compliance_check",
]

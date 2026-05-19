"""Per-AgentRun cost budget tracker.

One CostBudget per AgentRun (PRD § 02 § 6 + § 11.5). Coordinator builds it
from `AgentRun.cost_cap_usd`, passes it to ModelRouter, and persists the
final `spent_usd` back to `agent_runs.cost_spent_usd`.

Thread-safe via a lock so multiple Executors running in parallel under one
AgentRun don't race-condition the budget into the red.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from decimal import Decimal

from .exceptions import ModelBudgetExceeded

logger = logging.getLogger("listpack.models.cost")


@dataclass
class _Record:
    model: str
    cost_usd: Decimal


@dataclass
class CostBudget:
    """In-memory cost ceiling for the lifetime of one AgentRun.

    Usage pattern:

        budget = CostBudget(cap_usd=Decimal("0.30"))
        budget.reserve(model="nano-banana", est_cost=Decimal("0.04"))
        # ... make the call ...
        budget.commit_actual("nano-banana", actual_cost=Decimal("0.039"))

    `reserve()` raises ModelBudgetExceeded BEFORE the HTTP call so we never
    overspend by more than one reservation. `commit_actual()` reconciles
    estimate→actual once the provider reports back.
    """

    cap_usd: Decimal
    spent_usd: Decimal = Decimal("0")
    reserved_usd: Decimal = Decimal("0")
    history: list[_Record] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    @property
    def remaining_usd(self) -> Decimal:
        return self.cap_usd - self.spent_usd - self.reserved_usd

    def reserve(self, *, model: str, est_cost: Decimal) -> None:
        """Pre-flight check + tentatively count the estimate.

        Pair every reserve() with EITHER commit_actual() (success) OR
        release() (call failed / aborted) so reserved_usd doesn't leak.
        """
        with self._lock:
            if self.spent_usd + self.reserved_usd + est_cost > self.cap_usd:
                raise ModelBudgetExceeded(
                    f"reserving {est_cost} for {model!r} would exceed cap "
                    f"{self.cap_usd} (spent={self.spent_usd}, "
                    f"reserved={self.reserved_usd})",
                    model=model,
                )
            self.reserved_usd += est_cost

    def commit_actual(
        self,
        model: str,
        *,
        est_cost: Decimal,
        actual_cost: Decimal,
    ) -> None:
        """Convert a reservation into spent budget at the real cost.

        Actual cost may differ from estimate (provider returns finer-grained
        usage). We trust the actual.
        """
        with self._lock:
            self.reserved_usd -= est_cost
            if self.reserved_usd < 0:
                logger.warning("reserved_usd went negative; reconciling to 0")
                self.reserved_usd = Decimal("0")
            self.spent_usd += actual_cost
            self.history.append(_Record(model=model, cost_usd=actual_cost))

    def release(self, *, est_cost: Decimal) -> None:
        """Release a reservation that won't be spent (call failed)."""
        with self._lock:
            self.reserved_usd -= est_cost
            if self.reserved_usd < 0:
                logger.warning("reserved_usd went negative; reconciling to 0")
                self.reserved_usd = Decimal("0")

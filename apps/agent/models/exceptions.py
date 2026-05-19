"""Model-layer exceptions.

These are caught by the Coordinator (PRD § 02 § 8) and translated into
SSE error events for the client. Don't raise generic Exception here —
the Coordinator's retry policy switches on the exact subclass.
"""


class ModelError(Exception):
    """Base class — all model failures inherit from this."""

    def __init__(self, message: str, *, model: str | None = None) -> None:
        super().__init__(message)
        self.model = model


class ModelUnavailable(ModelError):
    """Model returned 5xx, timed out, or its client raised a transport error.

    Coordinator → retry with backoff (PRD § 02 § 8.1 "network transient"),
    then fall back to the secondary model in the router config.
    """


class ModelInvalidResponse(ModelError):
    """Model returned 2xx but the body didn't parse (malformed JSON, etc.).

    Coordinator → retry once with `response_format` re-asserted, then
    surface as ModelError to the user (PRD § 02 § 11.3).
    """


class ModelRefused(ModelError):
    """Model explicitly refused (content policy, safety, NSFW).

    Coordinator → do NOT retry; bubble up so the user can edit the prompt
    or pick a different model.
    """


class ModelBudgetExceeded(ModelError):
    """The next call would push the AgentRun past its `cost_cap_usd`.

    Coordinator → terminate the run with `cost_exceeded` (PRD § 02 § 8.1)
    OR downgrade to template mode if the workflow supports it.
    """


class NoModelForTask(ModelError):
    """Router couldn't find any catalog entry matching the requested task.

    Hard config error; surface as 500. Should never happen in production
    once the catalog is seeded.
    """

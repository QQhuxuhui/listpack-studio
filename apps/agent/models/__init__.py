"""Model routing layer.

`apps/agent` doesn't call model SDKs directly — it asks the Router for the
"best model for this task within this budget" and delegates the actual HTTP
call to a ModelClient. This indirection lets us:

- Swap model providers per environment (sparkcode dev → direct API prod)
- Stay under a per-AgentRun cost cap (PRD § 02 § 11.5)
- Fall back gracefully when a model errors

Public entry points:
- `ModelRouter`              — pick + invoke
- `SparkcodeClient`          — OpenAI-compatible HTTP client (default provider)
- `CostBudget`               — per-AgentRun cost cap
- exceptions: `ModelError`, `ModelBudgetExceeded`, `ModelUnavailable`
"""

from .base import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ImageEditRequest,
    ImageEditResponse,
    ImageGenRequest,
    ImageGenResponse,
    ModelClient,
    TaskKind,
    Usage,
    VisionRequest,
    VisionResponse,
)
from .catalog import DEFAULT_CATALOG, ModelInfo
from .cost import CostBudget
from .exceptions import (
    ModelBudgetExceeded,
    ModelError,
    ModelInvalidResponse,
    ModelRefused,
    ModelUnavailable,
    NoModelForTask,
)
from .router import DEFAULT_PRIMARY_BY_TASK, ModelRouter, RouterConfig
from .sparkcode_client import SparkcodeClient

__all__ = [
    "ChatMessage",
    "ChatRequest",
    "ChatResponse",
    "CostBudget",
    "DEFAULT_CATALOG",
    "DEFAULT_PRIMARY_BY_TASK",
    "ImageEditRequest",
    "ImageEditResponse",
    "ImageGenRequest",
    "ImageGenResponse",
    "ModelBudgetExceeded",
    "ModelClient",
    "ModelError",
    "ModelInfo",
    "ModelInvalidResponse",
    "ModelRefused",
    "ModelRouter",
    "ModelUnavailable",
    "NoModelForTask",
    "RouterConfig",
    "SparkcodeClient",
    "TaskKind",
    "Usage",
    "VisionRequest",
    "VisionResponse",
]

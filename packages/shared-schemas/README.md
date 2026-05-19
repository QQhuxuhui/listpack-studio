# @listpack/shared-schemas

Shared HTTP contract between **apps/web** (TypeScript) and **apps/agent** (Python).

## TS side

```ts
import { sseEventSchema, helloRequestSchema, makeApiError } from '@listpack/shared-schemas';
```

Used by apps/web to:
- validate incoming requests before forwarding to agent
- type the SSE event stream on the client
- shape error responses consistently

## Python side

Mirrored manually in `apps/agent/schemas/` as Pydantic models until we add automated
JSON-Schema → Pydantic codegen. When you change anything here, update the matching
Pydantic file in the same commit.

| TS file                | Python file                            |
| ---------------------- | -------------------------------------- |
| `src/sse.ts`           | `apps/agent/schemas/sse.py`            |
| `src/hello.ts`         | `apps/agent/schemas/hello.py`          |
| `src/errors.ts`        | `apps/agent/schemas/errors.py`         |

## Why zod + manual mirror, not codegen?

D2.2 prefers a 1-file-each manual mirror because:
- v1 only has 3 small schemas
- codegen (json-schema-to-pydantic, datamodel-code-generator) adds toolchain weight
- breaking changes are surfaced loudly by typecheck on both sides

Switch to codegen once schemas grow past ~10 files.

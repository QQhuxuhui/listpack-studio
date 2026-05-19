/**
 * Shared HTTP contract between apps/web (TS) and apps/agent (Python).
 *
 * TS side: import directly.
 * Python side: mirror these structures in `apps/agent/schemas/` as Pydantic models.
 * Long term: auto-generate Pydantic from JSON Schema exports of these zod schemas.
 */

export * from './sse.js';
export * from './hello.js';
export * from './errors.js';

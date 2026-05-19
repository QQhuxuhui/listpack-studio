import { z } from 'zod';

/**
 * SSE event envelope used by every agent streaming endpoint.
 *
 * Each event line on the wire is:
 *   event: <name>
 *   data: <json>
 *
 * `event` names use dot notation to mirror an event taxonomy:
 *   run.started / run.completed / run.failed
 *   step.started / step.intermediate / step.completed / step.failed
 *   agent.plan
 *   awaiting_user / cost_warning
 */
export const sseEventNameSchema = z.enum([
  'run.started',
  'run.completed',
  'run.failed',
  'step.started',
  'step.intermediate',
  'step.completed',
  'step.failed',
  'agent.plan',
  'awaiting_user',
  'cost_warning',
]);
export type SSEEventName = z.infer<typeof sseEventNameSchema>;

export const runStartedSchema = z.object({
  event: z.literal('run.started'),
  data: z.object({
    run_id: z.string(),
    message: z.string().optional(),
  }),
});

export const runCompletedSchema = z.object({
  event: z.literal('run.completed'),
  data: z.object({
    run_id: z.string(),
    cost_usd: z.number().optional(),
  }),
});

export const runFailedSchema = z.object({
  event: z.literal('run.failed'),
  data: z.object({
    run_id: z.string(),
    error: z.string(),
  }),
});

export const stepCompletedSchema = z.object({
  event: z.literal('step.completed'),
  data: z.object({
    node: z.string(),
    output: z.unknown(),
  }),
});

export const stepIntermediateSchema = z.object({
  event: z.literal('step.intermediate'),
  data: z.object({
    node: z.string(),
    update: z.unknown(),
  }),
});

/**
 * Discriminated union of all known SSE events.
 * Clients can switch on `.event` for exhaustive handling.
 */
export const sseEventSchema = z.discriminatedUnion('event', [
  runStartedSchema,
  runCompletedSchema,
  runFailedSchema,
  stepCompletedSchema,
  stepIntermediateSchema,
]);
export type SSEEvent = z.infer<typeof sseEventSchema>;

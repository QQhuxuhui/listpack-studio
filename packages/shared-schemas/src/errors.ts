import { z } from 'zod';

/**
 * Standard error envelope returned by both apps/web public APIs and
 * apps/agent service endpoints. Mirrors Stripe / OpenAI-style error shape.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    type: z.string(),
    code: z.string().optional(),
    message: z.string(),
    detail: z.unknown().optional(),
    request_id: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export function makeApiError(
  type: string,
  message: string,
  opts: { code?: string; detail?: unknown; request_id?: string } = {},
): ApiError {
  return { error: { type, message, ...opts } };
}

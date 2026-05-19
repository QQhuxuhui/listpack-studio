import { z } from 'zod';

/**
 * D3 placeholder contract — exercised end-to-end to validate web ↔ agent wiring.
 * Will be deleted once real listing-pack contracts replace it.
 */

export const helloRequestSchema = z.object({
  message: z.string().min(1).max(500),
});
export type HelloRequest = z.infer<typeof helloRequestSchema>;

export const helloResponseSchema = z.object({
  message: z.string(),
  plan: z.array(z.string()),
  response: z.string(),
});
export type HelloResponse = z.infer<typeof helloResponseSchema>;

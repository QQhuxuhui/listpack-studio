/**
 * Studio ref-image roles, shared between DB schema, server-side queries,
 * and UI components. Keeping this in a leaf module (no deps) lets both
 * the server-only schema.ts and client-side _components/types.ts import it
 * without layering inversions.
 */
export type RefRole = 'content' | 'style' | 'character';

export interface RefEntry {
  asset_id: string;
  role: RefRole;
}

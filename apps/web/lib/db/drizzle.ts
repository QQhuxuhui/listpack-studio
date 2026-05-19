import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

dotenv.config();

/**
 * Lazy Postgres client.
 *
 * Module-level instantiation breaks any route that doesn't touch the DB
 * (e.g. `/agent-demo`, marketing pages) when POSTGRES_URL is missing.
 * We defer the actual `postgres(...)` call and the env check until the
 * first DB read/write — same UX in normal use, friendlier dev experience
 * before Neon/Postgres has been wired up.
 */

type Drizzle = ReturnType<typeof drizzle<typeof schema>>;
type PgClient = ReturnType<typeof postgres>;

let _client: PgClient | null = null;
let _db: Drizzle | null = null;

function init(): { client: PgClient; db: Drizzle } {
  if (!_client || !_db) {
    const url = process.env.POSTGRES_URL;
    if (!url) {
      throw new Error(
        'POSTGRES_URL is not set. Add it to apps/web/.env (Neon / Supabase / local docker).',
      );
    }
    _client = postgres(url);
    _db = drizzle(_client, { schema });
  }
  return { client: _client, db: _db };
}

export const client: PgClient = new Proxy({} as PgClient, {
  get(_t, prop, recv) {
    return Reflect.get(init().client as unknown as object, prop, recv);
  },
});

export const db: Drizzle = new Proxy({} as Drizzle, {
  get(_t, prop, recv) {
    return Reflect.get(init().db as unknown as object, prop, recv);
  },
});

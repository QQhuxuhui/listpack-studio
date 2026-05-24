/**
 * Shared setup for DB integration tests.
 *
 * Stubs the `server-only` specifier so node:test can load modules that
 * import it. Server-only modules (drizzle.ts, studio-queries.ts, …)
 * throw at import time outside Next's bundler; this routes the
 * specifier to an empty CJS module.
 *
 * Import this file FIRST (for side-effects) in any integration test:
 *
 *   import './_setup';
 *   import { test, after } from 'node:test';
 *   // … then dynamic imports of the modules under test.
 *
 * The patch must be installed BEFORE the modules under test are
 * resolved — so dynamic imports inside before() blocks are required.
 */
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
type ModuleStatic = typeof import('module') & {
  _resolveFilename: (req: string, ...rest: unknown[]) => string;
};
const _Module = _require('module') as ModuleStatic;
const _stubPath = _require.resolve('./_server-only-stub.cjs');
const _origResolve = _Module._resolveFilename.bind(_Module);
_Module._resolveFilename = function patched(
  req: string,
  ...rest: unknown[]
): string {
  if (req === 'server-only') return _stubPath;
  return _origResolve(req, ...rest);
};

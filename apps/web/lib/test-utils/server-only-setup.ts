/**
 * Stubs `import 'server-only'` so node:test (running through tsx)
 * can load server-only modules. Import this file FIRST in any test
 * that transitively touches `import 'server-only'`:
 *
 *   import '@/lib/test-utils/server-only-setup';
 *   import { test } from 'node:test';
 *   ...
 *   const mod = await import('../my-server-only-module');
 *
 * The side-effect (Module._resolveFilename patch) runs at import time;
 * dynamic imports of server-only modules afterwards see a no-op stub
 * instead of throwing.
 */
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
type ModuleStatic = typeof import('module') & {
  _resolveFilename: (req: string, ...rest: unknown[]) => string;
};
const _Module = _require('module') as ModuleStatic;
const _stubPath = _require.resolve('./server-only-stub.cjs');
const _origResolve = _Module._resolveFilename.bind(_Module);
_Module._resolveFilename = function patched(req: string, ...rest: unknown[]): string {
  if (req === 'server-only') return _stubPath;
  return _origResolve(req, ...rest);
};

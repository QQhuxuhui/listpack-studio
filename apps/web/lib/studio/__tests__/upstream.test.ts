/**
 * Unit tests for upstream.ts helpers. upstream.ts imports `server-only`,
 * which Node refuses to load outside Next's bundler — so we patch the
 * specifier to a CJS stub before any dynamic import.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
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

// Lazily-loaded — must wait for the resolver patch above.
type UpstreamModule = typeof import('../upstream');
let buildEffectivePrompt: UpstreamModule['buildEffectivePrompt'];

before(async () => {
  ({ buildEffectivePrompt } = await import('../upstream'));
});

test('无 refs 时 effectivePrompt 等于原 prompt', () => {
  const p = buildEffectivePrompt({ prompt: 'a cat', refs: [] });
  assert.equal(p, 'a cat');
});

test('1 张 content ref 加 [content reference] 前缀', () => {
  const p = buildEffectivePrompt({
    prompt: 'wearing a hat',
    refs: [{ asset_id: 'a', role: 'content' }],
  });
  assert.match(p, /\[content reference\]/);
  assert.match(p, /wearing a hat$/);
});

test('content + style 分别前缀', () => {
  const p = buildEffectivePrompt({
    prompt: 'wearing a hat',
    refs: [
      { asset_id: 'a', role: 'content' },
      { asset_id: 'b', role: 'style' },
    ],
  });
  assert.match(p, /\[content reference\]/);
  assert.match(p, /\[style reference\]/);
});

test('character role 加 [keep character consistent] 前缀', () => {
  const p = buildEffectivePrompt({
    prompt: 'in a forest',
    refs: [{ asset_id: 'c', role: 'character' }],
  });
  assert.match(p, /\[keep character consistent\]/);
});

test('多张同 role 合并到单个前缀', () => {
  const p = buildEffectivePrompt({
    prompt: 'merged',
    refs: [
      { asset_id: 'a', role: 'content' },
      { asset_id: 'b', role: 'content' },
    ],
  });
  const matches = p.match(/\[content reference\]/g);
  assert.equal(matches?.length, 1);
  assert.match(p, /2 images?/i);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODELS, modelSupports, firstModelSupporting } from '../models';

test('每个 model 都有完整 capabilities', () => {
  for (const m of Object.values(MODELS)) {
    assert.ok(m.capabilities, `${m.id} 缺 capabilities`);
    for (const key of ['imageInput', 'inpaint', 'outpaint', 'seed', 'transparentBackground', 'multiTurn'] as const) {
      assert.equal(typeof m.capabilities[key], 'boolean', `${m.id}.${key} 非 boolean`);
    }
  }
});

test('真值表：gpt-image-2 所有 cap 除 multiTurn 外为 true', () => {
  const c = MODELS['gpt-image-2']!.capabilities;
  assert.deepEqual(c, {
    imageInput: true,
    inpaint: true,
    outpaint: true,
    seed: true,
    transparentBackground: true,
    multiTurn: false,
  });
});

test('真值表：Gemini 模型只有 imageInput + multiTurn 为 true', () => {
  for (const id of ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']) {
    const c = MODELS[id]!.capabilities;
    assert.deepEqual(c, {
      imageInput: true,
      inpaint: false,
      outpaint: false,
      seed: false,
      transparentBackground: false,
      multiTurn: true,
    });
  }
});

test('modelSupports 对未知 model 返回 false', () => {
  assert.equal(modelSupports('nonexistent-model', 'imageInput'), false);
});

test('modelSupports 反映真值表', () => {
  assert.equal(modelSupports('gpt-image-2', 'inpaint'), true);
  assert.equal(modelSupports('gemini-3-pro-image-preview', 'inpaint'), false);
});

test('firstModelSupporting 返回第一个支持的 model', () => {
  const m = firstModelSupporting('inpaint');
  assert.ok(m, '应该有支持 inpaint 的模型');
  assert.equal(m!.id, 'gpt-image-2');
});

test('firstModelSupporting 对所有模型都支持的 cap 返回非空', () => {
  const m = firstModelSupporting('imageInput');
  assert.ok(m);
});

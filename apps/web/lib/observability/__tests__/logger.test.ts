import { test } from 'node:test';
import assert from 'node:assert/strict';

import { logger } from '../logger';
import { captureException } from '../sentry';

function captureConsole(): {
  logs: string[];
  errors: string[];
  warns: string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) =>
    errors.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) =>
    warns.push(args.map(String).join(' '));
  return {
    logs,
    errors,
    warns,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
      console.warn = origWarn;
    },
  };
}

// @types/node marks NODE_ENV as a literal-typed read-only string. We need
// to flip it at runtime to exercise the prod-mode JSON path, so cast.
const env = process.env as Record<string, string | undefined>;

function withProdEnv(fn: () => void) {
  const priorEnv = env.NODE_ENV;
  const priorLevel = env.LOG_LEVEL;
  env.NODE_ENV = 'production';
  // Make sure prior tests' LOG_LEVEL=warn doesn't filter our info() calls.
  env.LOG_LEVEL = 'debug';
  try {
    fn();
  } finally {
    env.NODE_ENV = priorEnv;
    env.LOG_LEVEL = priorLevel;
  }
}

test('logger respects LOG_LEVEL (dev mode goes to console.log)', () => {
  env.LOG_LEVEL = 'warn';
  env.NODE_ENV = 'development';
  const cap = captureConsole();
  try {
    logger.warn('A warn');
    logger.info('A info — should be filtered out');
    logger.error('An error');
  } finally {
    cap.restore();
  }
  assert.ok(cap.logs.some((l) => l.includes('A warn')));
  // 'info' filtered by LOG_LEVEL=warn
  assert.ok(!cap.logs.some((l) => l.includes('A info')));
});

test('logger.error in prod mode emits JSON to console.error', () => {
  withProdEnv(() => {
    const cap = captureConsole();
    try {
      logger.error('boom', { run_id: 'r1' });
    } finally {
      cap.restore();
    }
    assert.equal(cap.errors.length, 1);
    const line = JSON.parse(cap.errors[0]!);
    assert.equal(line.level, 'error');
    assert.equal(line.msg, 'boom');
    assert.equal(line.run_id, 'r1');
    assert.equal(line.svc, 'web');
    assert.ok(typeof line.ts === 'string');
  });
});

test('logger.child merges bound context with per-call meta', () => {
  withProdEnv(() => {
    const cap = captureConsole();
    try {
      const reqLog = logger.child({ req_id: 'r-abc', user: 'u-1' });
      reqLog.info('hit', { route: '/health' });
    } finally {
      cap.restore();
    }
    const line = JSON.parse(cap.logs[0]!);
    assert.equal(line.req_id, 'r-abc');
    assert.equal(line.user, 'u-1');
    assert.equal(line.route, '/health');
  });
});

test('captureException routes Error through error logger', () => {
  withProdEnv(() => {
    const cap = captureConsole();
    try {
      captureException(new Error('explode'), { agent_run_id: 'a1' });
    } finally {
      cap.restore();
    }
    assert.equal(cap.errors.length, 1);
    const line = JSON.parse(cap.errors[0]!);
    assert.equal(line.message, 'explode');
    assert.equal(line.agent_run_id, 'a1');
    assert.ok(typeof line.stack === 'string');
  });
});

test('captureException accepts non-Error values', () => {
  withProdEnv(() => {
    const cap = captureConsole();
    try {
      captureException('weird-string', { source: 'test' });
    } finally {
      cap.restore();
    }
    const line = JSON.parse(cap.errors[0]!);
    assert.equal(line.message, 'weird-string');
    assert.equal(line.stack, undefined);
  });
});

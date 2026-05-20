/**
 * Structured logger — JSON lines on stdout in production, pretty in dev.
 *
 * No Pino / Winston dependency yet: a 30-line wrapper around console
 * gets us level filtering + JSON-shape consistency for log shippers
 * (Vector, Promtail, Datadog Agent) to parse. Drop in Pino later when
 * sampling / file rotation matters.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Level[] = ['debug', 'info', 'warn', 'error'];

function configuredLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
  return LEVELS.includes(raw) ? raw : 'info';
}

// Both read lazily on every emit so tests / hot-reload can flip env vars.
function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(configuredLevel())) return;

  if (isProd()) {
    // JSON line for log shippers.
    const line = {
      ts: new Date().toISOString(),
      level,
      msg,
      svc: 'web',
      ...meta,
    };
    if (level === 'error') console.error(JSON.stringify(line));
    else if (level === 'warn') console.warn(JSON.stringify(line));
    else console.log(JSON.stringify(line));
    return;
  }

  // Dev: terse readable line.
  const tag = `[${level.toUpperCase()}]`;
  if (meta && Object.keys(meta).length) {
    console.log(tag, msg, meta);
  } else {
    console.log(tag, msg);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),

  /** Bind a context — useful for per-request loggers. */
  child(context: Record<string, unknown>) {
    return {
      debug: (msg: string, meta?: Record<string, unknown>) =>
        emit('debug', msg, { ...context, ...meta }),
      info: (msg: string, meta?: Record<string, unknown>) =>
        emit('info', msg, { ...context, ...meta }),
      warn: (msg: string, meta?: Record<string, unknown>) =>
        emit('warn', msg, { ...context, ...meta }),
      error: (msg: string, meta?: Record<string, unknown>) =>
        emit('error', msg, { ...context, ...meta }),
    };
  },
};

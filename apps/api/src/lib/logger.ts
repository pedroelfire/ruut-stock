import { pino, type Logger, type LevelWithSilent } from 'pino';

export type { Logger };

/**
 * Redaction is a safety net: request logs only carry method, url, status and duration,
 * but any object logged by mistake still loses credentials and tokens.
 */
const REDACT_PATHS = [
  'authorization',
  'password',
  'passwordHash',
  'token',
  '*.authorization',
  '*.password',
  '*.passwordHash',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
];

export function createLogger(options: { level: LevelWithSilent }): Logger {
  return pino({
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  });
}

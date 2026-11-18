import { pino } from 'pino';
import { env } from './env.ts';

export const logger = pino({
	level: env.LOG_LEVEL,
	// API keys must never reach the logs, even by accident.
	redact: { paths: ['apiKey', '*.apiKey', 'apiKeyEncrypted', '*.apiKeyEncrypted', 'token', '*.token'], censor: '[redacted]' },
	transport: process.stdout.isTTY ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } : undefined,
});

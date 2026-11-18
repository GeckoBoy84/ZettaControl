import { pino } from 'pino';
import pretty from 'pino-pretty';
import { env } from './env.ts';

const options = {
	level: env.LOG_LEVEL,
	// API keys must never reach the logs, even by accident.
	redact: { paths: ['apiKey', '*.apiKey', 'apiKeyEncrypted', '*.apiKeyEncrypted', 'token', '*.token'], censor: '[redacted]' },
};

// Readable, coloured lines by default, since most hosts only have a panel console.
// LOG_FORMAT=json gives one JSON object per line for log collectors. Both write
// synchronously so the last line before a crash is never lost.
export const logger =
	env.LOG_FORMAT === 'json'
		? pino(options, pino.destination({ sync: true }))
		: pino(options, pretty({ sync: true, colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' }));

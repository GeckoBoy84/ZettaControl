import { z } from 'zod';

const snowflakeList = z
	.string()
	.default('')
	.transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean));

const schema = z.object({
	DISCORD_TOKEN: z.string().min(1),
	DISCORD_CLIENT_ID: z.string().min(1),
	DISCORD_DEV_GUILD_ID: z.string().optional().transform((value) => value || undefined),
	DATABASE_URL: z.string().min(1),
	ENCRYPTION_KEY: z
		.string()
		.refine((value) => Buffer.from(value, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64 encoded'),
	OWNER_IDS: snowflakeList,
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
	PRIVATE_HOOKS: z.string().optional().transform((value) => value || undefined),
	ALLOW_PRIVATE_PANEL_URLS: z
		.string()
		.optional()
		.transform((value) => value === 'true'),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
	const result = schema.safeParse(process.env);
	if (!result.success) {
		const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
		console.error(`Invalid environment. Check your .env file (see .env.example):\n${problems}`);
		process.exit(1);
	}
	return result.data;
}

export const env = load();

// Registers slash commands with Discord. With DISCORD_DEV_GUILD_ID set, commands go
// to that guild only and update instantly.
//
// On start the bot calls syncCommands(), which only talks to Discord when the
// command definitions changed since the last registration (tracked in
// .commands-hash), so hosts without console access never need to run this by hand.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REST, Routes } from 'discord.js';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { commands } from './router.ts';

const HASH_FILE = resolve(import.meta.dirname, '../../../.commands-hash');

export async function syncCommands({ force = false } = {}): Promise<void> {
	const body = commands.map((command) => command.data.toJSON());
	const target = env.DISCORD_DEV_GUILD_ID ? `guild:${env.DISCORD_DEV_GUILD_ID}` : 'global';
	const hash = createHash('sha256').update(JSON.stringify({ target, clientId: env.DISCORD_CLIENT_ID, body })).digest('hex');

	const previous = await readFile(HASH_FILE, 'utf8').catch(() => null);
	if (!force && previous?.trim() === hash) {
		logger.debug('Slash commands unchanged, skipping registration');
		return;
	}

	const route = env.DISCORD_DEV_GUILD_ID
		? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_DEV_GUILD_ID)
		: Routes.applicationCommands(env.DISCORD_CLIENT_ID);
	await new REST().setToken(env.DISCORD_TOKEN).put(route, { body });
	await writeFile(HASH_FILE, hash);
	logger.info({ commands: body.length, target }, 'Registered slash commands');
}

// `npm run deploy-commands` always registers.
if (import.meta.main) {
	await syncCommands({ force: true });
	process.exit(0);
}

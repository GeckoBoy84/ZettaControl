import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { brand } from './brand.ts';
import { sql } from './db/client.ts';
import { migrateDatabase } from './db/migrate.ts';
import { syncCommands } from './deploy-commands.ts';
import { env } from './env.ts';
import { emit, loadHooks } from './hooks.ts';
import { logger } from './logger.ts';
import { routeInteraction } from './router.ts';

// Everything a host needs happens on start, so no console commands are ever required.
// Each step fails with one readable line, because on a panel the console is all you get.
async function startupStep(what: string, hint: string, step: () => Promise<void>): Promise<void> {
	try {
		await step();
	} catch (error) {
		const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
		logger.fatal(`${what} failed: ${cause instanceof Error ? cause.message : String(cause)}. ${hint}`);
		logger.debug({ err: error }, 'Startup failure details');
		await sql.end({ timeout: 1 }).catch(() => undefined);
		process.exit(1);
	}
}

await startupStep('Connecting to the database', 'Check DATABASE_URL in your .env and that the database is online.', async () => {
	await migrateDatabase();
	logger.info('Database is up to date');
});
await startupStep('Registering slash commands', 'Check DISCORD_TOKEN and DISCORD_CLIENT_ID in your .env.', () => syncCommands());
await loadHooks();

// Slash commands only, so no privileged intents and no message content.
const client = new Client({
	intents: [GatewayIntentBits.Guilds],
	presence: { activities: [{ name: '/help', type: ActivityType.Listening }] },
});

client.once(Events.ClientReady, (ready) => {
	logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, `${brand.name} is online`);
	emit('onReady', ready);
});

client.on(Events.InteractionCreate, (interaction) => void routeInteraction(interaction));
client.on(Events.GuildCreate, (guild) => emit('onGuildJoin', guild));
client.on(Events.GuildDelete, (guild) => emit('onGuildLeave', guild));
client.on(Events.Error, (error) => logger.error({ err: error }, 'Discord client error'));

process.on('unhandledRejection', (error) => {
	logger.error({ err: error }, 'Unhandled rejection');
	emit('onError', error, { source: 'unhandledRejection' });
});

async function shutdown(signal: string): Promise<void> {
	logger.info(`${signal} received, shutting down`);
	await client.destroy();
	await sql.end({ timeout: 5 });
	process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await startupStep('Logging in to Discord', 'Check DISCORD_TOKEN in your .env.', async () => {
	await client.login(env.DISCORD_TOKEN);
});

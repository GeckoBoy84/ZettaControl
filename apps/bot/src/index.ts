import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { brand } from './brand.ts';
import { sql } from './db/client.ts';
import { env } from './env.ts';
import { emit, loadHooks } from './hooks.ts';
import { logger } from './logger.ts';
import { routeInteraction } from './router.ts';

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

await client.login(env.DISCORD_TOKEN);

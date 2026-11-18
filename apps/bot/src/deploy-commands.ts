// Registers slash commands with Discord. Run after changing any command definition.
// With DISCORD_DEV_GUILD_ID set, commands go to that guild only and update instantly.

import { REST, Routes } from 'discord.js';
import { env } from './env.ts';
import { commands } from './router.ts';

const rest = new REST().setToken(env.DISCORD_TOKEN);
const body = commands.map((command) => command.data.toJSON());

const route = env.DISCORD_DEV_GUILD_ID
	? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_DEV_GUILD_ID)
	: Routes.applicationCommands(env.DISCORD_CLIENT_ID);

await rest.put(route, { body });
console.log(`Registered ${body.length} commands ${env.DISCORD_DEV_GUILD_ID ? `to guild ${env.DISCORD_DEV_GUILD_ID}` : 'globally'}.`);
process.exit(0);

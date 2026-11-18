// Slash commands work with no permissions at all. Console threads, status boards and
// alerts post on their own, so they need the bot user in the server (the `bot` scope)
// and a few channel permissions. This is the full list, and the invite link asks for it.

import { OAuth2Scopes, PermissionFlagsBits, PermissionsBitField, type ChatInputCommandInteraction, type GuildTextBasedChannel } from 'discord.js';
import { brand } from '../brand.ts';
import { env } from '../env.ts';
import { UserFacingError } from './replies.ts';

export const POST_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] as const;

export const THREAD_PERMISSIONS = [...POST_PERMISSIONS, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads] as const;

export const BOT_PERMISSIONS = new PermissionsBitField([...THREAD_PERMISSIONS]);

export function inviteUrl(): string {
	const url = new URL('https://discord.com/oauth2/authorize');
	url.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
	url.searchParams.set('scope', [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands].join(' '));
	url.searchParams.set('permissions', BOT_PERMISSIONS.bitfield.toString());
	return url.toString();
}

/** The interaction's guild, with the bot user in it. Live features cannot work without that. */
export function requireBotMember(interaction: ChatInputCommandInteraction) {
	if (!interaction.inCachedGuild() || !interaction.guild.members.me) {
		throw new UserFacingError(`This needs ${brand.name} added to the server as a bot, so it can post on its own. [Add it here](${inviteUrl()}), then try again.`);
	}
	return { guild: interaction.guild, me: interaction.guild.members.me };
}

/** Throws a friendly list of what the bot is missing in `channel`. */
export function assertBotCan(channel: GuildTextBasedChannel, needed: readonly bigint[]): void {
	const me = channel.guild.members.me;
	const have = me ? channel.permissionsFor(me) : null;
	const missing = have ? have.missing([...needed]) : new PermissionsBitField([...needed]).toArray();
	if (missing.length > 0) {
		const names = missing.map((name) => `**${name.replace(/([a-z])([A-Z])/g, '$1 $2')}**`).join(', ');
		throw new UserFacingError(`${brand.name} is missing ${names} in <#${channel.id}>. Give its role those permissions there and try again.`);
	}
}

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	MessageFlags,
	ThreadAutoArchiveDuration,
	type Interaction,
} from 'discord.js';
import { count, eq } from 'drizzle-orm';
import { brand } from '../brand.ts';
import { db } from '../db/client.ts';
import { consoleThreads } from '../db/schema.ts';
import { env } from '../env.ts';
import { customId, type Command } from '../interactions.ts';
import { assertBotCan, requireBotMember, THREAD_PERMISSIONS } from '../lib/bot-permissions.ts';
import { closeConsole, consoleFor, MAX_CONSOLES_PER_GUILD, openConsole } from '../lib/consoles.ts';
import { truncate } from '../lib/format.ts';
import { serverRef } from '../lib/panels.ts';
import { embed, UserFacingError } from '../lib/replies.ts';
import { SERVER_PREFIX } from '../views/sections.ts';
import { guildSlashCommand, resolveServer, serverAutocomplete } from './shared.ts';

export const CONSOLE_PREFIX = 'con';

/** Closing needs the same access as opening: Full on the console's server. */
export async function closeConsoleFrom(interaction: Interaction, threadId: string): Promise<void> {
	const row = await consoleFor(threadId);
	if (!row) throw new UserFacingError('This thread is not an open console.');
	await resolveServer(interaction, serverRef(row.panelId, row.serverId), 'full');
	await closeConsole(threadId);
}

export const consoleCommand: Command = {
	data: guildSlashCommand('console', 'Stream a server console into a private thread')
		.addSubcommand((sub) =>
			sub
				.setName('open')
				.setDescription('Open a private thread with the live console of a server')
				.addStringOption((option) => option.setName('server').setDescription('Server').setRequired(true).setAutocomplete(true)),
		)
		.addSubcommand((sub) => sub.setName('close').setDescription('Close the console in this thread')),

	async autocomplete(interaction) {
		await serverAutocomplete(interaction);
	},

	async execute(interaction) {
		if (interaction.options.getSubcommand() === 'close') {
			await closeConsoleFrom(interaction, interaction.channelId);
			await interaction.reply({ embeds: [embed().setDescription(`Console closed by <@${interaction.user.id}>.`)], allowedMentions: { parse: [] } });
			if (interaction.channel?.isThread()) await interaction.channel.setArchived(true).catch(() => undefined);
			return;
		}

		const { guild } = requireBotMember(interaction);
		const ctx = await resolveServer(interaction, interaction.options.getString('server', true), 'full');
		if (!ctx.client.capabilities.console) throw new UserFacingError('This panel does not support live consoles.');

		const channel = interaction.channel;
		if (channel?.type !== ChannelType.GuildText) {
			throw new UserFacingError('Run this in a text channel. The console opens as a private thread under it.');
		}
		assertBotCan(channel, THREAD_PERMISSIONS);

		const [{ open = 0 } = {}] = await db.select({ open: count() }).from(consoleThreads).where(eq(consoleThreads.guildId, guild.id));
		if (open >= MAX_CONSOLES_PER_GUILD) {
			throw new UserFacingError(`This server already has ${MAX_CONSOLES_PER_GUILD} open consoles. Close one with \`/console close\` in its thread first.`);
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const server = await ctx.client.getServer(ctx.serverId);

		// Private and not invitable: only the opener and people with Manage Threads can see the console.
		const thread = await channel.threads.create({
			name: truncate(`console ${server.name}`, 100),
			type: ChannelType.PrivateThread,
			invitable: false,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
			reason: `Console opened by ${interaction.user.tag}`,
		});
		await thread.members.add(interaction.user.id);

		const [row] = await db
			.insert(consoleThreads)
			.values({ threadId: thread.id, guildId: guild.id, panelId: ctx.panel.id, serverId: ctx.serverId, serverName: server.name, createdBy: interaction.user.id })
			.returning();
		if (!row) throw new Error('Console thread insert returned nothing');

		await thread.send({
			embeds: [
				embed()
					.setTitle(`Console · ${server.name}`)
					.setDescription(
						[
							`Live console opened by <@${interaction.user.id}>. Output appears here every couple of seconds.`,
							env.CONSOLE_TYPED_COMMANDS
								? 'Type a message here to send it as a command. Only members with **Full** access on this server can.'
								: 'Use **Send command** to run a command. Only members with **Full** access on this server can.',
							'Anyone in this thread can read the output. Close the console with the button or `/console close`. Archiving the thread also closes it.',
						].join('\n\n'),
					),
			],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder().setCustomId(customId(SERVER_PREFIX, 'cmd', ctx.panel.id, ctx.serverId)).setLabel('Send command').setStyle(ButtonStyle.Primary),
					new ButtonBuilder().setCustomId(customId(CONSOLE_PREFIX, 'close', thread.id)).setLabel('Close console').setStyle(ButtonStyle.Danger),
				),
			],
			allowedMentions: { parse: [] },
		});

		openConsole(row, ctx.panel);
		await interaction.editReply({ embeds: [embed().setDescription(`Console for **${server.name}** is open in <#${thread.id}>. ${brand.name} streams it until you close it.`)] });
	},
};

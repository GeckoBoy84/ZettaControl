import { ChannelType, MessageFlags, type AutocompleteInteraction } from 'discord.js';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { panels, panelStatsBoards } from '../db/schema.ts';
import type { Command } from '../interactions.ts';
import { resolveActor } from '../lib/access.ts';
import { assertBotCan, POST_PERMISSIONS, requireBotMember } from '../lib/bot-permissions.ts';
import { truncate } from '../lib/format.ts';
import { updateStatsBoard } from '../lib/panel-stats.ts';
import { adminClientFor, hasAdminKey } from '../lib/panels.ts';
import { embed, UserFacingError } from '../lib/replies.ts';
import { renderPanelStats } from '../views/panel-stats.ts';
import { guildSlashCommand, managedPanelAutocomplete, requireLivePanel } from './shared.ts';

const MAX_BOARDS_PER_GUILD = 5;

function messageLink(guildId: string, channelId: string, messageId: string): string {
	return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function guildBoards(guildId: string) {
	return db
		.select({ board: panelStatsBoards, panelName: panels.name })
		.from(panelStatsBoards)
		.innerJoin(panels, eq(panels.id, panelStatsBoards.panelId))
		.where(eq(panelStatsBoards.guildId, guildId));
}

async function boardAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
	if (!interaction.guildId) return interaction.respond([]);
	const query = interaction.options.getFocused().toLowerCase();
	const rows = await guildBoards(interaction.guildId);
	await interaction.respond(
		rows
			.map(({ board, panelName }) => {
				const channel = interaction.guild?.channels.cache.get(board.channelId)?.name ?? 'unknown channel';
				return { name: truncate(`${panelName} · #${channel}`, 100), value: board.id };
			})
			.filter((choice) => choice.name.toLowerCase().includes(query))
			.slice(0, 25),
	);
}

export const statsCommand: Command = {
	data: guildSlashCommand('stats', 'Panel stats boards: panel and node uptime and usage, kept up to date')
		.addSubcommand((sub) =>
			sub
				.setName('post')
				.setDescription('Post a panel stats board in this channel. It updates every minute. Needs an admin key.')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true))
				.addChannelOption((option) =>
					option
						.setName('alerts')
						.setDescription('Also post here when the panel or a node goes down or comes back')
						.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
				)
				.addRoleOption((option) => option.setName('ping').setDescription('Role to mention when something goes down')),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('Panel stats boards in this Discord server'))
		.addSubcommand((sub) =>
			sub
				.setName('remove')
				.setDescription('Stop a panel stats board and delete its message')
				.addStringOption((option) => option.setName('board').setDescription('Board').setRequired(true).setAutocomplete(true)),
		),

	async autocomplete(interaction) {
		if (interaction.options.getFocused(true).name === 'board') return boardAutocomplete(interaction);
		const actor = await resolveActor(interaction);
		if (!actor.isManager) return interaction.respond([]);
		await managedPanelAutocomplete(interaction, hasAdminKey);
	},

	async execute(interaction) {
		const actor = await resolveActor(interaction);
		if (!actor.guildId) throw new UserFacingError('Use this in a Discord server the bot has been added to.');

		switch (interaction.options.getSubcommand()) {
			case 'post': {
				const panel = await requireLivePanel(actor, interaction.options.getString('panel', true));
				if (!adminClientFor(panel)) throw new UserFacingError(`Stats boards read the panel's admin API. Add an admin key for **${panel.name}** with \`/admin key\` first.`);
				const { guild } = requireBotMember(interaction);
				const channel = interaction.channel;
				if (!channel || channel.isDMBased() || !channel.isSendable()) throw new UserFacingError('Run this in a channel where the board should go.');
				assertBotCan(channel, POST_PERMISSIONS);

				const picked = interaction.options.getChannel('alerts');
				const alertChannel = picked ? guild.channels.cache.get(picked.id) : null;
				if (picked && (!alertChannel?.isTextBased() || alertChannel.isVoiceBased())) throw new UserFacingError('Pick a text channel for the alerts.');
				if (alertChannel?.isTextBased()) assertBotCan(alertChannel, POST_PERMISSIONS);

				const [{ boards = 0 } = {}] = await db.select({ boards: count() }).from(panelStatsBoards).where(eq(panelStatsBoards.guildId, guild.id));
				if (boards >= MAX_BOARDS_PER_GUILD) throw new UserFacingError(`This server already has ${MAX_BOARDS_PER_GUILD} panel stats boards. Remove one with \`/stats remove\` first.`);

				await interaction.deferReply({ flags: MessageFlags.Ephemeral });
				const role = interaction.options.getRole('ping');
				const message = await channel.send(renderPanelStats(panel, null, null, { live: true }));
				const [board] = await db
					.insert(panelStatsBoards)
					.values({
						guildId: guild.id,
						channelId: channel.id,
						messageId: message.id,
						panelId: panel.id,
						alertChannelId: alertChannel?.id ?? null,
						mentionRoleId: role && role.id !== guild.id ? role.id : null,
						createdBy: actor.userId,
					})
					.returning();
				if (board) await updateStatsBoard(board);

				await interaction.editReply({
					allowedMentions: { parse: [] },
					embeds: [
						embed().setDescription(
							[
								`Posted a stats board for **${panel.name}**. It updates every minute.`,
								alertChannel ? `Outages and recoveries go to <#${alertChannel.id}>${role ? ` and ping <@&${role.id}>` : ''}.` : null,
								'A node only counts as down after two failed checks in a row, so one dropped request stays quiet.',
								'Delete the message or use `/stats remove` to stop it.',
							]
								.filter(Boolean)
								.join(' '),
						),
					],
				});
				return;
			}

			case 'list': {
				if (!actor.isManager) throw new UserFacingError('Only panel managers can see the list of panel stats boards.');
				const rows = await guildBoards(actor.guildId);
				const lines = rows.map(
					({ board, panelName }) =>
						`**${panelName}** · [message](${messageLink(board.guildId, board.channelId, board.messageId)}) in <#${board.channelId}>${board.alertChannelId ? ` · alerts in <#${board.alertChannelId}>` : ''}`,
				);
				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					embeds: [embed().setTitle('Panel stats boards').setDescription(lines.length ? lines.join('\n') : 'No panel stats boards yet. Post one with `/stats post`.')],
				});
				return;
			}

			case 'remove': {
				const [board] = await db
					.select()
					.from(panelStatsBoards)
					.where(and(eq(panelStatsBoards.id, interaction.options.getString('board', true)), eq(panelStatsBoards.guildId, actor.guildId)))
					.limit(1);
				if (!board) throw new UserFacingError('Pick a board from the list.');
				if (!actor.isManager && board.createdBy !== actor.userId) throw new UserFacingError('Only panel managers or whoever posted the board can remove it.');

				await db.delete(panelStatsBoards).where(eq(panelStatsBoards.id, board.id));
				const channel = await interaction.client.channels.fetch(board.channelId).catch(() => null);
				if (channel?.isTextBased() && !channel.isDMBased()) await channel.messages.delete(board.messageId).catch(() => undefined);
				await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed().setDescription('Panel stats board removed.')] });
				return;
			}
		}
	},
};

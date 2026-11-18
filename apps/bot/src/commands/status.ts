import { MessageFlags, type AutocompleteInteraction } from 'discord.js';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { ALL_SERVERS, panels, statusBoards } from '../db/schema.ts';
import type { Command } from '../interactions.ts';
import { managedPanels, resolveActor } from '../lib/access.ts';
import { assertBotCan, POST_PERMISSIONS, requireBotMember } from '../lib/bot-permissions.ts';
import { truncate } from '../lib/format.ts';
import { MAX_SERVERS_PER_PANEL, updateBoard } from '../lib/monitor.ts';
import { clientFor } from '../lib/panels.ts';
import { embed, UserFacingError } from '../lib/replies.ts';
import { renderStatusBoard } from '../views/status-board.ts';
import { guildSlashCommand, managedPanelAutocomplete, panelServerAutocomplete, requireLivePanel } from './shared.ts';

const MAX_BOARDS_PER_GUILD = 10;

function messageLink(guildId: string, channelId: string, messageId: string): string {
	return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function guildBoards(guildId: string) {
	return db
		.select({ board: statusBoards, panelName: panels.name })
		.from(statusBoards)
		.innerJoin(panels, eq(panels.id, statusBoards.panelId))
		.where(eq(statusBoards.guildId, guildId));
}

async function boardAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
	if (!interaction.guildId) return interaction.respond([]);
	const query = interaction.options.getFocused().toLowerCase();
	const rows = await guildBoards(interaction.guildId);
	await interaction.respond(
		rows
			.map(({ board, panelName }) => {
				const channel = interaction.guild?.channels.cache.get(board.channelId)?.name ?? 'unknown channel';
				return { name: truncate(`${panelName} · ${board.serverId === ALL_SERVERS ? 'all servers' : 'one server'} · #${channel}`, 100), value: board.id };
			})
			.filter((choice) => choice.name.toLowerCase().includes(query))
			.slice(0, 25),
	);
}

export const statusCommand: Command = {
	data: guildSlashCommand('status', 'Status boards that keep server states up to date in a channel')
		.addSubcommand((sub) =>
			sub
				.setName('post')
				.setDescription('Post a status board in this channel. It updates every minute.')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true))
				.addStringOption((option) => option.setName('server').setDescription('Only this server (default: every server on the panel)').setAutocomplete(true)),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('Status boards in this Discord server'))
		.addSubcommand((sub) =>
			sub
				.setName('remove')
				.setDescription('Stop a status board and delete its message')
				.addStringOption((option) => option.setName('board').setDescription('Board').setRequired(true).setAutocomplete(true)),
		),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true).name;
		const actor = await resolveActor(interaction);
		if (focused === 'board') return boardAutocomplete(interaction);
		if (!actor.isManager) return interaction.respond([]);
		if (focused === 'panel') return managedPanelAutocomplete(interaction);
		const panelId = interaction.options.getString('panel');
		await panelServerAutocomplete(interaction, (await managedPanels(actor)).find((row) => row.id === panelId));
	},

	async execute(interaction) {
		const actor = await resolveActor(interaction);
		if (!actor.guildId) throw new UserFacingError('Use this in a Discord server the bot has been added to.');

		switch (interaction.options.getSubcommand()) {
			case 'post': {
				const panel = await requireLivePanel(actor, interaction.options.getString('panel', true));
				const { guild } = requireBotMember(interaction);
				const channel = interaction.channel;
				if (!channel || channel.isDMBased() || !channel.isSendable()) throw new UserFacingError('Run this in a channel where the board should go.');
				assertBotCan(channel, POST_PERMISSIONS);

				const [{ boards = 0 } = {}] = await db.select({ boards: count() }).from(statusBoards).where(eq(statusBoards.guildId, guild.id));
				if (boards >= MAX_BOARDS_PER_GUILD) throw new UserFacingError(`This server already has ${MAX_BOARDS_PER_GUILD} status boards. Remove one with \`/status remove\` first.`);

				await interaction.deferReply({ flags: MessageFlags.Ephemeral });
				const serverId = interaction.options.getString('server') ?? ALL_SERVERS;
				const server = serverId === ALL_SERVERS ? null : await clientFor(panel).getServer(serverId);

				const message = await channel.send(renderStatusBoard(panel, [], { title: server?.name, loading: true }));
				const [board] = await db
					.insert(statusBoards)
					.values({ guildId: guild.id, channelId: channel.id, messageId: message.id, panelId: panel.id, serverId, createdBy: actor.userId })
					.returning();
				if (board) await updateBoard(board);

				await interaction.editReply({
					embeds: [
						embed().setDescription(
							[
								`Posted a status board for ${server ? `**${server.name}**` : `every server on **${panel.name}**`}. It updates every minute.`,
								server ? null : `Boards show up to ${MAX_SERVERS_PER_PANEL} servers.`,
								'Delete the message or use `/status remove` to stop it.',
							]
								.filter(Boolean)
								.join(' '),
						),
					],
				});
				return;
			}

			case 'list': {
				if (!actor.isManager) throw new UserFacingError('Only panel managers can see the list of status boards.');
				const rows = await guildBoards(actor.guildId);
				const lines = rows.map(
					({ board, panelName }) =>
						`**${panelName}** · ${board.serverId === ALL_SERVERS ? 'all servers' : 'one server'} · [message](${messageLink(board.guildId, board.channelId, board.messageId)}) in <#${board.channelId}>`,
				);
				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					embeds: [embed().setTitle('Status boards').setDescription(lines.length ? lines.join('\n') : 'No status boards yet. Post one with `/status post`.')],
				});
				return;
			}

			case 'remove': {
				const [board] = await db
					.select()
					.from(statusBoards)
					.where(and(eq(statusBoards.id, interaction.options.getString('board', true)), eq(statusBoards.guildId, actor.guildId)))
					.limit(1);
				if (!board) throw new UserFacingError('Pick a board from the list.');
				if (!actor.isManager && board.createdBy !== actor.userId) throw new UserFacingError('Only panel managers or whoever posted the board can remove it.');

				await db.delete(statusBoards).where(eq(statusBoards.id, board.id));
				const channel = await interaction.client.channels.fetch(board.channelId).catch(() => null);
				if (channel?.isTextBased() && !channel.isDMBased()) await channel.messages.delete(board.messageId).catch(() => undefined);
				await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed().setDescription('Status board removed.')] });
				return;
			}
		}
	},
};

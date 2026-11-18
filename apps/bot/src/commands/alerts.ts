import { ChannelType, MessageFlags, type AutocompleteInteraction } from 'discord.js';
import { PANEL_KIND_LABELS } from '@zettako/panels';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { ALL_SERVERS, alertRules, panels, type AlertEvent, type AlertRuleRow } from '../db/schema.ts';
import type { Command } from '../interactions.ts';
import { managedPanels, resolveActor } from '../lib/access.ts';
import { assertBotCan, POST_PERMISSIONS, requireBotMember } from '../lib/bot-permissions.ts';
import { truncate } from '../lib/format.ts';
import { clientFor } from '../lib/panels.ts';
import { embed, UserFacingError } from '../lib/replies.ts';
import { guildSlashCommand, managedPanelAutocomplete, panelServerAutocomplete, requireLivePanel } from './shared.ts';

const MAX_RULES_PER_GUILD = 25;

const EVENT_CHOICES: Record<string, AlertEvent[]> = {
	all: ['offline', 'crash', 'resources'],
	down: ['offline', 'crash'],
	resources: ['resources'],
};

const EVENT_LABELS: Record<AlertEvent, string> = {
	offline: 'offline',
	crash: 'crashes',
	resources: 'high usage',
};

function describeRule(rule: AlertRuleRow, panelName: string): string {
	const events = rule.events.map((event) => (event === 'resources' ? `${EVENT_LABELS[event]} (${rule.threshold}%)` : EVENT_LABELS[event])).join(', ');
	return `**${panelName}** · ${rule.serverId === ALL_SERVERS ? 'all servers' : (rule.serverName ?? rule.serverId)} · ${events} → <#${rule.channelId}>${rule.mentionRoleId ? ` pinging <@&${rule.mentionRoleId}>` : ''}`;
}

async function guildRules(guildId: string) {
	return db
		.select({ rule: alertRules, panelName: panels.name })
		.from(alertRules)
		.innerJoin(panels, eq(panels.id, alertRules.panelId))
		.where(eq(alertRules.guildId, guildId));
}

async function ruleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
	if (!interaction.guildId) return interaction.respond([]);
	const query = interaction.options.getFocused().toLowerCase();
	const rows = await guildRules(interaction.guildId);
	await interaction.respond(
		rows
			.map(({ rule, panelName }) => {
				const channel = interaction.guild?.channels.cache.get(rule.channelId)?.name ?? 'unknown channel';
				const target = rule.serverId === ALL_SERVERS ? 'all servers' : (rule.serverName ?? rule.serverId);
				return { name: truncate(`${panelName} · ${target} · #${channel}`, 100), value: rule.id };
			})
			.filter((choice) => choice.name.toLowerCase().includes(query))
			.slice(0, 25),
	);
}

export const alertsCommand: Command = {
	data: guildSlashCommand('alerts', 'Get told in a channel when servers go down or run hot')
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Post alerts for a panel or one server')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true))
				.addStringOption((option) => option.setName('server').setDescription('Only this server (default: every server on the panel)').setAutocomplete(true))
				.addStringOption((option) =>
					option
						.setName('events')
						.setDescription('What to alert on (default: everything)')
						.addChoices(
							{ name: 'Everything: offline, crashes and high usage', value: 'all' },
							{ name: 'Offline and crashes', value: 'down' },
							{ name: 'High CPU, memory or disk', value: 'resources' },
						),
				)
				.addIntegerOption((option) =>
					option.setName('threshold').setDescription('High usage means this percent of the server limit (default 90)').setMinValue(50).setMaxValue(100),
				)
				.addRoleOption((option) => option.setName('ping').setDescription('Role to mention with each alert'))
				.addChannelOption((option) =>
					option.setName('channel').setDescription('Where to post (default: this channel)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
				),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('Alert rules in this Discord server'))
		.addSubcommand((sub) =>
			sub
				.setName('remove')
				.setDescription('Stop an alert rule')
				.addStringOption((option) => option.setName('alert').setDescription('Alert rule').setRequired(true).setAutocomplete(true)),
		),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true).name;
		const actor = await resolveActor(interaction);
		if (focused === 'alert') return ruleAutocomplete(interaction);
		if (!actor.isManager) return interaction.respond([]);
		if (focused === 'panel') return managedPanelAutocomplete(interaction);
		const panelId = interaction.options.getString('panel');
		await panelServerAutocomplete(interaction, (await managedPanels(actor)).find((row) => row.id === panelId));
	},

	async execute(interaction) {
		const actor = await resolveActor(interaction);
		if (!actor.guildId) throw new UserFacingError('Use this in a Discord server the bot has been added to.');

		switch (interaction.options.getSubcommand()) {
			case 'add': {
				const panel = await requireLivePanel(actor, interaction.options.getString('panel', true));
				const { guild } = requireBotMember(interaction);
				const picked = interaction.options.getChannel('channel');
				const channel = picked ? guild.channels.cache.get(picked.id) : interaction.channel;
				if (!channel?.isTextBased() || channel.isDMBased() || channel.isVoiceBased()) throw new UserFacingError('Pick a text channel for the alerts.');
				assertBotCan(channel, POST_PERMISSIONS);

				const [{ rules = 0 } = {}] = await db.select({ rules: count() }).from(alertRules).where(eq(alertRules.guildId, guild.id));
				if (rules >= MAX_RULES_PER_GUILD) throw new UserFacingError(`This server already has ${MAX_RULES_PER_GUILD} alert rules. Remove one with \`/alerts remove\` first.`);

				await interaction.deferReply({ flags: MessageFlags.Ephemeral });
				const client = clientFor(panel);
				const serverId = interaction.options.getString('server') ?? ALL_SERVERS;
				const serverName = serverId === ALL_SERVERS ? null : (await client.getServer(serverId)).name;
				const events = EVENT_CHOICES[interaction.options.getString('events') ?? 'all'] ?? ['offline', 'crash', 'resources'];
				const role = interaction.options.getRole('ping');

				const [rule] = await db
					.insert(alertRules)
					.values({
						guildId: guild.id,
						channelId: channel.id,
						panelId: panel.id,
						serverId,
						serverName,
						events,
						threshold: interaction.options.getInteger('threshold') ?? 90,
						mentionRoleId: role && role.id !== guild.id ? role.id : null,
						createdBy: actor.userId,
					})
					.returning();
				if (!rule) throw new Error('Alert rule insert returned nothing');

				const notes = [
					events.includes('crash') && !client.capabilities.crashLogs
						? `${PANEL_KIND_LABELS[panel.kind]} has no crash log, so crashes show up as "went offline".`
						: null,
					role && !role.mentionable ? `<@&${role.id}> is not mentionable, so the ping only works if the bot may mention all roles.` : null,
					'Servers are checked every minute. The first check only records how things are.',
				].filter(Boolean);
				await interaction.editReply({
					allowedMentions: { parse: [] },
					embeds: [embed().setDescription(`Alert added: ${describeRule(rule, panel.name)}\n\n${notes.join('\n')}`)],
				});
				return;
			}

			case 'list': {
				if (!actor.isManager) throw new UserFacingError('Only panel managers can see the list of alert rules.');
				const rows = await guildRules(actor.guildId);
				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					allowedMentions: { parse: [] },
					embeds: [
						embed()
							.setTitle('Alert rules')
							.setDescription(truncate(rows.length ? rows.map(({ rule, panelName }) => describeRule(rule, panelName)).join('\n') : 'No alert rules yet. Add one with `/alerts add`.', 4_096)),
					],
				});
				return;
			}

			case 'remove': {
				const [rule] = await db
					.select()
					.from(alertRules)
					.where(and(eq(alertRules.id, interaction.options.getString('alert', true)), eq(alertRules.guildId, actor.guildId)))
					.limit(1);
				if (!rule) throw new UserFacingError('Pick an alert rule from the list.');
				if (!actor.isManager && rule.createdBy !== actor.userId) throw new UserFacingError('Only panel managers or whoever added the rule can remove it.');
				await db.delete(alertRules).where(eq(alertRules.id, rule.id));
				await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed().setDescription('Alert rule removed.')] });
				return;
			}
		}
	},
};

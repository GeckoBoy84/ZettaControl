import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder, type StringSelectMenuBuilder } from 'discord.js';
import { PANEL_KIND_LABELS, type PanelCapabilities, type ServerResources, type ServerState, type ServerSummary } from '@zettako/panels';
import type { AccessLevel, PanelRow } from '../db/schema.ts';
import { atLeast } from '../lib/access.ts';
import { customId } from '../interactions.ts';
import { formatBytes, formatCpu, formatLimit, formatUptime } from '../lib/format.ts';
import { embed } from '../lib/replies.ts';
import { availableSections, SERVER_PREFIX, sectionSelect, serverPageUrl } from './sections.ts';

export { SERVER_PREFIX };

export const STATE_LABELS: Record<ServerState, string> = {
	running: '🟢 Running',
	starting: '🟡 Starting',
	stopping: '🟠 Stopping',
	offline: '🔴 Offline',
	unknown: '⚪ Unknown',
};

export interface ServerViewOptions {
	panel: PanelRow;
	server: ServerSummary;
	resources: ServerResources | null;
	/** The viewer's access. Buttons they cannot use are left out. */
	level: AccessLevel;
	/** Decides which sections the "More" menu offers. */
	capabilities: PanelCapabilities;
	notice?: string;
}

export function renderServerView({ panel, server, resources, level, capabilities, notice }: ServerViewOptions) {
	const state = resources?.state ?? 'unknown';
	const view: EmbedBuilder = embed()
		.setTitle(server.name)
		.setURL(serverPageUrl(panel, server))
		.setDescription(
			[
				server.suspended ? '⛔ **Suspended**' : STATE_LABELS[state],
				server.status ? `Status: \`${server.status}\`` : null,
				server.description ? `> ${server.description}` : null,
				notice ? `\n${notice}` : null,
			]
				.filter(Boolean)
				.join('\n'),
		)
		.setFooter({ text: `${panel.name} · ${PANEL_KIND_LABELS[panel.kind]} · ${server.shortId}` })
		.setTimestamp();

	if (resources) {
		view.addFields(
			{ name: 'CPU', value: formatCpu(resources.cpuPercent, server.limits.cpuPercent), inline: true },
			{ name: 'Memory', value: formatLimit(resources.memoryBytes, server.limits.memoryMib), inline: true },
			{ name: 'Disk', value: formatLimit(resources.diskBytes, server.limits.diskMib), inline: true },
			{ name: 'Network', value: `↓ ${formatBytes(resources.networkRxBytes)}  ↑ ${formatBytes(resources.networkTxBytes)}`, inline: true },
			{ name: 'Uptime', value: formatUptime(resources.uptimeMs), inline: true },
			{ name: 'Node', value: server.node ?? '-', inline: true },
		);
	}

	const ids = [panel.id, server.id] as const;
	const blocked = server.suspended || server.status !== null;
	const running = state === 'running' || state === 'starting';

	const power = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(customId(SERVER_PREFIX, 'power', ...ids, 'start'))
			.setLabel('Start')
			.setStyle(ButtonStyle.Success)
			.setDisabled(blocked || running),
		new ButtonBuilder()
			.setCustomId(customId(SERVER_PREFIX, 'power', ...ids, 'restart'))
			.setLabel('Restart')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(blocked),
		new ButtonBuilder()
			.setCustomId(customId(SERVER_PREFIX, 'power', ...ids, 'stop'))
			.setLabel('Stop')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(blocked || state === 'offline'),
		new ButtonBuilder()
			.setCustomId(customId(SERVER_PREFIX, 'kill', ...ids))
			.setLabel('Kill')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(blocked || state === 'offline'),
	);

	const tools = new ActionRowBuilder<ButtonBuilder>();
	if (atLeast(level, 'full')) {
		tools.addComponents(
			new ButtonBuilder()
				.setCustomId(customId(SERVER_PREFIX, 'cmd', ...ids))
				.setLabel('Send command')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(blocked || state !== 'running'),
		);
	}
	tools.addComponents(
		new ButtonBuilder().setCustomId(customId(SERVER_PREFIX, 'refresh', ...ids)).setLabel('Refresh').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setURL(serverPageUrl(panel, server)).setLabel('Open in panel').setStyle(ButtonStyle.Link),
	);

	const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = atLeast(level, 'power') ? [power, tools] : [tools];
	const sections = availableSections(capabilities, level);
	if (sections.length > 0) components.push(sectionSelect(panel, server, sections));
	return { embeds: [view], components };
}

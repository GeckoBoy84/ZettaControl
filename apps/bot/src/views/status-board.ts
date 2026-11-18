import { EmbedBuilder, type MessageCreateOptions } from 'discord.js';
import { PANEL_KIND_LABELS, type ServerResources, type ServerState, type ServerSummary } from '@zettako/panels';
import { brand } from '../brand.ts';
import type { AlertRuleRow, PanelRow } from '../db/schema.ts';
import type { Alert } from '../lib/alert-state.ts';
import { formatBytes, formatUptime, truncate } from '../lib/format.ts';
import { embed } from '../lib/replies.ts';

const STATE_EMOJI: Record<ServerState, string> = {
	running: '🟢',
	starting: '🟡',
	stopping: '🟠',
	offline: '🔴',
	unknown: '⚪',
};

export interface BoardServer {
	server: ServerSummary;
	/** null when the panel did not answer for this server. */
	resources: ServerResources | null;
}

function line({ server, resources }: BoardServer): string {
	if (server.suspended) return `⛔ **${server.name}** · suspended`;
	if (server.status) return `🔧 **${server.name}** · ${server.status}`;
	if (!resources) return `⚪ **${server.name}** · no answer`;
	const emoji = STATE_EMOJI[resources.state];
	if (resources.state !== 'running') return `${emoji} **${server.name}** · ${resources.state}`;
	const memory = server.limits.memoryMib > 0 ? `${formatBytes(resources.memoryBytes)} / ${formatBytes(server.limits.memoryMib * 1024 * 1024)}` : formatBytes(resources.memoryBytes);
	return `${emoji} **${server.name}** · CPU ${resources.cpuPercent.toFixed(0)}% · RAM ${memory} · up ${formatUptime(resources.uptimeMs)}`;
}

/** A status board message. `error` replaces the list when the whole panel failed. */
export function renderStatusBoard(
	panel: PanelRow,
	servers: BoardServer[],
	options: { title?: string; error?: string; hidden?: number; loading?: boolean } = {},
): MessageCreateOptions {
	const running = servers.filter((entry) => entry.resources?.state === 'running').length;
	const body = options.loading
		? 'Loading…'
		: options.error
		? `⚠️ ${options.error}`
		: [servers.length ? servers.map(line).join('\n') : 'No servers.', options.hidden ? `…and ${options.hidden} more` : null].filter(Boolean).join('\n');

	return {
		embeds: [
			embed()
				.setTitle(options.title ?? `${panel.name} status`)
				.setDescription(truncate(body, 4_096))
				.addFields({ name: 'Online', value: options.error || options.loading ? '-' : `${running} of ${servers.length}`, inline: true })
				.setFooter({ text: `${PANEL_KIND_LABELS[panel.kind]} · ${brand.name} updates this every minute` })
				.setTimestamp(),
		],
		allowedMentions: { parse: [] },
	};
}

export function renderAlert(rule: AlertRuleRow, panel: PanelRow, server: ServerSummary, alert: Alert): MessageCreateOptions {
	const view = new EmbedBuilder().setTimestamp().setFooter({ text: `${panel.name} · ${PANEL_KIND_LABELS[panel.kind]} · ${server.shortId}` });
	switch (alert.kind) {
		case 'crash':
			view
				.setColor(brand.errorColor)
				.setTitle(`💥 ${server.name} crashed`)
				.setDescription(
					[`Exit code \`${alert.crash.exitCode}\`.`, alert.crash.outOfMemory ? 'It ran out of memory.' : null].filter(Boolean).join(' '),
				);
			break;
		case 'offline':
			view.setColor(brand.errorColor).setTitle(`🔴 ${server.name} went offline`).setDescription('It was running a minute ago. Someone may have stopped it, or it crashed.');
			break;
		case 'online':
			view.setColor(brand.color).setTitle(`🟢 ${server.name} is back online`);
			break;
		case 'resources':
			view
				.setColor(brand.warningColor)
				.setTitle(`🔥 ${server.name} is running hot`)
				.setDescription(`${alert.metrics.map((metric) => `**${metric.name}** at ${metric.percent.toFixed(0)}% of its limit`).join('\n')}\n\nAlert threshold: ${rule.threshold}%.`);
			break;
	}

	const ping = rule.mentionRoleId && alert.kind !== 'online' ? `<@&${rule.mentionRoleId}>` : undefined;
	return { content: ping, embeds: [view], allowedMentions: { roles: rule.mentionRoleId ? [rule.mentionRoleId] : [] } };
}

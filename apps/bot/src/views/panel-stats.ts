import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type APIEmbedField, type MessageCreateOptions } from 'discord.js';
import { PANEL_KIND_LABELS } from '@zettako/panels';
import { brand } from '../brand.ts';
import type { PanelRow, PanelStatsState, TrackedStatus } from '../db/schema.ts';
import { formatBytes, formatUptime, plural, truncate } from '../lib/format.ts';
import { MAX_NODES, type NodeSnapshot, type NodeStatus, type PanelSnapshot } from '../lib/panel-snapshot.ts';
import type { StatsEvent } from '../lib/stats-state.ts';

const STATUS_EMOJI: Record<NodeStatus, string> = { online: '🟢', offline: '🔴', unknown: '⚪' };
const MIB = 1024 * 1024;

function relative(iso: string): string {
	return `<t:${Math.floor(Date.parse(iso) / 1000)}:R>`;
}

/** "Up since 3 days ago", from what the board remembers. Left out when it disagrees with this check. */
function sinceLine(tracked: TrackedStatus | null | undefined, status: NodeStatus): string | null {
	if (!tracked || status === 'unknown' || tracked.online !== (status === 'online')) return null;
	return `${tracked.online ? 'Up' : 'Down'} since ${relative(tracked.since)}`;
}

function allocatedLine(label: string, allocatedMib: number, capacityMib: number): string {
	const allocated = formatBytes(allocatedMib * MIB);
	return capacityMib > 0 ? `${label} ${allocated} of ${formatBytes(capacityMib * MIB)} allocated` : `${label} ${allocated} allocated`;
}

function nodeField({ node, status, stats, note }: NodeSnapshot, tracked: TrackedStatus | undefined): APIEmbedField {
	const lines: (string | null)[] = [];
	if (stats) {
		lines.push(
			`CPU ${stats.cpuPercent.toFixed(0)}% of ${plural(stats.cpuThreads, 'thread')}`,
			`RAM ${formatBytes(stats.memoryUsedBytes)} / ${formatBytes(stats.memoryTotalBytes)}`,
			`Disk ${formatBytes(stats.diskUsedBytes)} / ${formatBytes(stats.diskTotalBytes)}`,
			stats.servers ? `Servers ${stats.servers.online} / ${stats.servers.total} running` : null,
		);
	} else if (node.allocated) {
		lines.push(allocatedLine('RAM', node.allocated.memoryMib, node.memoryMib), allocatedLine('Disk', node.allocated.diskMib, node.diskMib));
	}
	lines.push(sinceLine(tracked, status), status === 'unknown' && note ? `Status unknown: ${note}` : null);

	const name = `${STATUS_EMOJI[status]} ${node.name}${node.maintenance ? ' 🔧' : ''}`;
	return { name: truncate(name, 256), value: truncate(lines.filter(Boolean).join('\n') || '-', 1_024), inline: true };
}

/** Nodes as the board last knew them, while the panel itself does not answer. */
function rememberedFields(state: PanelStatsState | null): APIEmbedField[] {
	return Object.values(state?.nodes ?? {})
		.toSorted((a, b) => a.name.localeCompare(b.name))
		.slice(0, MAX_NODES)
		.map((node) => ({ name: truncate(`${STATUS_EMOJI.unknown} ${node.name}`, 256), value: 'Unknown while the panel is down', inline: true }));
}

export interface StatsViewOptions {
	/** The board is a live channel message rather than a one-off look. */
	live?: boolean;
	/** Custom ID for a Refresh button, for the one-off view. */
	refreshId?: string;
}

/** A panel stats board, or the one-off `/admin overview`. `snapshot` is null while loading. */
export function renderPanelStats(panel: PanelRow, snapshot: PanelSnapshot | null, state: PanelStatsState | null, options: StatsViewOptions = {}): MessageCreateOptions {
	const view = new EmbedBuilder()
		.setTitle(`${panel.name} stats`)
		.setFooter({ text: `${PANEL_KIND_LABELS[panel.kind]} · ${options.live ? `${brand.name} updates this every minute` : 'checked just now'}` })
		.setTimestamp();

	if (!snapshot) {
		view.setColor(brand.color).setDescription('Loading…');
	} else if (!snapshot.ok) {
		const down = state?.panel && !state.panel.online ? `has not answered since ${relative(state.panel.since)}` : 'is not answering';
		view
			.setColor(snapshot.down ? brand.errorColor : brand.warningColor)
			.setDescription(snapshot.down ? `🔴 **Panel** ${down}\n${snapshot.error}` : `⚠️ ${snapshot.error}`)
			.addFields(snapshot.down ? rememberedFields(state) : []);
	} else {
		const online = snapshot.nodes.filter((entry) => entry.status === 'online').length;
		const offline = snapshot.nodes.filter((entry) => entry.status === 'offline').length;
		const panelSince = state?.panel?.online ? ` · up since ${relative(state.panel.since)}` : '';
		view
			.setColor(offline > 0 ? brand.warningColor : brand.color)
			.setDescription(
				[
					`🟢 **Panel** online · ${snapshot.latencyMs} ms${panelSince}`,
					`**Nodes** ${online} / ${snapshot.nodes.length} online · **Servers** ${snapshot.totals.servers} · **Users** ${snapshot.totals.users}`,
					snapshot.nodes.length === 0 ? '\nNo nodes on this panel yet.' : null,
					snapshot.hidden > 0 ? `…and ${plural(snapshot.hidden, 'more node')} not shown` : null,
				]
					.filter(Boolean)
					.join('\n'),
			)
			.addFields(snapshot.nodes.map((entry) => nodeField(entry, state?.nodes[entry.node.id])));
	}

	const buttons = new ActionRowBuilder<ButtonBuilder>();
	if (options.refreshId) buttons.addComponents(new ButtonBuilder().setCustomId(options.refreshId).setLabel('Refresh').setStyle(ButtonStyle.Secondary));
	buttons.addComponents(new ButtonBuilder().setURL(panel.url).setLabel('Open panel').setStyle(ButtonStyle.Link));
	return { embeds: [view], components: [buttons], allowedMentions: { parse: [] } };
}

export function renderStatsAlert(panel: PanelRow, event: StatsEvent, mentionRoleId: string | null): MessageCreateOptions {
	const subject = event.target === 'panel' ? `The ${panel.name} panel` : `Node ${event.name}`;
	const lasted = formatUptime(Date.parse(event.since) - Date.parse(event.previousSince));
	const view = new EmbedBuilder().setFooter({ text: `${panel.name} · ${PANEL_KIND_LABELS[panel.kind]}` }).setTimestamp(new Date(event.since));
	if (event.online) {
		view.setColor(brand.color).setTitle(`🟢 ${subject} is back online`).setDescription(`It was down for ${lasted}.`);
	} else {
		view
			.setColor(brand.errorColor)
			.setTitle(`🔴 ${subject} is offline`)
			.setDescription(`It stopped answering ${relative(event.since)}, after at least ${lasted} up.`);
	}

	const ping = mentionRoleId && !event.online ? `<@&${mentionRoleId}>` : undefined;
	return { content: ping, embeds: [view], allowedMentions: { roles: mentionRoleId ? [mentionRoleId] : [] } };
}

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	LabelBuilder,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	type InteractionEditReplyOptions,
} from 'discord.js';
import { PANEL_KIND_LABELS, type AdminClient, type AdminPage, type AdminServer, type AdminUser, type PanelKind } from '@zettako/panels';
import type { PanelRow } from '../db/schema.ts';
import { customId } from '../interactions.ts';
import { discordTime, formatBytes, plural, truncate } from '../lib/format.ts';
import type { PanelSnapshot } from '../lib/panel-snapshot.ts';
import { embed } from '../lib/replies.ts';
import { renderPanelStats } from './panel-stats.ts';

export const ADMIN_PREFIX = 'admin';

const MIB = 1024 * 1024;

const KEY_HELP: Record<PanelKind, string> = {
	calagopus: 'A key from an account with admin permissions. Leave empty to use the linked key.',
	pterodactyl1: 'Admin area > Application API. Leave empty to remove the stored key.',
	pterodactyl2: 'Admin area > Application API. Leave empty to remove the stored key.',
	pelican: 'Admin > API Keys, an application key. Leave empty to remove the stored key.',
};

export function renderKeyModal(panel: PanelRow): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(customId(ADMIN_PREFIX, 'key', panel.id))
		.setTitle(truncate(`Admin key for ${panel.name}`, 45))
		.addLabelComponents(
			new LabelBuilder()
				.setLabel('Admin key')
				.setDescription(KEY_HELP[panel.kind])
				.setTextInputComponent(new TextInputBuilder().setCustomId('key').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false)),
		);
}

function footer(panel: PanelRow, shown: number, total: number, search?: string): string {
	const showing = shown < total ? `Showing ${shown} of ${total}` : plural(total, 'result');
	return `${panel.name} · ${PANEL_KIND_LABELS[panel.kind]} · ${showing}${search ? ` for "${truncate(search, 40)}"` : ''}`;
}

function limit(mib: number): string {
	return mib > 0 ? formatBytes(mib * MIB) : 'Unlimited';
}

function serverState(server: AdminServer): string {
	if (server.suspended) return '⛔ Suspended';
	if (server.status) return `🔧 ${server.status.replaceAll('_', ' ')}`;
	return '✅ Active';
}

/** `/admin overview`: the stats board's view, checked once, with a Refresh button. */
export function renderOverview(panel: PanelRow, snapshot: PanelSnapshot): InteractionEditReplyOptions {
	const { embeds, components } = renderPanelStats(panel, snapshot, null, { refreshId: customId(ADMIN_PREFIX, 'overview', panel.id) });
	return { embeds, components };
}

export function renderAdminServers(panel: PanelRow, page: AdminPage<AdminServer>, search?: string): InteractionEditReplyOptions {
	const lines = page.items.map(
		(server) => `**${server.name}** \`${server.shortId}\` · ${server.owner ?? '?'} · ${server.node ?? '?'}${server.suspended || server.status ? ` · ${serverState(server)}` : ''}`,
	);
	const view = embed()
		.setTitle(`${panel.name} servers`)
		.setDescription(truncate(lines.join('\n') || (search ? 'No servers match that name.' : 'No servers on this panel yet.'), 4_096))
		.setFooter({ text: footer(panel, page.items.length, page.total, search) });

	const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
	if (page.items.length > 0) {
		components.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(customId(ADMIN_PREFIX, 'server', panel.id))
					.setPlaceholder('Pick a server to manage')
					.addOptions(
						page.items.slice(0, 25).map((server) => ({
							label: truncate(server.name, 100),
							description: truncate(`${server.owner ?? '?'} · ${server.node ?? '?'}`, 100),
							value: server.id,
						})),
					),
			),
		);
	}
	return { embeds: [view], components };
}

export function renderAdminServer(
	panel: PanelRow,
	admin: AdminClient,
	server: AdminServer,
	options: { notice?: string; confirmReinstall?: boolean } = {},
): InteractionEditReplyOptions {
	const view = embed()
		.setTitle(server.name)
		.setDescription(
			[
				serverState(server),
				server.description ? `> ${truncate(server.description, 500)}` : null,
				options.notice ? `\n${options.notice}` : null,
				options.confirmReinstall ? '\n**Reinstall this server?** It runs the install script again, which can overwrite files.' : null,
			]
				.filter(Boolean)
				.join('\n'),
		)
		.addFields(
			{ name: 'Owner', value: server.owner ?? '-', inline: true },
			{ name: 'Node', value: server.node ?? '-', inline: true },
			{ name: 'Created', value: discordTime(server.createdAt, 'd'), inline: true },
			{ name: 'Memory limit', value: limit(server.limits.memoryMib), inline: true },
			{ name: 'Disk limit', value: limit(server.limits.diskMib), inline: true },
			{ name: 'CPU limit', value: server.limits.cpuPercent > 0 ? `${server.limits.cpuPercent}%` : 'Unlimited', inline: true },
		)
		.setFooter({ text: `${panel.name} · ${PANEL_KIND_LABELS[panel.kind]} · ${server.shortId}` });

	const ids = [panel.id, server.id] as const;
	const buttons = new ActionRowBuilder<ButtonBuilder>();
	if (options.confirmReinstall) {
		buttons.addComponents(
			new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'reinstallyes', ...ids)).setLabel('Reinstall').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'srv', ...ids)).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
		);
		return { embeds: [view], components: [buttons] };
	}

	if (admin.capabilities.suspendServers) {
		buttons.addComponents(
			server.suspended
				? new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'unsuspend', ...ids)).setLabel('Unsuspend').setStyle(ButtonStyle.Success)
				: new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'suspend', ...ids)).setLabel('Suspend').setStyle(ButtonStyle.Danger),
		);
	}
	if (admin.capabilities.reinstallServers) {
		buttons.addComponents(
			new ButtonBuilder()
				.setCustomId(customId(ADMIN_PREFIX, 'reinstall', ...ids))
				.setLabel('Reinstall')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(server.suspended || server.status !== null),
		);
	}
	buttons.addComponents(
		new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'srv', ...ids)).setLabel('Refresh').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'servers', panel.id)).setLabel('All servers').setStyle(ButtonStyle.Secondary),
	);
	return { embeds: [view], components: [buttons] };
}

export function renderAdminUsers(panel: PanelRow, page: AdminPage<AdminUser>, search?: string): InteractionEditReplyOptions {
	const lines = page.items.map(
		(user) => `**${user.username}** · ${user.email}${user.admin ? ' · 👑 admin' : ''}${user.suspended ? ' · ⛔ suspended' : ''}`,
	);
	const view = embed()
		.setTitle(`${panel.name} users`)
		.setDescription(truncate(lines.join('\n') || (search ? 'No users match that name.' : 'No users.'), 4_096))
		.setFooter({ text: footer(panel, page.items.length, page.total, search) });

	const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
	if (page.items.length > 0) {
		components.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(customId(ADMIN_PREFIX, 'user', panel.id))
					.setPlaceholder('Pick a user')
					.addOptions(page.items.slice(0, 25).map((user) => ({ label: truncate(user.username, 100), description: truncate(user.email, 100), value: user.id }))),
			),
		);
	}
	return { embeds: [view], components };
}

export function renderAdminUser(panel: PanelRow, admin: AdminClient, user: AdminUser, notice?: string): InteractionEditReplyOptions {
	const view = embed()
		.setTitle(user.username)
		.setDescription([user.suspended ? '⛔ Suspended' : null, notice ?? null].filter(Boolean).join('\n\n') || null)
		.addFields(
			{ name: 'Email', value: user.email || '-', inline: true },
			{ name: 'Admin', value: user.admin ? 'Yes' : 'No', inline: true },
			{ name: 'Two factor', value: user.twoFactor ? 'On' : 'Off', inline: true },
			{ name: 'Created', value: discordTime(user.createdAt, 'd'), inline: true },
		)
		.setFooter({ text: `${panel.name} · ${PANEL_KIND_LABELS[panel.kind]}` });

	const ids = [panel.id, user.id] as const;
	const buttons = new ActionRowBuilder<ButtonBuilder>();
	if (admin.capabilities.suspendUsers && user.suspended !== null) {
		buttons.addComponents(
			user.suspended
				? new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'uunsuspend', ...ids)).setLabel('Unsuspend').setStyle(ButtonStyle.Success)
				: new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'ususpend', ...ids)).setLabel('Suspend').setStyle(ButtonStyle.Danger),
		);
	}
	buttons.addComponents(new ButtonBuilder().setCustomId(customId(ADMIN_PREFIX, 'users', panel.id)).setLabel('All users').setStyle(ButtonStyle.Secondary));
	return { embeds: [view], components: [buttons] };
}

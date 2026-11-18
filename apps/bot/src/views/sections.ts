import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type EmbedBuilder } from 'discord.js';
import { PANEL_KIND_LABELS, type PanelCapabilities, type PanelClient, type ServerSummary } from '@zettako/panels';
import type { AccessLevel, PanelRow } from '../db/schema.ts';
import { customId } from '../interactions.ts';
import { ACCESS_LEVEL_LABELS, atLeast } from '../lib/access.ts';
import { embed, UserFacingError } from '../lib/replies.ts';

// The parts of a game server beyond power and stats. Each section lists what the
// panel has and offers the actions the viewer's access allows. A section shows only
// when the panel supports it and the viewer has its minimum level.

export const SERVER_PREFIX = 'srv';

export interface SectionInfo {
	label: string;
	description: string;
	capability: keyof PanelCapabilities;
	/** Minimum access to open the section. Actions inside may need more. */
	level: AccessLevel;
}

export const SECTIONS = {
	backups: { label: 'Backups', description: 'Create, restore and download backups', capability: 'backups', level: 'view' },
	files: { label: 'Files', description: 'Browse, read, edit and download files', capability: 'files', level: 'full' },
	schedules: { label: 'Schedules', description: 'See schedules and run them now', capability: 'schedules', level: 'view' },
	databases: { label: 'Databases', description: 'Connection details and passwords', capability: 'databases', level: 'full' },
	network: { label: 'Network', description: 'IP addresses and ports', capability: 'network', level: 'view' },
	users: { label: 'Subusers', description: 'Panel users with access to this server', capability: 'subusers', level: 'full' },
	startup: { label: 'Startup', description: 'Startup variables', capability: 'startup', level: 'full' },
} as const satisfies Record<string, SectionInfo>;

export type SectionName = keyof typeof SECTIONS;

export function isSectionName(value: string): value is SectionName {
	return Object.hasOwn(SECTIONS, value);
}

/** What every section view and handler works with. Built by resolveServer(). */
export interface ServerContext {
	panel: PanelRow;
	client: PanelClient;
	serverId: string;
	level: AccessLevel;
}

export function availableSections(capabilities: PanelCapabilities, level: AccessLevel): SectionName[] {
	return (Object.keys(SECTIONS) as SectionName[]).filter((name) => capabilities[SECTIONS[name].capability] && atLeast(level, SECTIONS[name].level));
}

/** Throws a friendly error when the panel lacks the section or the viewer lacks access to `needed`. */
export function requireSection(ctx: ServerContext, name: SectionName, needed: AccessLevel = SECTIONS[name].level): void {
	const section = SECTIONS[name];
	if (!ctx.client.capabilities[section.capability]) {
		throw new UserFacingError(`${PANEL_KIND_LABELS[ctx.panel.kind]} panels do not support ${section.label.toLowerCase()} through the API.`);
	}
	if (!atLeast(ctx.level, needed)) {
		throw new UserFacingError(`You need **${ACCESS_LEVEL_LABELS[needed]}** access on this server for that. You have **${ACCESS_LEVEL_LABELS[ctx.level]}**.`);
	}
}

export function sectionSelect(panel: PanelRow, server: ServerSummary, sections: SectionName[]): ActionRowBuilder<StringSelectMenuBuilder> {
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(customId(SERVER_PREFIX, 'section', panel.id, server.id))
			.setPlaceholder('More: backups, files, schedules...')
			.addOptions(sections.map((name) => ({ label: SECTIONS[name].label, description: SECTIONS[name].description, value: name }))),
	);
}

export function sectionEmbed(name: SectionName, panel: PanelRow, server: ServerSummary): EmbedBuilder {
	return embed()
		.setTitle(`${SECTIONS[name].label} · ${server.name}`)
		.setFooter({ text: `${panel.name} · ${PANEL_KIND_LABELS[panel.kind]} · ${server.shortId}` });
}

/** Back to the server view. Reuses its refresh button. */
export function backButton(panel: PanelRow, serverId: string, label = 'Back to server'): ButtonBuilder {
	return new ButtonBuilder().setCustomId(customId(SERVER_PREFIX, 'refresh', panel.id, serverId)).setLabel(label).setStyle(ButtonStyle.Secondary);
}

/** All supported panels serve the server page at /server/<short id>. */
export function serverPageUrl(panel: PanelRow, server: ServerSummary, path = ''): string {
	return `${panel.url}/server/${encodeURIComponent(server.shortId)}${path}`;
}

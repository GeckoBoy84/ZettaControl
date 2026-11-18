import {
	ApplicationIntegrationType,
	PermissionFlagsBits,
	type GuildMember,
	type APIInteractionGuildMember,
	type Interaction,
} from 'discord.js';
import { and, eq, or } from 'drizzle-orm';
import { createPanelClient, type PanelClient, type ServerSummary } from '@zettako/panels';
import { brand } from '../brand.ts';
import { db } from '../db/client.ts';
import { panels, type PanelRow } from '../db/schema.ts';
import { decryptSecret } from './crypto.ts';

const SERVER_CACHE_TTL_MS = 30_000;

/**
 * The guild whose panels apply to this interaction, or null. Guild panels only
 * apply where the bot itself is installed in the guild, not when someone uses
 * the user-installed app in a server the bot is not in.
 */
export function guildContext(interaction: Interaction): string | null {
	if (!interaction.guildId) return null;
	const owners = interaction.authorizingIntegrationOwners;
	return owners[ApplicationIntegrationType.GuildInstall] === interaction.guildId ? interaction.guildId : null;
}

export function canManageGuildPanels(interaction: Interaction): boolean {
	return guildContext(interaction) !== null && (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false);
}

function memberRoleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
	if (!member) return [];
	return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}

/** Can this interaction's user operate servers on this panel? */
export function canUsePanel(interaction: Interaction, panel: PanelRow): boolean {
	if (panel.scope === 'user') return panel.ownerId === interaction.user.id;
	if (guildContext(interaction) !== panel.ownerId) return false;
	if (canManageGuildPanels(interaction)) return true;
	const roles = memberRoleIds(interaction.member);
	return panel.allowedRoleIds.some((roleId) => roles.includes(roleId));
}

/** Panels the user can see here: their own, plus the guild's they have access to. */
export async function accessiblePanels(interaction: Interaction): Promise<PanelRow[]> {
	const guildId = guildContext(interaction);
	const rows = await db
		.select()
		.from(panels)
		.where(
			guildId
				? or(and(eq(panels.scope, 'user'), eq(panels.ownerId, interaction.user.id)), and(eq(panels.scope, 'guild'), eq(panels.ownerId, guildId)))
				: and(eq(panels.scope, 'user'), eq(panels.ownerId, interaction.user.id)),
		)
		.orderBy(panels.name);
	return rows.filter((row) => canUsePanel(interaction, row));
}

export async function findAccessiblePanel(interaction: Interaction, panelId: string): Promise<PanelRow | null> {
	const [row] = await db.select().from(panels).where(eq(panels.id, panelId)).limit(1);
	return row && canUsePanel(interaction, row) ? row : null;
}

const clients = new Map<string, { updatedAt: number; client: PanelClient }>();

export function clientFor(panel: PanelRow): PanelClient {
	const cached = clients.get(panel.id);
	if (cached && cached.updatedAt === panel.updatedAt.getTime()) return cached.client;

	const client = createPanelClient(panel.kind, {
		url: panel.url,
		apiKey: decryptSecret(panel.apiKeyEncrypted, panel.id),
		userAgent: `${brand.name} (+${brand.source})`,
	});
	clients.set(panel.id, { updatedAt: panel.updatedAt.getTime(), client });
	return client;
}

export function forgetClient(panelId: string): void {
	clients.delete(panelId);
	serverCache.delete(panelId);
}

const serverCache = new Map<string, { expires: number; servers: Promise<ServerSummary[]> }>();

/** Server lists are cached briefly so autocomplete does not hit the panel on every keystroke. */
export function listServersCached(panel: PanelRow): Promise<ServerSummary[]> {
	const cached = serverCache.get(panel.id);
	if (cached && cached.expires > Date.now()) return cached.servers;

	const servers = clientFor(panel).listServers();
	serverCache.set(panel.id, { expires: Date.now() + SERVER_CACHE_TTL_MS, servers });
	servers.catch(() => serverCache.delete(panel.id));
	return servers;
}

/** Server references in autocomplete values and custom IDs: `<panelId>:<serverId>`. */
export function serverRef(panelId: string, serverId: string): string {
	return `${panelId}:${serverId}`;
}

export function parseServerRef(ref: string): { panelId: string; serverId: string } | null {
	const separator = ref.indexOf(':');
	if (separator <= 0 || separator === ref.length - 1) return null;
	return { panelId: ref.slice(0, separator), serverId: ref.slice(separator + 1) };
}

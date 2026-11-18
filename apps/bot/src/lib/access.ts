// Who can do what with which panel.
//
// Personal panels: the owner has full access, nobody else has any.
// Server panels: managers have full access. Managers are members with Manage Server or
// Administrator (always, so nobody can lock themselves out) plus any manager roles the
// server adds. Everyone else gets the highest level any of their roles is granted, per
// panel or per game server.

import {
	ApplicationIntegrationType,
	PermissionFlagsBits,
	type APIInteractionGuildMember,
	type GuildMember,
	type Interaction,
} from 'discord.js';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { guildSettings, panels, roleGrants, type PanelRow, type RoleGrantRow } from '../db/schema.ts';
import { computeAccess, type Actor, type PanelAccess } from './access-rules.ts';

export * from './access-rules.ts';

/**
 * The guild whose panels apply to this interaction. Guild panels only apply where the
 * bot itself is installed in the guild, not when someone uses the user installed app in
 * a server the bot is not in.
 */
export function guildContext(interaction: Interaction): string | null {
	if (!interaction.guildId) return null;
	const owners = interaction.authorizingIntegrationOwners;
	return owners[ApplicationIntegrationType.GuildInstall] === interaction.guildId ? interaction.guildId : null;
}

function memberRoleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
	if (!member) return [];
	return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}

const managerRoleCache = new Map<string, { expires: number; roleIds: string[] }>();
const MANAGER_CACHE_MS = 60_000;

export async function managerRoleIds(guildId: string): Promise<string[]> {
	const cached = managerRoleCache.get(guildId);
	if (cached && cached.expires > Date.now()) return cached.roleIds;

	const [row] = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
	const roleIds = row?.managerRoleIds ?? [];
	managerRoleCache.set(guildId, { expires: Date.now() + MANAGER_CACHE_MS, roleIds });
	return roleIds;
}

export async function setManagerRoleIds(guildId: string, roleIds: string[]): Promise<void> {
	await db
		.insert(guildSettings)
		.values({ guildId, managerRoleIds: roleIds })
		.onConflictDoUpdate({ target: guildSettings.guildId, set: { managerRoleIds: roleIds, updatedAt: new Date() } });
	managerRoleCache.delete(guildId);
}

export async function resolveActor(interaction: Interaction): Promise<Actor> {
	const guildId = guildContext(interaction);
	const roleIds = guildId ? memberRoleIds(interaction.member) : [];
	const hasManageServer =
		guildId !== null &&
		(interaction.memberPermissions?.any([PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator]) ?? false);
	const isManager = hasManageServer || (guildId !== null && (await managerRoleIds(guildId)).some((id) => roleIds.includes(id)));
	return { userId: interaction.user.id, guildId, roleIds, hasManageServer, isManager };
}

/** Panels the actor can use at all here, with their access. */
export async function accessiblePanels(actor: Actor): Promise<PanelAccess[]> {
	const own = and(eq(panels.scope, 'user'), eq(panels.ownerId, actor.userId));
	const rows = await db
		.select()
		.from(panels)
		.where(actor.guildId ? or(own, and(eq(panels.scope, 'guild'), eq(panels.ownerId, actor.guildId))) : own)
		.orderBy(panels.name);
	const grants = await grantsFor(actor, rows);
	return rows.map((row) => computeAccess(actor, row, grants)).filter((access): access is PanelAccess => access !== null);
}

export async function panelAccess(actor: Actor, panelId: string): Promise<PanelAccess | null> {
	const [row] = await db.select().from(panels).where(eq(panels.id, panelId)).limit(1);
	if (!row) return null;
	return computeAccess(actor, row, await grantsFor(actor, [row]));
}

async function grantsFor(actor: Actor, rows: PanelRow[]): Promise<RoleGrantRow[]> {
	const guildPanelIds = rows.filter((row) => row.scope === 'guild').map((row) => row.id);
	if (actor.isManager || guildPanelIds.length === 0 || actor.roleIds.length === 0) return [];
	return db
		.select()
		.from(roleGrants)
		.where(and(inArray(roleGrants.panelId, guildPanelIds), inArray(roleGrants.roleId, actor.roleIds)));
}

/** Panels the actor may edit: their own, plus the guild's if they are a manager. */
export async function managedPanels(actor: Actor): Promise<PanelRow[]> {
	const own = and(eq(panels.scope, 'user'), eq(panels.ownerId, actor.userId));
	const guildId = actor.isManager ? actor.guildId : null;
	return db
		.select()
		.from(panels)
		.where(guildId ? or(own, and(eq(panels.scope, 'guild'), eq(panels.ownerId, guildId))) : own)
		.orderBy(panels.name);
}

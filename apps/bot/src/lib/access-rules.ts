// Pure access rules, kept free of Discord and database imports so they are easy to test.
// access.ts loads the data and applies these.

import { ALL_SERVERS, type AccessLevel, type PanelRow, type RoleGrantRow } from '../db/schema.ts';

const RANK: Record<AccessLevel, number> = { view: 1, power: 2, full: 3 };

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
	view: 'View',
	power: 'Power',
	full: 'Full',
};

export const ACCESS_LEVEL_DESCRIPTIONS: Record<AccessLevel, string> = {
	view: 'see status and stats',
	power: 'see stats, start, stop, restart and kill',
	full: 'everything, including console commands',
};

export function atLeast(level: AccessLevel | null, needed: AccessLevel): boolean {
	return level !== null && RANK[level] >= RANK[needed];
}

function higher(a: AccessLevel | null, b: AccessLevel): AccessLevel {
	return a !== null && RANK[a] >= RANK[b] ? a : b;
}

export interface Actor {
	userId: string;
	/** The guild whose panels apply here, or null (DMs, or a user install in a guild without the bot). */
	guildId: string | null;
	roleIds: string[];
	/** Has Manage Server or Administrator in this guild. */
	hasManageServer: boolean;
	/** Can manage this guild's panels: Manage Server or a manager role. */
	isManager: boolean;
}

export interface PanelAccess {
	panel: PanelRow;
	/** Level for every server on the panel, or null if only some servers are granted. */
	all: AccessLevel | null;
	/** Extra per server levels, by panel server ID. */
	servers: Map<string, AccessLevel>;
}

/** Pure: works out access to one panel from the actor and the grants for their roles. */
export function computeAccess(actor: Actor, panel: PanelRow, grants: RoleGrantRow[]): PanelAccess | null {
	if (panel.scope === 'user') {
		return panel.ownerId === actor.userId ? { panel, all: 'full', servers: new Map() } : null;
	}
	if (panel.ownerId !== actor.guildId) return null;
	if (actor.isManager) return { panel, all: 'full', servers: new Map() };

	let all: AccessLevel | null = null;
	const servers = new Map<string, AccessLevel>();
	for (const grant of grants) {
		if (grant.panelId !== panel.id || !actor.roleIds.includes(grant.roleId)) continue;
		if (grant.serverId === ALL_SERVERS) all = higher(all, grant.level);
		else servers.set(grant.serverId, higher(servers.get(grant.serverId) ?? null, grant.level));
	}
	return all !== null || servers.size > 0 ? { panel, all, servers } : null;
}

/** The effective level on one game server, or null for no access. */
export function levelFor(access: PanelAccess, serverId: string): AccessLevel | null {
	const specific = access.servers.get(serverId) ?? null;
	if (access.all === null) return specific;
	return specific === null ? access.all : higher(access.all, specific);
}

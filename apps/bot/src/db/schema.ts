import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { PanelKind } from '@zettako/panels';

/**
 * A linked panel. `scope` decides who owns it:
 * - `user`: owned by one Discord user, usable by them anywhere (DMs, any guild, user installs).
 * - `guild`: owned by a Discord server. Managers (see guildSettings) have full control;
 *   everyone else needs a roleGrants row.
 */
export const panels = pgTable(
	'panels',
	{
		id: uuid('id').primaryKey(),
		scope: text('scope', { enum: ['user', 'guild'] }).notNull(),
		/** Discord user ID for `user` scope, guild ID for `guild` scope. */
		ownerId: text('owner_id').notNull(),
		name: text('name').notNull(),
		kind: text('kind').$type<PanelKind>().notNull(),
		url: text('url').notNull(),
		/** AES-256-GCM, see lib/crypto.ts. Never log or return this. */
		apiKeyEncrypted: text('api_key_encrypted').notNull(),
		/** Panel username the key belongs to, shown so people know which account is linked. */
		panelUsername: text('panel_username').notNull(),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('panels_owner_name_idx').on(table.scope, table.ownerId, table.name),
		index('panels_owner_idx').on(table.scope, table.ownerId),
	],
);

/**
 * Per Discord server settings. Members with Manage Server or Administrator are always
 * managers; `managerRoleIds` adds more. Managers link panels and hand out access.
 */
export const guildSettings = pgTable('guild_settings', {
	guildId: text('guild_id').primaryKey(),
	managerRoleIds: text('manager_role_ids').array().notNull().default([]),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** view: stats only. power: plus start, stop, restart, kill. full: plus console commands. */
export const ACCESS_LEVELS = ['view', 'power', 'full'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Server ID meaning "every server on the panel". */
export const ALL_SERVERS = '*';

/** Lets a Discord role use a guild panel, either all of it or one game server. */
export const roleGrants = pgTable(
	'role_grants',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		panelId: uuid('panel_id')
			.notNull()
			.references(() => panels.id, { onDelete: 'cascade' }),
		roleId: text('role_id').notNull(),
		/** Panel server ID, or ALL_SERVERS. */
		serverId: text('server_id').notNull().default(ALL_SERVERS),
		/** Server name when granted, so lists read well without asking the panel. */
		serverName: text('server_name'),
		level: text('level').$type<AccessLevel>().notNull(),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('role_grants_target_idx').on(table.panelId, table.roleId, table.serverId),
		index('role_grants_role_idx').on(table.roleId),
	],
);

export type PanelRow = typeof panels.$inferSelect;
export type RoleGrantRow = typeof roleGrants.$inferSelect;

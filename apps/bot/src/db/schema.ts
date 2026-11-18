import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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

/** A private thread that streams a game server's console. See lib/consoles.ts. */
export const consoleThreads = pgTable(
	'console_threads',
	{
		threadId: text('thread_id').primaryKey(),
		guildId: text('guild_id').notNull(),
		panelId: uuid('panel_id')
			.notNull()
			.references(() => panels.id, { onDelete: 'cascade' }),
		serverId: text('server_id').notNull(),
		serverName: text('server_name').notNull(),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index('console_threads_guild_idx').on(table.guildId)],
);

/** A channel message the bot keeps up to date with server states. See lib/monitor.ts. */
export const statusBoards = pgTable(
	'status_boards',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		guildId: text('guild_id').notNull(),
		channelId: text('channel_id').notNull(),
		messageId: text('message_id').notNull().unique(),
		panelId: uuid('panel_id')
			.notNull()
			.references(() => panels.id, { onDelete: 'cascade' }),
		/** Panel server ID, or ALL_SERVERS. */
		serverId: text('server_id').notNull().default(ALL_SERVERS),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index('status_boards_guild_idx').on(table.guildId)],
);

export const ALERT_EVENTS = ['offline', 'crash', 'resources'] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];

/** Posts to a channel when a server goes offline, crashes or runs hot. See lib/monitor.ts. */
export const alertRules = pgTable(
	'alert_rules',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		guildId: text('guild_id').notNull(),
		channelId: text('channel_id').notNull(),
		panelId: uuid('panel_id')
			.notNull()
			.references(() => panels.id, { onDelete: 'cascade' }),
		/** Panel server ID, or ALL_SERVERS. */
		serverId: text('server_id').notNull().default(ALL_SERVERS),
		serverName: text('server_name'),
		events: text('events').array().$type<AlertEvent[]>().notNull(),
		/** Percent of the server's CPU, memory or disk limit that counts as high. */
		threshold: integer('threshold').notNull().default(90),
		mentionRoleId: text('mention_role_id'),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index('alert_rules_guild_idx').on(table.guildId)],
);

export type PanelRow = typeof panels.$inferSelect;
export type RoleGrantRow = typeof roleGrants.$inferSelect;
export type ConsoleThreadRow = typeof consoleThreads.$inferSelect;
export type StatusBoardRow = typeof statusBoards.$inferSelect;
export type AlertRuleRow = typeof alertRules.$inferSelect;

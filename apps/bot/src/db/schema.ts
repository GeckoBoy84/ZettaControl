import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { PanelKind } from '@zettako/panels';

/**
 * A linked panel. `scope` decides who owns it:
 * - `user`: owned by one Discord user, usable by them anywhere (DMs, any guild, user installs).
 * - `guild`: owned by a Discord server, managed by members with Manage Server, and usable
 *   by members with one of `allowedRoleIds`.
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
		allowedRoleIds: text('allowed_role_ids').array().notNull().default([]),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('panels_owner_name_idx').on(table.scope, table.ownerId, table.name),
		index('panels_owner_idx').on(table.scope, table.ownerId),
	],
);

export type PanelRow = typeof panels.$inferSelect;

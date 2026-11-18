import { resolveServer } from '../commands/shared.ts';
import type { AccessLevel } from '../db/schema.ts';
import type { ComponentHandler } from '../interactions.ts';
import { serverRef } from '../lib/panels.ts';
import { answerPrivately, updateMessage } from '../lib/replies.ts';
import { BACKUPS_PREFIX, findBackup, renderBackup, renderBackups } from '../views/backups.ts';
import { requireSection } from '../views/sections.ts';

const NEEDED: Record<string, AccessLevel> = {
	list: 'view',
	pick: 'view',
	show: 'view',
	create: 'power',
	download: 'full',
	restore: 'full',
	restoreyes: 'full',
	delete: 'full',
	deleteyes: 'full',
};

export const backupsHandler: ComponentHandler = {
	prefix: BACKUPS_PREFIX,

	async handle(interaction, [action = '', panelId = '', serverId = '', backupId = '']) {
		const needed = NEEDED[action];
		if (!needed || interaction.isModalSubmit()) return;
		const ctx = await resolveServer(interaction, serverRef(panelId, serverId), needed);
		requireSection(ctx, 'backups', needed);

		switch (action) {
			case 'list':
				await updateMessage(interaction, () => renderBackups(ctx));
				return;

			case 'pick': {
				if (!interaction.isStringSelectMenu()) return;
				const picked = interaction.values[0] ?? '';
				await updateMessage(interaction, () => renderBackup(ctx, picked));
				return;
			}

			case 'show':
				await updateMessage(interaction, () => renderBackup(ctx, backupId));
				return;

			case 'create':
				await updateMessage(interaction, async () => {
					const backup = await ctx.client.createBackup(serverId);
					return renderBackups(ctx, `⏳ Started **${backup.name}**, requested by <@${interaction.user.id}>. Press Refresh to follow it.`);
				});
				return;

			case 'download':
				await answerPrivately(interaction, async () => {
					const url = await ctx.client.getBackupDownloadUrl(serverId, backupId);
					return `[Download the backup](${url})\nThe link only works for a short time. Do not share it.`;
				});
				return;

			case 'restore':
			case 'delete':
				await updateMessage(interaction, () => renderBackup(ctx, backupId, action));
				return;

			case 'restoreyes':
				await updateMessage(interaction, async () => {
					const backup = await findBackup(ctx, backupId);
					await ctx.client.restoreBackup(serverId, backup.id);
					return renderBackups(ctx, `♻️ Restoring **${backup.name}**, requested by <@${interaction.user.id}>.`);
				});
				return;

			case 'deleteyes':
				await updateMessage(interaction, async () => {
					const backup = await findBackup(ctx, backupId);
					await ctx.client.deleteBackup(serverId, backup.id);
					return renderBackups(ctx, `🗑️ Deleted **${backup.name}**.`);
				});
				return;
		}
	},
};

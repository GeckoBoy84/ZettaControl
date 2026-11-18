import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type InteractionEditReplyOptions } from 'discord.js';
import type { Backup } from '@zettako/panels';
import { customId } from '../interactions.ts';
import { atLeast } from '../lib/access.ts';
import { discordTime, formatBytes, truncate } from '../lib/format.ts';
import { UserFacingError } from '../lib/replies.ts';
import { backButton, sectionEmbed, type ServerContext } from './sections.ts';

export const BACKUPS_PREFIX = 'bk';

function newestFirst(backups: Backup[]): Backup[] {
	return backups.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function status(backup: Backup): string {
	if (!backup.completedAt) return '⏳ In progress';
	if (!backup.successful) return '❌ Failed';
	return backup.locked ? '🔒 Locked' : '✅ Done';
}

export async function renderBackups(ctx: ServerContext, notice?: string): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId, level } = ctx;
	const [server, backups] = await Promise.all([client.getServer(serverId), client.listBackups(serverId).then(newestFirst)]);

	const lines = backups.slice(0, 15).map((backup) => `**${backup.name}** · ${formatBytes(backup.bytes)} · ${discordTime(backup.createdAt)} · ${status(backup)}`);
	if (backups.length > 15) lines.push(`…and ${backups.length - 15} older`);
	const view = sectionEmbed('backups', panel, server).setDescription(
		[notice, lines.length ? lines.join('\n') : 'No backups yet.'].filter(Boolean).join('\n\n'),
	);

	const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
	if (backups.length > 0) {
		components.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(customId(BACKUPS_PREFIX, 'pick', panel.id, serverId))
					.setPlaceholder('Pick a backup')
					.addOptions(
						backups.slice(0, 25).map((backup) => ({
							label: truncate(backup.name, 100),
							description: `${formatBytes(backup.bytes)} · ${status(backup)}`,
							value: backup.id,
						})),
					),
			),
		);
	}

	const buttons = new ActionRowBuilder<ButtonBuilder>();
	if (atLeast(level, 'power')) {
		buttons.addComponents(
			new ButtonBuilder()
				.setCustomId(customId(BACKUPS_PREFIX, 'create', panel.id, serverId))
				.setLabel('Create backup')
				.setStyle(ButtonStyle.Success)
				.setDisabled(server.suspended || server.status !== null),
		);
	}
	buttons.addComponents(
		new ButtonBuilder().setCustomId(customId(BACKUPS_PREFIX, 'list', panel.id, serverId)).setLabel('Refresh').setStyle(ButtonStyle.Secondary),
		backButton(panel, serverId),
	);
	components.push(buttons);

	return { embeds: [view], components };
}

export async function findBackup(ctx: ServerContext, backupId: string): Promise<Backup> {
	const backup = (await ctx.client.listBackups(ctx.serverId)).find((row) => row.id === backupId);
	if (!backup) throw new UserFacingError('That backup no longer exists.');
	return backup;
}

export type BackupConfirm = 'restore' | 'delete';

const CONFIRM_TEXT: Record<BackupConfirm, string> = {
	restore: 'Restoring puts the files from this backup back on the server and overwrites files with the same name. The server is stopped while it restores.',
	delete: 'Deleting a backup cannot be undone.',
};

export async function renderBackup(ctx: ServerContext, backupId: string, confirm?: BackupConfirm): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId, level } = ctx;
	const [server, backup] = await Promise.all([client.getServer(serverId), findBackup(ctx, backupId)]);
	const ids = [panel.id, serverId, backup.id] as const;

	const view = sectionEmbed('backups', panel, server).setDescription(
		[
			`**${backup.name}**`,
			status(backup),
			`Size: ${formatBytes(backup.bytes)}`,
			`Created: ${discordTime(backup.createdAt, 'f')}`,
			backup.completedAt ? `Finished: ${discordTime(backup.completedAt, 'f')}` : null,
			confirm ? `\n⚠️ ${CONFIRM_TEXT[confirm]}` : null,
		]
			.filter(Boolean)
			.join('\n'),
	);

	const row = new ActionRowBuilder<ButtonBuilder>();
	if (confirm) {
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(customId(BACKUPS_PREFIX, `${confirm}yes`, ...ids))
				.setLabel(confirm === 'restore' ? 'Restore backup' : 'Delete backup')
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId(customId(BACKUPS_PREFIX, 'show', ...ids)).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
		);
	} else {
		const done = backup.completedAt !== null && backup.successful;
		if (atLeast(level, 'full')) {
			row.addComponents(
				new ButtonBuilder().setCustomId(customId(BACKUPS_PREFIX, 'download', ...ids)).setLabel('Download').setStyle(ButtonStyle.Primary).setDisabled(!done),
				new ButtonBuilder().setCustomId(customId(BACKUPS_PREFIX, 'restore', ...ids)).setLabel('Restore').setStyle(ButtonStyle.Danger).setDisabled(!done),
				new ButtonBuilder()
					.setCustomId(customId(BACKUPS_PREFIX, 'delete', ...ids))
					.setLabel('Delete')
					.setStyle(ButtonStyle.Danger)
					.setDisabled(backup.locked || backup.completedAt === null),
			);
		}
		row.addComponents(new ButtonBuilder().setCustomId(customId(BACKUPS_PREFIX, 'list', panel.id, serverId)).setLabel('All backups').setStyle(ButtonStyle.Secondary));
	}

	return { embeds: [view], components: [row] };
}

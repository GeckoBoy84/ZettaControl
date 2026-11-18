import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type InteractionEditReplyOptions } from 'discord.js';
import { customId } from '../interactions.ts';
import { truncate } from '../lib/format.ts';
import { UserFacingError } from '../lib/replies.ts';
import { backButton, sectionEmbed, type ServerContext } from './sections.ts';

export const DATABASES_PREFIX = 'db';

export async function renderDatabases(ctx: ServerContext): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId } = ctx;
	const [server, databases] = await Promise.all([client.getServer(serverId), client.listDatabases(serverId)]);

	const lines = databases.map((database) => `**${database.name}** · \`${database.username}\` @ \`${database.host}:${database.port}\``);
	const view = sectionEmbed('databases', panel, server).setDescription(
		truncate(lines.length ? `${lines.join('\n')}\n\nPick one for its password.` : 'No databases on this server.', 4_096),
	);

	const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
	if (databases.length > 0) {
		components.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(customId(DATABASES_PREFIX, 'pick', panel.id, serverId))
					.setPlaceholder('Pick a database')
					.addOptions(databases.slice(0, 25).map((database) => ({ label: truncate(database.name, 100), description: truncate(database.username, 100), value: database.id }))),
			),
		);
	}
	components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(backButton(panel, serverId)));
	return { embeds: [view], components };
}

export async function renderDatabase(ctx: ServerContext, databaseId: string, confirmRotate = false): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId } = ctx;
	const [server, databases] = await Promise.all([client.getServer(serverId), client.listDatabases(serverId)]);
	const database = databases.find((row) => row.id === databaseId);
	if (!database) throw new UserFacingError('That database no longer exists.');
	const ids = [panel.id, serverId, database.id] as const;

	const view = sectionEmbed('databases', panel, server).setDescription(
		[
			`**${database.name}**`,
			`Host: \`${database.host}\``,
			`Port: \`${database.port}\``,
			`Username: \`${database.username}\``,
			confirmRotate ? '\n⚠️ A new password stops anything using the old one from connecting until you update it.' : null,
		]
			.filter(Boolean)
			.join('\n'),
	);

	const row = new ActionRowBuilder<ButtonBuilder>();
	if (confirmRotate) {
		row.addComponents(
			new ButtonBuilder().setCustomId(customId(DATABASES_PREFIX, 'rotateyes', ...ids)).setLabel('Rotate password').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId(customId(DATABASES_PREFIX, 'show', ...ids)).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
		);
	} else {
		row.addComponents(
			new ButtonBuilder().setCustomId(customId(DATABASES_PREFIX, 'reveal', ...ids)).setLabel('Show password').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId(customId(DATABASES_PREFIX, 'rotate', ...ids)).setLabel('Rotate password').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId(customId(DATABASES_PREFIX, 'list', panel.id, serverId)).setLabel('All databases').setStyle(ButtonStyle.Secondary),
		);
	}
	return { embeds: [view], components: [row] };
}

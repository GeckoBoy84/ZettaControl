import { inlineCode, MessageFlags } from 'discord.js';
import { resolveServer } from '../commands/shared.ts';
import type { ComponentHandler } from '../interactions.ts';
import { serverRef } from '../lib/panels.ts';
import { answerPrivately, embed, updateMessage } from '../lib/replies.ts';
import { DATABASES_PREFIX, renderDatabase, renderDatabases } from '../views/databases.ts';
import { requireSection } from '../views/sections.ts';

// Passwords only ever go out as a separate ephemeral reply, never into the shared view.
function passwordText(password: string | null): string {
	return password ? `Password: ||${inlineCode(password)}||\nOnly you can see this message.` : 'The panel did not return a password.';
}

export const databasesHandler: ComponentHandler = {
	prefix: DATABASES_PREFIX,

	async handle(interaction, [action = '', panelId = '', serverId = '', databaseId = '']) {
		const ctx = await resolveServer(interaction, serverRef(panelId, serverId), 'full');
		requireSection(ctx, 'databases');

		switch (action) {
			case 'list':
				await updateMessage(interaction, () => renderDatabases(ctx));
				return;

			case 'pick': {
				if (!interaction.isStringSelectMenu()) return;
				const picked = interaction.values[0] ?? '';
				await updateMessage(interaction, () => renderDatabase(ctx, picked));
				return;
			}

			case 'show':
				await updateMessage(interaction, () => renderDatabase(ctx, databaseId));
				return;

			case 'reveal':
				await answerPrivately(interaction, async () => passwordText(await ctx.client.getDatabasePassword(serverId, databaseId)));
				return;

			case 'rotate':
				await updateMessage(interaction, () => renderDatabase(ctx, databaseId, true));
				return;

			case 'rotateyes': {
				let password: string | null = null;
				await updateMessage(interaction, async () => {
					password = await ctx.client.rotateDatabasePassword(serverId, databaseId);
					return renderDatabase(ctx, databaseId);
				});
				await interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [embed().setDescription(`🔑 New password set.\n${passwordText(password)}`)] });
				return;
			}
		}
	},
};

import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { resolveServer } from '../commands/shared.ts';
import { customId, type ComponentHandler } from '../interactions.ts';
import { truncate } from '../lib/format.ts';
import { serverRef } from '../lib/panels.ts';
import { answerPrivately, updateMessage, UserFacingError } from '../lib/replies.ts';
import { childPath, FILES_PREFIX, loadFile, MAX_EDIT_CHARS, parentPath, pathFromMessage, renderDirectory, renderFile } from '../views/files.ts';
import { requireSection } from '../views/sections.ts';

// Files are Full access only: they hold configs, secrets and everything else on the server.

export const filesHandler: ComponentHandler = {
	prefix: FILES_PREFIX,

	async handle(interaction, [action = '', panelId = '', serverId = '', extra = '']) {
		const ctx = await resolveServer(interaction, serverRef(panelId, serverId), 'full');
		requireSection(ctx, 'files');
		const path = () => pathFromMessage(interaction.message);

		switch (action) {
			case 'open': {
				if (!interaction.isStringSelectMenu()) return;
				const [kind, ...rest] = (interaction.values[0] ?? '').split(':');
				const target = childPath(path(), rest.join(':'));
				await updateMessage(interaction, () => (kind === 'd' ? renderDirectory(ctx, target) : renderFile(ctx, target)));
				return;
			}

			case 'up':
				await updateMessage(interaction, () => renderDirectory(ctx, parentPath(path())));
				return;

			case 'page':
				await updateMessage(interaction, () => renderDirectory(ctx, path(), Number(extra) || 0));
				return;

			case 'download': {
				const file = path();
				await answerPrivately(interaction, async () => {
					const url = await ctx.client.getFileDownloadUrl(serverId, file);
					return `[Download ${truncate(file, 200)}](${url})\nThe link only works for a short time. Do not share it.`;
				});
				return;
			}

			case 'edit': {
				if (!interaction.isButton()) return;
				const file = path();
				const { content } = await loadFile(ctx, file);
				if (content === null || content.length > MAX_EDIT_CHARS) throw new UserFacingError('This file is too large to edit in Discord. Use the panel instead.');
				const input = new TextInputBuilder().setCustomId('content').setStyle(TextInputStyle.Paragraph).setMaxLength(MAX_EDIT_CHARS).setRequired(false);
				if (content.length > 0) input.setValue(content);
				// The modal is opened from the file view, so the save handler reads the path from that message.
				await interaction.showModal(
					new ModalBuilder()
						.setCustomId(customId(FILES_PREFIX, 'save', panelId, serverId))
						.setTitle(truncate(`Edit ${file.split('/').pop() ?? file}`, 45))
						.addLabelComponents(new LabelBuilder().setLabel('Content').setTextInputComponent(input)),
				);
				return;
			}

			case 'save': {
				if (!interaction.isModalSubmit()) return;
				const file = path();
				const content = interaction.fields.getTextInputValue('content');
				await updateMessage(interaction, async () => {
					await ctx.client.writeFile(serverId, file, content);
					return renderFile(ctx, file, `✅ Saved by <@${interaction.user.id}>.`);
				});
				return;
			}
		}
	},
};

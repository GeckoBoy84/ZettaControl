import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { resolveServer } from '../commands/shared.ts';
import { customId, type ComponentHandler } from '../interactions.ts';
import { truncate } from '../lib/format.ts';
import { serverRef } from '../lib/panels.ts';
import { updateMessage, UserFacingError } from '../lib/replies.ts';
import { requireSection } from '../views/sections.ts';
import { renderStartup, STARTUP_PREFIX } from '../views/startup.ts';

export const startupHandler: ComponentHandler = {
	prefix: STARTUP_PREFIX,

	async handle(interaction, [action = '', panelId = '', serverId = '', key = '']) {
		const ctx = await resolveServer(interaction, serverRef(panelId, serverId), 'full');
		requireSection(ctx, 'startup');

		switch (action) {
			case 'edit': {
				if (!interaction.isStringSelectMenu()) return;
				const picked = interaction.values[0] ?? '';
				const variable = (await ctx.client.listStartupVariables(serverId)).find((row) => row.key === picked);
				if (!variable?.editable) throw new UserFacingError('That variable cannot be changed.');

				const input = new TextInputBuilder().setCustomId('value').setStyle(TextInputStyle.Paragraph).setMaxLength(4_000).setRequired(false);
				if (!variable.secret && variable.value) input.setValue(variable.value);
				const label = new LabelBuilder().setLabel(truncate(variable.name, 45)).setTextInputComponent(input);
				if (variable.description) label.setDescription(truncate(variable.description, 100));

				await interaction.showModal(
					new ModalBuilder()
						.setCustomId(customId(STARTUP_PREFIX, 'save', panelId, serverId, variable.key))
						.setTitle(truncate(`Change ${variable.key}`, 45))
						.addLabelComponents(label),
				);
				return;
			}

			case 'save': {
				if (!interaction.isModalSubmit()) return;
				const value = interaction.fields.getTextInputValue('value');
				await updateMessage(interaction, async () => {
					await ctx.client.setStartupVariable(serverId, key, value);
					return renderStartup(ctx, `✅ \`${key}\` updated by <@${interaction.user.id}>. Restart the server to use it.`);
				});
				return;
			}
		}
	},
};

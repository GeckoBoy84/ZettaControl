import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	LabelBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js';
import type { PowerAction } from '@zettako/panels';
import { resolveServer } from '../commands/shared.ts';
import type { AccessLevel } from '../db/schema.ts';
import { customId, type ComponentHandler } from '../interactions.ts';
import { embed } from '../lib/replies.ts';
import { serverRef } from '../lib/panels.ts';
import { renderServerView, SERVER_PREFIX } from '../views/server.ts';

const POWER_ACTIONS: readonly PowerAction[] = ['start', 'stop', 'restart', 'kill'];
// Give the panel a moment to move the server out of its old state before re-rendering.
const SETTLE_MS = 1_500;

export const serverViewHandler: ComponentHandler = {
	prefix: SERVER_PREFIX,

	async handle(interaction, [action, panelId = '', serverId = '', extra]) {
		const needed: AccessLevel = action === 'refresh' ? 'view' : action === 'cmd' || action === 'cmdsubmit' ? 'full' : 'power';
		const { panel, client, level } = await resolveServer(interaction, serverRef(panelId, serverId), needed);

		const rerender = async (notice?: string) => {
			const [server, resources] = await Promise.all([client.getServer(serverId), client.getResources(serverId).catch(() => null)]);
			return renderServerView({ panel, server, resources, level, notice });
		};

		switch (action) {
			case 'refresh': {
				if (!interaction.isButton()) return;
				await interaction.deferUpdate();
				await interaction.editReply(await rerender());
				return;
			}

			case 'power': {
				if (!interaction.isButton() || !POWER_ACTIONS.includes(extra as PowerAction)) return;
				await interaction.deferUpdate();
				await client.power(serverId, extra as PowerAction);
				await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
				await interaction.editReply(await rerender(`✅ ${extra} signal sent by <@${interaction.user.id}>.`));
				return;
			}

			case 'kill': {
				// Killing can corrupt worlds and data, so ask first in a separate message.
				if (!interaction.isButton()) return;
				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					embeds: [embed().setDescription('Kill stops the server immediately without saving. Only use it if a normal stop is stuck.')],
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setCustomId(customId(SERVER_PREFIX, 'killconfirm', panelId, serverId))
								.setLabel('Kill server')
								.setStyle(ButtonStyle.Danger),
						),
					],
				});
				return;
			}

			case 'killconfirm': {
				if (!interaction.isButton()) return;
				await interaction.deferUpdate();
				await client.power(serverId, 'kill');
				await interaction.editReply({ embeds: [embed().setDescription('Kill signal sent. Press Refresh on the server view to see the new state.')], components: [] });
				return;
			}

			case 'cmd': {
				if (!interaction.isButton()) return;
				await interaction.showModal(
					new ModalBuilder()
						.setCustomId(customId(SERVER_PREFIX, 'cmdsubmit', panelId, serverId))
						.setTitle('Send console command')
						.addLabelComponents(
							new LabelBuilder()
								.setLabel('Command')
								.setTextInputComponent(
									new TextInputBuilder().setCustomId('command').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true),
								),
						),
				);
				return;
			}

			case 'cmdsubmit': {
				if (!interaction.isModalSubmit()) return;
				const command = interaction.fields.getTextInputValue('command');
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });
				await client.sendCommand(serverId, command);
				await interaction.editReply({ embeds: [embed().setDescription(`Sent:\n\`\`\`\n${command}\n\`\`\``)] });
				return;
			}
		}
	},
};

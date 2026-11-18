import { MessageFlags } from 'discord.js';
import type { PowerAction } from '@zettako/panels';
import type { Command } from '../interactions.ts';
import { embed } from '../lib/replies.ts';
import { renderServerView } from '../views/server.ts';
import { resolveServer, serverAutocomplete, slashCommand } from './shared.ts';

const POWER_LABELS: Record<PowerAction, string> = {
	start: 'Start',
	stop: 'Stop',
	restart: 'Restart',
	kill: 'Kill',
};

export const serverCommand: Command = {
	data: slashCommand('server', 'Control your game servers')
		.addSubcommand((sub) =>
			sub
				.setName('view')
				.setDescription('Live stats and controls for a server')
				.addStringOption((option) => option.setName('server').setDescription('Server').setRequired(true).setAutocomplete(true)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('power')
				.setDescription('Start, stop, restart or kill a server')
				.addStringOption((option) => option.setName('server').setDescription('Server').setRequired(true).setAutocomplete(true))
				.addStringOption((option) =>
					option
						.setName('action')
						.setDescription('What to do')
						.setRequired(true)
						.addChoices(
							{ name: 'Start', value: 'start' },
							{ name: 'Restart', value: 'restart' },
							{ name: 'Stop', value: 'stop' },
							{ name: 'Kill (force stop)', value: 'kill' },
						),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('command')
				.setDescription('Send a console command to a server')
				.addStringOption((option) => option.setName('server').setDescription('Server').setRequired(true).setAutocomplete(true))
				.addStringOption((option) => option.setName('command').setDescription('Console command').setRequired(true).setMaxLength(500)),
		),

	async autocomplete(interaction) {
		await serverAutocomplete(interaction);
	},

	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const sub = interaction.options.getSubcommand();
		const needed = sub === 'power' ? 'power' : sub === 'command' ? 'full' : 'view';
		const { panel, client, serverId, level } = await resolveServer(interaction, interaction.options.getString('server', true), needed);

		switch (sub) {
			case 'view': {
				const [server, resources] = await Promise.all([client.getServer(serverId), client.getResources(serverId).catch(() => null)]);
				await interaction.editReply(renderServerView({ panel, server, resources, level }));
				return;
			}
			case 'power': {
				const action = interaction.options.getString('action', true) as PowerAction;
				const server = await client.getServer(serverId);
				await client.power(serverId, action);
				await interaction.editReply({ embeds: [embed().setDescription(`${POWER_LABELS[action]} signal sent to **${server.name}**.`)] });
				return;
			}
			case 'command': {
				const command = interaction.options.getString('command', true);
				const server = await client.getServer(serverId);
				await client.sendCommand(serverId, command);
				await interaction.editReply({ embeds: [embed().setDescription(`Sent to **${server.name}**:\n\`\`\`\n${command}\n\`\`\``)] });
				return;
			}
		}
	},
};

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { brand, zettako } from '../brand.ts';
import type { Command } from '../interactions.ts';
import { embed } from '../lib/replies.ts';
import { panelCommand } from './panel.ts';
import { serverCommand } from './server.ts';
import { slashCommand } from './shared.ts';

/** Lists every subcommand of the given commands straight from their definitions. */
function describe(commands: Command[]): string {
	return commands
		.flatMap((command) => {
			const json = command.data.toJSON();
			const subs = (json.options ?? []).filter((option) => option.type === 1);
			return subs.length > 0
				? subs.map((sub) => `\`/${json.name} ${sub.name}\` ${sub.description}`)
				: [`\`/${json.name}\` ${json.description}`];
		})
		.join('\n');
}

export const helpCommand: Command = {
	data: slashCommand('help', `How to use ${brand.name}`),

	async execute(interaction) {
		await interaction.reply({
			flags: MessageFlags.Ephemeral,
			embeds: [
				embed()
					.setTitle(`${brand.name} help`)
					.setDescription(
						[
							'**Getting started**',
							`1. \`/panel add\` and pick ${zettako.name} or paste your own panel URL.`,
							'2. `/server view` and start typing a server name.',
							'',
							'Works with Calagopus, Pterodactyl 1.x and 2.x, and Pelican. Link a panel for just yourself (works in DMs) or for a whole Discord server.',
							'',
							'**Commands**',
							describe([serverCommand, panelCommand]),
						].join('\n'),
					),
			],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder().setURL(brand.website).setLabel('Docs').setStyle(ButtonStyle.Link),
					new ButtonBuilder().setURL(brand.support).setLabel('Support').setStyle(ButtonStyle.Link),
				),
			],
		});
	},
};

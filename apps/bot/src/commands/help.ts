import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { brand, zettako } from '../brand.ts';
import { accessCommand } from './access.ts';
import { adminCommand } from './admin.ts';
import { alertsCommand } from './alerts.ts';
import { consoleCommand } from './console.ts';
import type { Command } from '../interactions.ts';
import { embed } from '../lib/replies.ts';
import { panelCommand } from './panel.ts';
import { serverCommand } from './server.ts';
import { slashCommand } from './shared.ts';
import { statsCommand } from './stats.ts';
import { statusCommand } from './status.ts';

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
							'New here? `/tutorial` walks you through everything in about a minute.',
							'',
							'**Getting started**',
							`1. \`/panel add\` and pick ${zettako.name} or paste your own panel URL.`,
							'2. `/server view` and start typing a server name.',
							'',
							'Works with Calagopus, Pterodactyl 1.x and 2.x, and Pelican. Link a panel for just yourself (works in DMs) or for a whole Discord server.',
							'`/server view` has a **More** menu for backups, files, schedules, databases and the rest.',
							'',
							'**Commands**',
							describe([serverCommand, panelCommand, accessCommand]),
							'',
							'**Live in your channels** (needs the bot added to the server)',
							describe([consoleCommand, statusCommand, alertsCommand, statsCommand]),
							'',
							'**Panel admins** (needs an admin key, set with `/admin key`)',
							describe([adminCommand]),
							'',
							'Found a bug or have an idea? `/feedback`',
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

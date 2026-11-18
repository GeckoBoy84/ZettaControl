import { MessageFlags } from 'discord.js';
import { brand } from '../brand.ts';
import type { Command } from '../interactions.ts';
import { renderTutorialStep } from '../views/tutorial.ts';
import { slashCommand } from './shared.ts';

export const tutorialCommand: Command = {
	data: slashCommand('tutorial', `A quick interactive tour of ${brand.name}`),

	async execute(interaction) {
		await interaction.reply({ flags: MessageFlags.Ephemeral, ...renderTutorialStep(0) });
	},
};

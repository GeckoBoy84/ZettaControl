import { brand } from '../brand.ts';
import { openFeedback } from '../components/feedback.ts';
import type { Command } from '../interactions.ts';
import { slashCommand } from './shared.ts';

export const feedbackCommand: Command = {
	data: slashCommand('feedback', `Report a bug or suggest something for ${brand.name}`),

	async execute(interaction) {
		await openFeedback(interaction);
	},
};

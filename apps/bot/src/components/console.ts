import { closeConsoleFrom, CONSOLE_PREFIX } from '../commands/console.ts';
import type { ComponentHandler } from '../interactions.ts';
import { embed } from '../lib/replies.ts';

export const consoleHandler: ComponentHandler = {
	prefix: CONSOLE_PREFIX,

	async handle(interaction, [action, threadId = '']) {
		if (action !== 'close' || !interaction.isButton()) return;
		await closeConsoleFrom(interaction, threadId);
		await interaction.update({ components: [] });
		await interaction.followUp({ embeds: [embed().setDescription(`Console closed by <@${interaction.user.id}>.`)], allowedMentions: { parse: [] } });
		if (interaction.channel?.isThread()) await interaction.channel.setArchived(true).catch(() => undefined);
	},
};

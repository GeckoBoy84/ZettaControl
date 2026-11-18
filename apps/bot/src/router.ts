import type { Interaction } from 'discord.js';
import { aboutCommand } from './commands/about.ts';
import { accessCommand } from './commands/access.ts';
import { helpCommand } from './commands/help.ts';
import { panelCommand } from './commands/panel.ts';
import { serverCommand } from './commands/server.ts';
import { panelLinkHandler } from './components/panel-link.ts';
import { serverViewHandler } from './components/server-view.ts';
import { emit } from './hooks.ts';
import type { Command, ComponentHandler } from './interactions.ts';
import { describeError, replyError } from './lib/replies.ts';
import { logger } from './logger.ts';

export const commands: Command[] = [serverCommand, panelCommand, accessCommand, helpCommand, aboutCommand];
const componentHandlers: ComponentHandler[] = [panelLinkHandler, serverViewHandler];

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));
const handlersByPrefix = new Map(componentHandlers.map((handler) => [handler.prefix, handler]));

export async function routeInteraction(interaction: Interaction): Promise<void> {
	const started = performance.now();
	const label = interactionLabel(interaction);
	let ok = true;

	try {
		if (interaction.isAutocomplete()) {
			await commandsByName.get(interaction.commandName)?.autocomplete?.(interaction);
			return;
		}
		if (interaction.isChatInputCommand()) {
			const command = commandsByName.get(interaction.commandName);
			if (!command) return;
			await command.execute(interaction);
			return;
		}
		if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
			const [prefix = '', ...args] = interaction.customId.split(':');
			await handlersByPrefix.get(prefix)?.handle(interaction, args);
		}
	} catch (error) {
		ok = false;
		logger.error({ err: error, interaction: label, user: interaction.user.id, guild: interaction.guildId }, 'Interaction failed');
		emit('onError', error, { interaction: label, userId: interaction.user.id, guildId: interaction.guildId });
		if (interaction.isRepliable()) {
			await replyError(interaction, describeError(error)).catch(() => undefined);
		}
	} finally {
		if (interaction.isChatInputCommand()) {
			emit('onCommand', {
				command: label,
				userId: interaction.user.id,
				guildId: interaction.guildId,
				durationMs: Math.round(performance.now() - started),
				ok,
			});
		}
	}
}

function interactionLabel(interaction: Interaction): string {
	if (interaction.isChatInputCommand()) {
		const sub = interaction.options.getSubcommand(false);
		return sub ? `/${interaction.commandName} ${sub}` : `/${interaction.commandName}`;
	}
	if (interaction.isAutocomplete()) return `autocomplete /${interaction.commandName}`;
	if (interaction.isMessageComponent() || interaction.isModalSubmit()) return interaction.customId.split(':').slice(0, 2).join(':');
	return interaction.type.toString();
}

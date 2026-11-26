import type { Interaction } from 'discord.js';
import { aboutCommand } from './commands/about.ts';
import { adminCommand } from './commands/admin.ts';
import { accessCommand } from './commands/access.ts';
import { alertsCommand } from './commands/alerts.ts';
import { consoleCommand } from './commands/console.ts';
import { feedbackCommand } from './commands/feedback.ts';
import { helpCommand } from './commands/help.ts';
import { panelCommand } from './commands/panel.ts';
import { serverCommand } from './commands/server.ts';
import { statsCommand } from './commands/stats.ts';
import { statusCommand } from './commands/status.ts';
import { tutorialCommand } from './commands/tutorial.ts';
import { adminHandler } from './components/admin.ts';
import { backupsHandler } from './components/backups.ts';
import { consoleHandler } from './components/console.ts';
import { databasesHandler } from './components/databases.ts';
import { feedbackHandler } from './components/feedback.ts';
import { filesHandler } from './components/files.ts';
import { panelLinkHandler } from './components/panel-link.ts';
import { schedulesHandler } from './components/schedules.ts';
import { serverViewHandler } from './components/server-view.ts';
import { startupHandler } from './components/startup.ts';
import { tutorialHandler } from './components/tutorial.ts';
import { emit, getHook } from './hooks.ts';
import { unpackArg, type Command, type ComponentHandler } from './interactions.ts';
import { describeError, replyError } from './lib/replies.ts';
import { logger } from './logger.ts';

export const commands: Command[] = [
	serverCommand,
	panelCommand,
	accessCommand,
	consoleCommand,
	statusCommand,
	alertsCommand,
	statsCommand,
	adminCommand,
	helpCommand,
	tutorialCommand,
	feedbackCommand,
	aboutCommand,
];
const componentHandlers: ComponentHandler[] = [
	panelLinkHandler,
	serverViewHandler,
	backupsHandler,
	filesHandler,
	schedulesHandler,
	databasesHandler,
	startupHandler,
	consoleHandler,
	tutorialHandler,
	feedbackHandler,
	adminHandler,
];

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));
const handlersByPrefix = new Map(componentHandlers.map((handler) => [handler.prefix, handler]));

/** The bot's own handlers first, then any from private hooks (loaded after this module). */
function componentHandler(prefix: string): ComponentHandler | undefined {
	return handlersByPrefix.get(prefix) ?? getHook('components')?.().find((handler) => handler.prefix === prefix);
}

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
			// Discord clients cache command lists, so people can still run commands from v1 for a while.
			const command = commandsByName.get(interaction.commandName);
			if (!command) {
				await replyError(interaction, 'That command no longer exists. Use `/help` to see the current commands.');
				return;
			}
			await command.execute(interaction);
			return;
		}
		if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
			const [prefix = '', ...args] = interaction.customId.split(':');
			await componentHandler(prefix)?.handle(interaction, args.map(unpackArg));
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

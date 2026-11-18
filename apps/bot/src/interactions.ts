import type {
	AutocompleteInteraction,
	ButtonInteraction,
	ChatInputCommandInteraction,
	ModalSubmitInteraction,
	RESTPostAPIChatInputApplicationCommandsJSONBody,
	StringSelectMenuInteraction,
} from 'discord.js';

export interface Command {
	data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
	execute(interaction: ChatInputCommandInteraction): Promise<void>;
	autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

/**
 * Handles buttons, selects and modals whose custom ID starts with `prefix:`.
 * The rest of the ID is split on `:` and passed as `args`, so state lives in the
 * ID and keeps working after a restart.
 */
export interface ComponentHandler {
	prefix: string;
	handle(interaction: ComponentInteraction, args: string[]): Promise<void>;
}

export function customId(prefix: string, ...args: string[]): string {
	const id = [prefix, ...args].join(':');
	if (id.length > 100) throw new Error(`Custom ID too long (${id.length}): ${prefix}`);
	return id;
}

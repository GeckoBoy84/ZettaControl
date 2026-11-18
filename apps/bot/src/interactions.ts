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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PACKED_UUID = /^~[A-Za-z0-9_-]{22}$/;

/**
 * UUIDs are packed to 23 characters (`~` + base64url) so a panel, a server and an item
 * still fit in the 100 character limit. The router unpacks them with unpackArg().
 */
export function packArg(arg: string): string {
	return UUID.test(arg) ? `~${Buffer.from(arg.replaceAll('-', ''), 'hex').toString('base64url')}` : arg;
}

export function unpackArg(arg: string): string {
	if (!PACKED_UUID.test(arg)) return arg;
	const hex = Buffer.from(arg.slice(1), 'base64url').toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function customId(prefix: string, ...args: string[]): string {
	const id = [prefix, ...args.map(packArg)].join(':');
	if (id.length > 100) throw new Error(`Custom ID too long (${id.length}): ${prefix}`);
	return id;
}

/** Whether a custom ID with these args fits, for items with IDs of unknown length. */
export function fitsCustomId(prefix: string, ...args: string[]): boolean {
	return [prefix, ...args.map(packArg)].join(':').length <= 100;
}

import {
	EmbedBuilder,
	MessageFlags,
	type InteractionEditReplyOptions,
	type MessageComponentInteraction,
	type ModalSubmitInteraction,
	type RepliableInteraction,
} from 'discord.js';
import { PanelError, type PanelErrorCode } from '@zettako/panels';
import { brand } from '../brand.ts';

const PANEL_ERROR_TEXT: Record<PanelErrorCode, string> = {
	unauthorized: 'The panel rejected the API key. It may have been deleted or expired. Re-link the panel with `/panel add`.',
	forbidden: 'The API key does not have permission to do that on this server.',
	not_found: 'The panel could not find that. The server may have been deleted or you may have lost access.',
	rate_limited: 'The panel is rate limiting requests. Try again in a minute.',
	conflict: 'The panel refused because the server is busy (installing, transferring or restoring a backup).',
	validation: 'The panel rejected the request.',
	unreachable: 'Could not reach the panel. It may be offline.',
	timeout: 'The panel took too long to respond.',
	server_error: 'The panel had an internal error.',
	unsupported: 'This panel does not support that.',
	unknown: 'Something went wrong talking to the panel.',
};

export function embed(): EmbedBuilder {
	return new EmbedBuilder().setColor(brand.color);
}

export function errorEmbed(message: string): EmbedBuilder {
	return new EmbedBuilder().setColor(brand.errorColor).setDescription(message);
}

/** Thrown for expected problems. The message is shown to the user as is. */
export class UserFacingError extends Error {}

/** Turns any error into text that is safe to show the user. */
export function describeError(error: unknown): string {
	if (error instanceof UserFacingError) return error.message;
	if (error instanceof PanelError) {
		const detail = error.details[0];
		const base = PANEL_ERROR_TEXT[error.code];
		return detail && detail !== base ? `${base}\n> ${detail}` : base;
	}
	return 'Something went wrong. If it keeps happening, let us know in the support server.';
}

/** describeError for admin API calls, whose key is set with /admin key rather than /panel add. */
export function describeAdminError(error: unknown): string {
	if (error instanceof PanelError && (error.code === 'unauthorized' || error.code === 'forbidden')) {
		return 'The panel rejected the admin key, or the key is not allowed to do that. Set a new one with `/admin key`.';
	}
	return describeError(error);
}

/** Replies or edits depending on the interaction's state. Always ephemeral. */
export async function replyError(interaction: RepliableInteraction, message: string): Promise<void> {
	const payload = { embeds: [errorEmbed(message)], components: [] };
	if (interaction.deferred || interaction.replied) {
		await interaction.editReply(payload);
	} else {
		await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
	}
}

/**
 * Acknowledges a button, select or modal (opened from a message) and replaces that
 * message with what `build` returns. Building happens after the acknowledgement, so
 * slow panels do not hit Discord's 3 second limit.
 */
export async function updateMessage(
	interaction: MessageComponentInteraction | ModalSubmitInteraction,
	build: () => Promise<InteractionEditReplyOptions>,
): Promise<void> {
	if (interaction.isMessageComponent() || interaction.isFromMessage()) await interaction.deferUpdate();
	else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	await interaction.editReply(await build());
}

/** A separate ephemeral answer, for secrets and links that should not replace the view. */
export async function answerPrivately(interaction: RepliableInteraction, build: () => Promise<string>): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	await interaction.editReply({ embeds: [embed().setDescription(await build())] });
}

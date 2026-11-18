import {
	ApplicationIntegrationType,
	InteractionContextType,
	SlashCommandBuilder,
	type AutocompleteInteraction,
	type Interaction,
} from 'discord.js';
import { PANEL_KIND_LABELS } from '@zettako/panels';
import type { AccessLevel, PanelRow } from '../db/schema.ts';
import {
	ACCESS_LEVEL_LABELS,
	accessiblePanels,
	atLeast,
	levelFor,
	managedPanels,
	panelAccess,
	resolveActor,
	type Actor,
} from '../lib/access.ts';
import { truncate } from '../lib/format.ts';
import { clientFor, listServersCached, parseServerRef, serverRef } from '../lib/panels.ts';
import { UserFacingError } from '../lib/replies.ts';
import { logger } from '../logger.ts';
import type { ServerContext } from '../views/sections.ts';

const AUTOCOMPLETE_BUDGET_MS = 2_500;

/** A slash command usable in guilds and DMs, installable both to a server and to a user account. */
export function slashCommand(name: string, description: string): SlashCommandBuilder {
	return new SlashCommandBuilder()
		.setName(name)
		.setDescription(description)
		.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall);
}

/** A slash command that only makes sense inside a Discord server the bot is in. */
export function guildSlashCommand(name: string, description: string): SlashCommandBuilder {
	return new SlashCommandBuilder()
		.setName(name)
		.setDescription(description)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Servers the user can see on any panel here, filtered by what they typed. */
export async function serverAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
	const query = interaction.options.getFocused().toLowerCase();
	const available = await accessiblePanels(await resolveActor(interaction));

	const results = await Promise.all(
		available.map(async (access) => {
			const servers = await withTimeout(listServersCached(access.panel), AUTOCOMPLETE_BUDGET_MS).catch((error: unknown) => {
				logger.debug({ err: error, panel: access.panel.id }, 'Autocomplete server list failed');
				return null;
			});
			return (servers ?? []).filter((server) => levelFor(access, server.id) !== null).map((server) => ({ panel: access.panel, server }));
		}),
	);

	const showPanel = available.length > 1;
	const choices = results
		.flat()
		.filter(({ server }) => !query || server.name.toLowerCase().includes(query) || server.shortId.toLowerCase().startsWith(query))
		.slice(0, 25)
		.map(({ panel, server }) => ({
			name: truncate(showPanel ? `${server.name} (${panel.name})` : server.name, 100),
			value: serverRef(panel.id, server.id),
		}));

	await interaction.respond(choices);
}

export function panelChoiceName(panel: PanelRow): string {
	const owner = panel.scope === 'guild' ? 'this server' : 'personal';
	return truncate(`${panel.name} - ${PANEL_KIND_LABELS[panel.kind]}, ${owner}`, 100);
}

export async function managedPanelAutocomplete(interaction: AutocompleteInteraction, filter?: (panel: PanelRow) => boolean): Promise<void> {
	const query = interaction.options.getFocused().toLowerCase();
	const rows = (await managedPanels(await resolveActor(interaction))).filter((panel) => (filter ? filter(panel) : true));
	await interaction.respond(
		rows
			.filter((panel) => panel.name.toLowerCase().includes(query))
			.slice(0, 25)
			.map((panel) => ({ name: panelChoiceName(panel), value: panel.id })),
	);
}

/**
 * Resolves a `<panelId>:<serverId>` ref the user picked and checks they have at least
 * `needed` on that server. Access is checked on every interaction, never cached in IDs.
 */
export async function resolveServer(interaction: Interaction, ref: string, needed: AccessLevel, actor?: Actor): Promise<ServerContext> {
	const parsed = parseServerRef(ref);
	if (!parsed) throw new UserFacingError('Pick a server from the list as you type. If none show up, link a panel with `/panel add`.');

	const access = await panelAccess(actor ?? (await resolveActor(interaction)), parsed.panelId);
	const level = access ? levelFor(access, parsed.serverId) : null;
	if (!access || level === null) throw new UserFacingError('You do not have access to that server here.');
	if (!atLeast(level, needed)) {
		throw new UserFacingError(`You need **${ACCESS_LEVEL_LABELS[needed]}** access on this server for that. You have **${ACCESS_LEVEL_LABELS[level]}**.`);
	}
	return { panel: access.panel, client: clientFor(access.panel), serverId: parsed.serverId, level };
}

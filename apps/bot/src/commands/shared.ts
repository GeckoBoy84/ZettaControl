import {
	ApplicationIntegrationType,
	InteractionContextType,
	SlashCommandBuilder,
	type AutocompleteInteraction,
	type Interaction,
} from 'discord.js';
import { PANEL_KIND_LABELS, type ServerSummary } from '@zettako/panels';
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

/**
 * Every server the actor can see on the panels here. Panels that do not answer within
 * the budget are skipped. `multiplePanels` says whether names need the panel added.
 */
export async function accessibleServers(actor: Actor, budgetMs = AUTOCOMPLETE_BUDGET_MS): Promise<{ servers: { panel: PanelRow; server: ServerSummary }[]; multiplePanels: boolean }> {
	const available = await accessiblePanels(actor);
	const results = await Promise.all(
		available.map(async (access) => {
			const servers = await withTimeout(listServersCached(access.panel), budgetMs).catch((error: unknown) => {
				logger.debug({ err: error, panel: access.panel.id }, 'Server list failed');
				return null;
			});
			return (servers ?? []).filter((server) => levelFor(access, server.id) !== null).map((server) => ({ panel: access.panel, server }));
		}),
	);
	return { servers: results.flat(), multiplePanels: available.length > 1 };
}

export function serverChoiceName(panel: PanelRow, server: ServerSummary, showPanel: boolean): string {
	return truncate(showPanel ? `${server.name} (${panel.name})` : server.name, 100);
}

/** Servers the user can see on any panel here, filtered by what they typed. */
export async function serverAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
	const query = interaction.options.getFocused().toLowerCase();
	const { servers, multiplePanels } = await accessibleServers(await resolveActor(interaction));

	const choices = servers
		.filter(({ server }) => !query || server.name.toLowerCase().includes(query) || server.shortId.toLowerCase().startsWith(query))
		.slice(0, 25)
		.map(({ panel, server }) => ({ name: serverChoiceName(panel, server, multiplePanels), value: serverRef(panel.id, server.id) }));

	await interaction.respond(choices);
}

/** Servers on a panel picked in an earlier option, for commands that choose a panel first. */
export async function panelServerAutocomplete(interaction: AutocompleteInteraction, panel: PanelRow | undefined, extra: { name: string; value: string }[] = []): Promise<void> {
	if (!panel) {
		await interaction.respond([]);
		return;
	}
	const query = interaction.options.getFocused().toLowerCase();
	const servers = (await withTimeout(listServersCached(panel), AUTOCOMPLETE_BUDGET_MS).catch(() => null)) ?? [];
	await interaction.respond(
		[...extra, ...servers.map((server) => ({ name: truncate(server.name, 100), value: server.id }))]
			.filter((choice) => !query || choice.name.toLowerCase().includes(query))
			.slice(0, 25),
	);
}

/**
 * Status boards and alerts post for everyone in a channel, so only panel managers set
 * them up, and only for panels they manage (this server's, or their own personal ones).
 */
export async function requireLivePanel(actor: Actor, panelId: string): Promise<PanelRow> {
	if (!actor.isManager) {
		throw new UserFacingError('Only panel managers can set this up: members with Manage Server, or a manager role set with `/access managers`.');
	}
	const panel = (await managedPanels(actor)).find((row) => row.id === panelId);
	if (!panel) throw new UserFacingError('Pick a panel from the list.');
	return panel;
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

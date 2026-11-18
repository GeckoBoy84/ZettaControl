import {
	ApplicationIntegrationType,
	InteractionContextType,
	SlashCommandBuilder,
	type AutocompleteInteraction,
	type Interaction,
} from 'discord.js';
import { and, eq, or } from 'drizzle-orm';
import { PANEL_KIND_LABELS } from '@zettako/panels';
import { db } from '../db/client.ts';
import { panels, type PanelRow } from '../db/schema.ts';
import { truncate } from '../lib/format.ts';
import {
	accessiblePanels,
	canManageGuildPanels,
	clientFor,
	findAccessiblePanel,
	guildContext,
	listServersCached,
	parseServerRef,
	serverRef,
} from '../lib/panels.ts';
import { UserFacingError } from '../lib/replies.ts';
import { logger } from '../logger.ts';

const AUTOCOMPLETE_BUDGET_MS = 2_500;

/** A slash command usable in guilds and DMs, installable both to a server and to a user account. */
export function slashCommand(name: string, description: string): SlashCommandBuilder {
	return new SlashCommandBuilder()
		.setName(name)
		.setDescription(description)
		.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Servers across every panel the user can use here, filtered by what they typed. */
export async function serverAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
	const query = interaction.options.getFocused().toLowerCase();
	const available = await accessiblePanels(interaction);

	const results = await Promise.all(
		available.map(async (panel) => {
			const servers = await withTimeout(listServersCached(panel), AUTOCOMPLETE_BUDGET_MS).catch((error: unknown) => {
				logger.debug({ err: error, panel: panel.id }, 'Autocomplete server list failed');
				return null;
			});
			return (servers ?? []).map((server) => ({ panel, server }));
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

/** Panels the user may edit here: their own, plus the guild's if they have Manage Server. */
export async function managedPanels(interaction: Interaction): Promise<PanelRow[]> {
	const guildId = canManageGuildPanels(interaction) ? guildContext(interaction) : null;
	const own = and(eq(panels.scope, 'user'), eq(panels.ownerId, interaction.user.id));
	return db
		.select()
		.from(panels)
		.where(guildId ? or(own, and(eq(panels.scope, 'guild'), eq(panels.ownerId, guildId))) : own)
		.orderBy(panels.name);
}

export function panelChoiceName(panel: PanelRow): string {
	const owner = panel.scope === 'guild' ? 'this server' : 'personal';
	return truncate(`${panel.name} - ${PANEL_KIND_LABELS[panel.kind]}, ${owner}`, 100);
}

export async function managedPanelAutocomplete(interaction: AutocompleteInteraction, filter?: (panel: PanelRow) => boolean): Promise<void> {
	const query = interaction.options.getFocused().toLowerCase();
	const rows = (await managedPanels(interaction)).filter((panel) => (filter ? filter(panel) : true));
	await interaction.respond(
		rows
			.filter((panel) => panel.name.toLowerCase().includes(query))
			.slice(0, 25)
			.map((panel) => ({ name: panelChoiceName(panel), value: panel.id })),
	);
}

/** Resolves a `<panelId>:<serverId>` ref the user picked, checking access again. */
export async function resolveServer(interaction: Interaction, ref: string) {
	const parsed = parseServerRef(ref);
	if (!parsed) throw new UserFacingError('Pick a server from the list as you type. If none show up, link a panel with `/panel add`.');

	const panel = await findAccessiblePanel(interaction, parsed.panelId);
	if (!panel) throw new UserFacingError('You do not have access to that panel here.');
	return { panel, client: clientFor(panel), serverId: parsed.serverId };
}

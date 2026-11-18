import { MessageFlags, type AutocompleteInteraction } from 'discord.js';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { ACCESS_LEVELS, ALL_SERVERS, roleGrants, type AccessLevel, type PanelRow } from '../db/schema.ts';
import type { Command } from '../interactions.ts';
import {
	ACCESS_LEVEL_DESCRIPTIONS,
	ACCESS_LEVEL_LABELS,
	managedPanels,
	managerRoleIds,
	resolveActor,
	setManagerRoleIds,
	type Actor,
} from '../lib/access.ts';
import { truncate } from '../lib/format.ts';
import { clientFor, listServersCached } from '../lib/panels.ts';
import { embed, UserFacingError } from '../lib/replies.ts';
import { guildSlashCommand, managedPanelAutocomplete, withTimeout } from './shared.ts';

const isGuildPanel = (panel: PanelRow) => panel.scope === 'guild';

async function requireManagedGuildPanel(actor: Actor, panelId: string): Promise<PanelRow> {
	if (!actor.isManager) throw notManager();
	const panel = (await managedPanels(actor)).find((row) => row.id === panelId && isGuildPanel(row));
	if (!panel) throw new UserFacingError('Pick one of this server\'s panels from the list.');
	return panel;
}

function notManager(): UserFacingError {
	return new UserFacingError('Only panel managers can change access: members with Manage Server, or a manager role set with `/access managers`.');
}

function target(grant: { serverId: string; serverName: string | null }): string {
	return grant.serverId === ALL_SERVERS ? 'all servers' : `**${grant.serverName ?? grant.serverId}**`;
}

async function serverAutocomplete(interaction: AutocompleteInteraction, actor: Actor): Promise<void> {
	const panelId = interaction.options.getString('panel');
	const panel = panelId && actor.isManager ? (await managedPanels(actor)).find((row) => row.id === panelId && isGuildPanel(row)) : null;
	if (!panel) {
		await interaction.respond([]);
		return;
	}
	const query = interaction.options.getFocused().toLowerCase();
	const servers = (await withTimeout(listServersCached(panel), 2_500).catch(() => null)) ?? [];
	await interaction.respond(
		servers
			.filter((server) => !query || server.name.toLowerCase().includes(query))
			.slice(0, 25)
			.map((server) => ({ name: truncate(server.name, 100), value: server.id })),
	);
}

export const accessCommand: Command = {
	data: guildSlashCommand('access', 'Who can use this server\'s panels')
		.addSubcommand((sub) =>
			sub
				.setName('grant')
				.setDescription('Give a role access to a panel, or to one game server on it')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true))
				.addRoleOption((option) => option.setName('role').setDescription('Role').setRequired(true))
				.addStringOption((option) =>
					option
						.setName('level')
						.setDescription('What the role can do')
						.setRequired(true)
						.addChoices(...ACCESS_LEVELS.map((level) => ({ name: `${ACCESS_LEVEL_LABELS[level]}: ${ACCESS_LEVEL_DESCRIPTIONS[level]}`, value: level }))),
				)
				.addStringOption((option) =>
					option.setName('server').setDescription('Only this game server (default: every server on the panel)').setAutocomplete(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('revoke')
				.setDescription('Remove a role\'s access to a panel or game server')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true))
				.addRoleOption((option) => option.setName('role').setDescription('Role').setRequired(true))
				.addStringOption((option) =>
					option.setName('server').setDescription('Only this game server (default: the panel wide grant)').setAutocomplete(true),
				),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('Show managers and every role grant'))
		.addSubcommand((sub) =>
			sub
				.setName('managers')
				.setDescription('Add or remove a panel manager role (needs Manage Server)')
				.addRoleOption((option) => option.setName('role').setDescription('Role to add or remove').setRequired(true)),
		),

	async autocomplete(interaction) {
		const actor = await resolveActor(interaction);
		if (interaction.options.getFocused(true).name === 'server') {
			await serverAutocomplete(interaction, actor);
		} else if (actor.isManager) {
			await managedPanelAutocomplete(interaction, isGuildPanel);
		} else {
			await interaction.respond([]);
		}
	},

	async execute(interaction) {
		const actor = await resolveActor(interaction);
		if (!actor.guildId) throw new UserFacingError('Use this in a Discord server the bot has been added to.');

		switch (interaction.options.getSubcommand()) {
			case 'grant': {
				const panel = await requireManagedGuildPanel(actor, interaction.options.getString('panel', true));
				const role = interaction.options.getRole('role', true);
				const level = interaction.options.getString('level', true) as AccessLevel;
				const serverId = interaction.options.getString('server') ?? ALL_SERVERS;

				// Checking the server exists also gives a friendly name for /access list.
				const serverName = serverId === ALL_SERVERS ? null : (await clientFor(panel).getServer(serverId)).name;

				await db
					.insert(roleGrants)
					.values({ panelId: panel.id, roleId: role.id, serverId, serverName, level, createdBy: actor.userId })
					.onConflictDoUpdate({ target: [roleGrants.panelId, roleGrants.roleId, roleGrants.serverId], set: { level, serverName } });

				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					allowedMentions: { parse: [] },
					embeds: [
						embed().setDescription(
							`<@&${role.id}> now has **${ACCESS_LEVEL_LABELS[level]}** access (${ACCESS_LEVEL_DESCRIPTIONS[level]}) to ${target({ serverId, serverName })} on **${panel.name}**.`,
						),
					],
				});
				return;
			}

			case 'revoke': {
				const panel = await requireManagedGuildPanel(actor, interaction.options.getString('panel', true));
				const role = interaction.options.getRole('role', true);
				const serverId = interaction.options.getString('server') ?? ALL_SERVERS;

				const removed = await db
					.delete(roleGrants)
					.where(and(eq(roleGrants.panelId, panel.id), eq(roleGrants.roleId, role.id), eq(roleGrants.serverId, serverId)))
					.returning();
				const grant = removed[0];
				if (!grant) throw new UserFacingError(`<@&${role.id}> has no grant for that on **${panel.name}**. See \`/access list\`.`);

				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					allowedMentions: { parse: [] },
					embeds: [embed().setDescription(`Removed <@&${role.id}>'s access to ${target(grant)} on **${panel.name}**.`)],
				});
				return;
			}

			case 'list': {
				if (!actor.isManager) throw notManager();
				const managers = await managerRoleIds(actor.guildId);
				const guildPanels = (await managedPanels(actor)).filter(isGuildPanel);
				const grants = guildPanels.length
					? await db.select().from(roleGrants).where(inArray(roleGrants.panelId, guildPanels.map((panel) => panel.id)))
					: [];

				const managerLine = ['Members with **Manage Server**', ...managers.map((id) => `<@&${id}>`)].join(', ');
				const panelBlocks = guildPanels.map((panel) => {
					const lines = grants
						.filter((grant) => grant.panelId === panel.id)
						.map((grant) => `<@&${grant.roleId}> ${ACCESS_LEVEL_LABELS[grant.level]} on ${target(grant)}`);
					return `**${panel.name}**\n${lines.length ? lines.join('\n') : 'Managers only'}`;
				});
				if (panelBlocks.length === 0) panelBlocks.push('No server panels yet. Link one with `/panel add for:This Discord server`.');

				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					allowedMentions: { parse: [] },
					embeds: [
						embed()
							.setTitle('Panel access')
							.setDescription(
								truncate([`**Managers** (full access to every panel, can link panels and change access)\n${managerLine}`, ...panelBlocks].join('\n\n'), 4096),
							),
					],
				});
				return;
			}

			case 'managers': {
				// Only real Manage Server holders can change who is a manager, so a manager role cannot hand itself out.
				if (!actor.hasManageServer) throw new UserFacingError('You need the Manage Server permission to change manager roles.');
				const role = interaction.options.getRole('role', true);
				if (role.id === actor.guildId) throw new UserFacingError('@everyone cannot be a manager role. Use `/access grant` to give everyone a lower level.');

				const current = await managerRoleIds(actor.guildId);
				const isManagerRole = current.includes(role.id);
				await setManagerRoleIds(actor.guildId, isManagerRole ? current.filter((id) => id !== role.id) : [...current, role.id]);

				await interaction.reply({
					flags: MessageFlags.Ephemeral,
					allowedMentions: { parse: [] },
					embeds: [
						embed().setDescription(
							isManagerRole
								? `<@&${role.id}> is no longer a panel manager.`
								: `<@&${role.id}> is now a panel manager: full access to every server panel, and can link panels and change role access. Members with Manage Server always are.`,
						),
					],
				});
				return;
			}
		}
	},
};

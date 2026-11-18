import { MessageFlags } from 'discord.js';
import type { Command } from '../interactions.ts';
import { managedPanels, resolveActor } from '../lib/access.ts';
import { adminCall, requireAdminPanel } from '../lib/admin.ts';
import { collectSnapshot } from '../lib/panel-snapshot.ts';
import { hasAdminKey } from '../lib/panels.ts';
import { UserFacingError } from '../lib/replies.ts';
import { renderAdminServers, renderAdminUsers, renderKeyModal, renderOverview } from '../views/admin.ts';
import { managedPanelAutocomplete, slashCommand } from './shared.ts';

export const adminCommand: Command = {
	data: slashCommand('admin', 'Panel admin tools: nodes, every server and users. Needs an admin key')
		.addSubcommand((sub) =>
			sub
				.setName('key')
				.setDescription('Set or remove the admin (application) key of a panel you manage')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('overview')
				.setDescription('Panel totals and the status and usage of every node')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('servers')
				.setDescription('Find any server on the panel to suspend or reinstall it')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true))
				.addStringOption((option) => option.setName('search').setDescription('Part of the server name').setMaxLength(100)),
		)
		.addSubcommand((sub) =>
			sub
				.setName('users')
				.setDescription('Find a user on the panel')
				.addStringOption((option) => option.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true))
				.addStringOption((option) => option.setName('search').setDescription('Part of the username').setMaxLength(100)),
		),

	async autocomplete(interaction) {
		// Setting a key works on any panel you manage; everything else needs one first.
		await managedPanelAutocomplete(interaction, interaction.options.getSubcommand() === 'key' ? undefined : hasAdminKey);
	},

	async execute(interaction) {
		const actor = await resolveActor(interaction);
		const panelId = interaction.options.getString('panel', true);
		const sub = interaction.options.getSubcommand();

		if (sub === 'key') {
			const panel = (await managedPanels(actor)).find((row) => row.id === panelId);
			if (!panel) throw new UserFacingError('Pick a panel from the list. You can set admin keys on your own panels, or this server\'s if you are a panel manager.');
			await interaction.showModal(renderKeyModal(panel));
			return;
		}

		const { panel, admin } = await requireAdminPanel(actor, panelId);
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const search = interaction.options.getString('search') ?? undefined;
		switch (sub) {
			case 'overview':
				await interaction.editReply(renderOverview(panel, await collectSnapshot(admin)));
				return;
			case 'servers':
				await interaction.editReply(renderAdminServers(panel, await adminCall(() => admin.listServers({ search })), search));
				return;
			case 'users':
				await interaction.editReply(renderAdminUsers(panel, await adminCall(() => admin.listUsers({ search })), search));
				return;
		}
	},
};

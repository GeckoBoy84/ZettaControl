import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { eq } from 'drizzle-orm';
import { validateAdminKey } from '@zettako/panels';
import { brand } from '../brand.ts';
import { db } from '../db/client.ts';
import { panels, type PanelRow } from '../db/schema.ts';
import type { ComponentHandler } from '../interactions.ts';
import { managedPanels, resolveActor } from '../lib/access.ts';
import { adminCall, requireAdminPanel } from '../lib/admin.ts';
import { encryptSecret } from '../lib/crypto.ts';
import { collectSnapshot } from '../lib/panel-snapshot.ts';
import { adminKeyAad, forgetClient } from '../lib/panels.ts';
import { describeAdminError, embed, updateMessage, UserFacingError } from '../lib/replies.ts';
import { ADMIN_PREFIX, renderAdminServer, renderAdminServers, renderAdminUser, renderAdminUsers, renderOverview } from '../views/admin.ts';

async function saveKey(interaction: ModalSubmitInteraction, panelId: string): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	// Checked again here: the modal can be submitted long after it was opened.
	const panel = (await managedPanels(await resolveActor(interaction))).find((row) => row.id === panelId);
	if (!panel) throw new UserFacingError('You can no longer manage that panel.');

	const key = interaction.fields.getTextInputValue('key').trim();
	if (!key) {
		await setKey(panel, null);
		const after = panel.kind === 'calagopus' ? 'Admin tools now use the linked key.' : 'Admin tools and stats boards for it stop until a new key is set.';
		await interaction.editReply({ embeds: [embed().setDescription(`Removed the admin key for **${panel.name}**. ${after}`)] });
		return;
	}

	const { totals } = await validateAdminKey(panel.kind, { url: panel.url, apiKey: key, userAgent: `${brand.name} (+${brand.source})` }).catch((error: unknown) => {
		throw new UserFacingError(describeAdminError(error));
	});
	await setKey(panel, encryptSecret(key, adminKeyAad(panel.id)));
	await interaction.editReply({
		embeds: [
			embed().setDescription(
				[
					`Saved the admin key for **${panel.name}**. It sees ${totals.users} users, ${totals.servers} servers and ${totals.nodes} nodes.`,
					'',
					'Try `/admin overview`, or post a live board with `/stats post`. The key is encrypted and never shown again.',
				].join('\n'),
			),
		],
	});
}

async function setKey(panel: PanelRow, adminKeyEncrypted: string | null): Promise<void> {
	await db.update(panels).set({ adminKeyEncrypted, updatedAt: new Date() }).where(eq(panels.id, panel.id));
	forgetClient(panel.id);
}

export const adminHandler: ComponentHandler = {
	prefix: ADMIN_PREFIX,

	async handle(interaction, [action = '', panelId = '', itemId = '']) {
		if (action === 'key') {
			if (interaction.isModalSubmit()) await saveKey(interaction, panelId);
			return;
		}
		if (interaction.isModalSubmit()) return;

		const { panel, admin } = await requireAdminPanel(await resolveActor(interaction), panelId);
		const picked = interaction.isStringSelectMenu() ? (interaction.values[0] ?? '') : itemId;
		const by = `<@${interaction.user.id}>`;

		switch (action) {
			case 'overview':
				await updateMessage(interaction, async () => renderOverview(panel, await collectSnapshot(admin)));
				return;

			case 'servers':
				await updateMessage(interaction, async () => renderAdminServers(panel, await adminCall(() => admin.listServers())));
				return;

			case 'server':
			case 'srv':
				await updateMessage(interaction, async () => renderAdminServer(panel, admin, await adminCall(() => admin.getServer(picked))));
				return;

			case 'suspend':
			case 'unsuspend':
				await updateMessage(interaction, async () => {
					const suspend = action === 'suspend';
					await adminCall(() => admin.setServerSuspended(picked, suspend));
					const server = await adminCall(() => admin.getServer(picked));
					return renderAdminServer(panel, admin, server, { notice: suspend ? `⛔ Suspended by ${by}.` : `✅ Unsuspended by ${by}.` });
				});
				return;

			case 'reinstall':
				await updateMessage(interaction, async () => renderAdminServer(panel, admin, await adminCall(() => admin.getServer(picked)), { confirmReinstall: true }));
				return;

			case 'reinstallyes':
				await updateMessage(interaction, async () => {
					await adminCall(() => admin.reinstallServer(picked));
					const server = await adminCall(() => admin.getServer(picked));
					return renderAdminServer(panel, admin, server, { notice: `♻️ Reinstall started by ${by}.` });
				});
				return;

			case 'users':
				await updateMessage(interaction, async () => renderAdminUsers(panel, await adminCall(() => admin.listUsers())));
				return;

			case 'user':
				await updateMessage(interaction, async () => renderAdminUser(panel, admin, await adminCall(() => admin.getUser(picked))));
				return;

			case 'ususpend':
			case 'uunsuspend':
				await updateMessage(interaction, async () => {
					const suspend = action === 'ususpend';
					await adminCall(() => admin.setUserSuspended(picked, suspend));
					const user = await adminCall(() => admin.getUser(picked));
					return renderAdminUser(panel, admin, user, suspend ? `⛔ Suspended by ${by}.` : `✅ Unsuspended by ${by}.`);
				});
				return;
		}
	},
};

// Shared bits of the admin tools (/admin and /stats). An admin key can do anything on the
// panel, so only people who manage the panel get these: the owner of a personal panel,
// or the managers of a server panel. Role grants never reach the admin API.

import { PanelError, type AdminClient } from '@zettako/panels';
import type { PanelRow } from '../db/schema.ts';
import { managedPanels, type Actor } from './access.ts';
import { adminClientFor } from './panels.ts';
import { describeAdminError, UserFacingError } from './replies.ts';

/** Runs an admin API call and turns panel errors into admin specific text. */
export async function adminCall<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (error) {
		if (error instanceof PanelError) throw new UserFacingError(describeAdminError(error));
		throw error;
	}
}

export async function requireAdminPanel(actor: Actor, panelId: string): Promise<{ panel: PanelRow; admin: AdminClient }> {
	const panel = (await managedPanels(actor)).find((row) => row.id === panelId);
	if (!panel) throw new UserFacingError('Pick a panel from the list. Admin tools work on your own panels, or this server\'s if you are a panel manager.');
	const admin = adminClientFor(panel);
	if (!admin) throw new UserFacingError(`**${panel.name}** has no admin key yet. Add one with \`/admin key\`.`);
	return { panel, admin };
}

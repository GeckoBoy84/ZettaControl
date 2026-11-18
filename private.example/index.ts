// Copy this folder to `private/` (git ignored) to add hooks that only run on
// your deployment. The public Zettako bot uses this for telemetry and staff
// alerts. Every hook is optional and errors in hooks never reach users.

import type { BotHooks } from '../apps/bot/src/hooks.ts';

const STAFF_WEBHOOK = process.env.STAFF_WEBHOOK_URL;

async function notifyStaff(content: string): Promise<void> {
	if (!STAFF_WEBHOOK) return;
	await fetch(STAFF_WEBHOOK, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
	});
}

const hooks: BotHooks = {
	async onGuildJoin(guild) {
		await notifyStaff(`Joined **${guild.name}** (${guild.memberCount} members)`);
	},
	async onGuildLeave(guild) {
		await notifyStaff(`Left **${guild.name}**`);
	},
	async onPanelLinked({ kind, scope, isZettako }) {
		await notifyStaff(`Panel linked: ${kind}, ${scope}${isZettako ? ', Zettako' : ''}`);
	},
	async onError(error, context) {
		await notifyStaff(`Error in ${String(context.interaction ?? context.source)}: ${String(error).slice(0, 1500)}`);
	},
};

export default hooks;

import type { InteractionEditReplyOptions } from 'discord.js';
import { renderBackups } from './backups.ts';
import { renderDatabases } from './databases.ts';
import { renderNetwork, renderSubusers } from './details.ts';
import { renderDirectory } from './files.ts';
import { renderSchedules } from './schedules.ts';
import { requireSection, type SectionName, type ServerContext } from './sections.ts';
import { renderStartup } from './startup.ts';

/** Opens a section from the server view menu or a `/server <section>` command. */
export function renderSection(name: SectionName, ctx: ServerContext): Promise<InteractionEditReplyOptions> {
	requireSection(ctx, name);
	switch (name) {
		case 'backups':
			return renderBackups(ctx);
		case 'files':
			return renderDirectory(ctx, '/');
		case 'schedules':
			return renderSchedules(ctx);
		case 'databases':
			return renderDatabases(ctx);
		case 'network':
			return renderNetwork(ctx);
		case 'users':
			return renderSubusers(ctx);
		case 'startup':
			return renderStartup(ctx);
	}
}

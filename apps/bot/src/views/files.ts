import { posix } from 'node:path';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	codeBlock,
	escapeCodeBlock,
	StringSelectMenuBuilder,
	type InteractionEditReplyOptions,
	type Message,
} from 'discord.js';
import type { FileEntry } from '@zettako/panels';
import { customId } from '../interactions.ts';
import { discordTime, formatBytes, plural, truncate } from '../lib/format.ts';
import { UserFacingError } from '../lib/replies.ts';
import { backButton, sectionEmbed, type ServerContext } from './sections.ts';

export const FILES_PREFIX = 'fl';

const PAGE_SIZE = 25;
/** Larger files are offered as a download only. */
const MAX_PREVIEW_BYTES = 512 * 1024;
const PREVIEW_CHARS = 3_800;
/** Discord text inputs hold at most 4000 characters, so only files that fit can be edited. */
export const MAX_EDIT_CHARS = 4_000;

const LANGUAGES: Record<string, string> = {
	json: 'json',
	yml: 'yaml',
	yaml: 'yaml',
	toml: 'toml',
	properties: 'properties',
	ini: 'ini',
	cfg: 'ini',
	conf: 'ini',
	js: 'js',
	ts: 'ts',
	py: 'py',
	lua: 'lua',
	sh: 'sh',
	xml: 'xml',
	md: 'md',
	log: 'log',
};

/**
 * The path a files view shows lives in its embed author line, because paths can be far
 * longer than a custom ID allows. Normalised so a path can never climb above the root.
 */
export function pathFromMessage(message: Message | null): string {
	const raw = message?.embeds[0]?.author?.name;
	if (!raw?.startsWith('/')) throw new UserFacingError('This files view is out of date. Open Files again from the server view.');
	return posix.normalize(raw);
}

export function childPath(directory: string, name: string): string {
	return posix.join(directory, name);
}

export function parentPath(path: string): string {
	return posix.dirname(path);
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
	return entries.toSorted((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
}

export async function renderDirectory(ctx: ServerContext, directory: string, page = 0, notice?: string): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId } = ctx;
	const [server, entries] = await Promise.all([client.getServer(serverId), client.listFiles(serverId, directory).then(sortEntries)]);
	const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
	const current = Math.min(Math.max(page, 0), pages - 1);
	const shown = entries.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

	const lines = shown.map((entry) => (entry.directory ? `📁 ${entry.name}/` : `📄 ${entry.name} · ${formatBytes(entry.size)}`));
	const view = sectionEmbed('files', panel, server)
		.setAuthor({ name: truncate(directory, 256) })
		.setDescription(
			[
				notice,
				lines.length ? truncate(lines.join('\n'), 3_500) : 'This folder is empty.',
				pages > 1 ? `Page ${current + 1} of ${pages} · ${plural(entries.length, 'item')}` : null,
			]
				.filter(Boolean)
				.join('\n\n'),
		);

	const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
	const options = shown
		.map((entry) => ({ entry, value: `${entry.directory ? 'd' : 'f'}:${entry.name}` }))
		.filter(({ value }) => value.length <= 100)
		.map(({ entry, value }) => ({
			label: truncate(entry.directory ? `${entry.name}/` : entry.name, 100),
			description: entry.directory ? 'Folder' : `${formatBytes(entry.size)} · modified ${entry.modifiedAt?.slice(0, 10) ?? '-'}`,
			emoji: entry.directory ? '📁' : '📄',
			value,
		}));
	if (options.length > 0) {
		components.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder().setCustomId(customId(FILES_PREFIX, 'open', panel.id, serverId)).setPlaceholder('Open a file or folder').addOptions(options),
			),
		);
	}

	const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(customId(FILES_PREFIX, 'up', panel.id, serverId))
			.setLabel('Up')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(directory === '/'),
	);
	if (pages > 1) {
		nav.addComponents(
			new ButtonBuilder()
				.setCustomId(customId(FILES_PREFIX, 'page', panel.id, serverId, String(current - 1)))
				.setLabel('Previous')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(current === 0),
			new ButtonBuilder()
				.setCustomId(customId(FILES_PREFIX, 'page', panel.id, serverId, String(current + 1)))
				.setLabel('Next')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(current >= pages - 1),
		);
	}
	nav.addComponents(backButton(panel, serverId));
	components.push(nav);

	return { embeds: [view], components };
}

export interface FilePreview {
	entry: FileEntry;
	/** null when the file is too large or binary. */
	content: string | null;
}

export async function loadFile(ctx: ServerContext, path: string): Promise<FilePreview> {
	const entry = (await ctx.client.listFiles(ctx.serverId, parentPath(path))).find((row) => row.name === posix.basename(path) && !row.directory);
	if (!entry) throw new UserFacingError('That file no longer exists.');
	if (entry.size > MAX_PREVIEW_BYTES) return { entry, content: null };
	const content = await ctx.client.readFile(ctx.serverId, path);
	return { entry, content: content.includes('\0') ? null : content };
}

export async function renderFile(ctx: ServerContext, path: string, notice?: string): Promise<InteractionEditReplyOptions> {
	const { panel, client, serverId } = ctx;
	const [server, { entry, content }] = await Promise.all([client.getServer(serverId), loadFile(ctx, path)]);

	let body: string;
	if (content === null) {
		body = entry.size > MAX_PREVIEW_BYTES ? 'This file is too large to show here. Download it instead.' : 'This looks like a binary file. Download it instead.';
	} else if (content.length === 0) {
		body = 'This file is empty.';
	} else {
		const language = LANGUAGES[posix.extname(path).slice(1).toLowerCase()] ?? '';
		const shown = content.length > PREVIEW_CHARS ? `${content.slice(0, PREVIEW_CHARS)}\n…` : content;
		body = codeBlock(language, escapeCodeBlock(shown));
	}

	const view = sectionEmbed('files', panel, server)
		.setAuthor({ name: truncate(path, 256) })
		.setDescription([notice, `${formatBytes(entry.size)} · modified ${discordTime(entry.modifiedAt)}`, body].filter(Boolean).join('\n\n'));

	const editable = content !== null && content.length <= MAX_EDIT_CHARS;
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(customId(FILES_PREFIX, 'download', panel.id, serverId)).setLabel('Download').setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId(customId(FILES_PREFIX, 'edit', panel.id, serverId)).setLabel('Edit').setStyle(ButtonStyle.Secondary).setDisabled(!editable),
		new ButtonBuilder().setCustomId(customId(FILES_PREFIX, 'up', panel.id, serverId)).setLabel('Back to folder').setStyle(ButtonStyle.Secondary),
		backButton(panel, serverId),
	);
	return { embeds: [view], components: [row] };
}

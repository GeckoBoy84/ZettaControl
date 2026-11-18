// Console threads: each row in console_threads gets one websocket to its game server.
// Output is buffered and posted every couple of seconds in code blocks, so a chatty
// server costs a few messages, not one per line. Sessions are rebuilt from the
// database on start and reconciled every minute, so removing a panel (which cascades)
// or deleting the thread stops them.

import { codeBlock, DiscordAPIError, type Client, type Message } from 'discord.js';
import { eq, inArray } from 'drizzle-orm';
import { brand } from '../brand.ts';
import { db } from '../db/client.ts';
import { consoleThreads, panels, type ConsoleThreadRow, type PanelRow } from '../db/schema.ts';
import { logger } from '../logger.ts';
import { actorFromMember, atLeast, levelFor, panelAccess } from './access.ts';
import { chunkLines, cleanConsoleLine } from './console-text.ts';
import { ConsoleSocket } from './console-socket.ts';
import { truncate } from './format.ts';
import { clientFor } from './panels.ts';
import { describeError } from './replies.ts';

const FLUSH_MS = 2_000;
const MAX_MESSAGE_CHARS = 1_900;
/** Discord allows about 5 messages per 5 seconds per channel. */
const MAX_MESSAGES_PER_FLUSH = 3;
const MAX_BUFFER_LINES = 5_000;
const RECONCILE_MS = 60_000;
export const MAX_CONSOLES_PER_GUILD = 5;

// Unknown Channel, Missing Access, archived thread, locked thread: the thread is gone for us.
const THREAD_GONE_CODES = new Set([10003, 50001, 50083, 160005]);

class ConsoleSession {
	readonly row: ConsoleThreadRow;
	readonly #discord: Client<true>;
	readonly #socket: ConsoleSocket;
	#buffer: string[] = [];
	#timer: NodeJS.Timeout;
	#flushing = false;

	constructor(discord: Client<true>, row: ConsoleThreadRow, panel: PanelRow, backfill: boolean) {
		this.row = row;
		this.#discord = discord;
		this.#socket = new ConsoleSocket(
			() => clientFor(panel).getConsoleCredentials(row.serverId),
			panel.url,
			{
				output: (raw) => {
					for (const part of raw.split('\n')) {
						const line = cleanConsoleLine(part);
						if (line !== null) this.#push(line);
					}
				},
				status: (state) => this.#push(`[${brand.name}] Server is now ${state}.`),
				notice: (message) => this.#push(`[${brand.name}] ${message}`),
			},
			backfill,
		);
		this.#timer = setInterval(() => void this.#flush(), FLUSH_MS);
		this.#socket.start();
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#socket.stop();
	}

	#push(line: string): void {
		this.#buffer.push(line);
		if (this.#buffer.length > MAX_BUFFER_LINES) this.#buffer.splice(0, this.#buffer.length - MAX_BUFFER_LINES);
	}

	async #flush(): Promise<void> {
		if (this.#flushing || this.#buffer.length === 0) return;
		this.#flushing = true;
		const lines = this.#buffer;
		this.#buffer = [];
		try {
			const channel = await this.#discord.channels.fetch(this.row.threadId);
			if (!channel?.isThread()) {
				await closeConsole(this.row.threadId);
				return;
			}
			const { chunks, skipped } = chunkLines(lines, MAX_MESSAGE_CHARS, MAX_MESSAGES_PER_FLUSH);
			for (const [index, chunk] of chunks.entries()) {
				const note = index === 0 && skipped > 0 ? `-# ${skipped} earlier lines skipped, the server is printing faster than Discord allows.\n` : '';
				await channel.send({ content: `${note}${codeBlock(chunk || ' ')}`, allowedMentions: { parse: [] } });
			}
		} catch (error) {
			if (error instanceof DiscordAPIError && typeof error.code === 'number' && THREAD_GONE_CODES.has(error.code)) {
				logger.info({ thread: this.row.threadId, code: error.code }, 'Console thread is gone, closing it');
				await closeConsole(this.row.threadId);
			} else {
				logger.warn({ err: error, thread: this.row.threadId }, 'Could not post console output');
			}
		} finally {
			this.#flushing = false;
		}
	}
}

const sessions = new Map<string, ConsoleSession>();
let discord: Client<true> | null = null;

export async function startConsoles(client: Client<true>): Promise<void> {
	discord = client;
	await reconcile();
	setInterval(() => void reconcile().catch((error: unknown) => logger.warn({ err: error }, 'Console reconcile failed')), RECONCILE_MS).unref();
}

async function reconcile(): Promise<void> {
	if (!discord) return;
	const rows = await db.select().from(consoleThreads);
	const wanted = new Set(rows.map((row) => row.threadId));
	for (const [threadId, session] of sessions) {
		if (!wanted.has(threadId)) {
			session.stop();
			sessions.delete(threadId);
		}
	}

	const missing = rows.filter((row) => !sessions.has(row.threadId));
	if (missing.length === 0) return;
	const panelRows = await db.select().from(panels).where(inArray(panels.id, [...new Set(missing.map((row) => row.panelId))]));
	for (const row of missing) {
		const panel = panelRows.find((candidate) => candidate.id === row.panelId);
		if (panel) sessions.set(row.threadId, new ConsoleSession(discord, row, panel, false));
	}
	logger.info({ count: sessions.size }, 'Console threads running');
}

/** Starts streaming into a thread whose row was just inserted. */
export function openConsole(row: ConsoleThreadRow, panel: PanelRow): void {
	if (!discord) throw new Error('Consoles are not started yet');
	sessions.get(row.threadId)?.stop();
	sessions.set(row.threadId, new ConsoleSession(discord, row, panel, true));
}

export function isConsoleThread(threadId: string): boolean {
	return sessions.has(threadId);
}

export async function closeConsole(threadId: string): Promise<void> {
	sessions.get(threadId)?.stop();
	sessions.delete(threadId);
	await db.delete(consoleThreads).where(eq(consoleThreads.threadId, threadId));
}

export async function consoleFor(threadId: string): Promise<ConsoleThreadRow | null> {
	const [row] = await db.select().from(consoleThreads).where(eq(consoleThreads.threadId, threadId)).limit(1);
	return row ?? null;
}

/**
 * With CONSOLE_TYPED_COMMANDS on, a message typed in a console thread is sent to the
 * server as a command, if its author has Full access there. Access is checked per message.
 */
export async function handleConsoleMessage(message: Message): Promise<void> {
	if (message.author.bot || !message.inGuild() || !sessions.has(message.channelId)) return;
	const command = message.content.trim();
	if (!command) return;

	const row = sessions.get(message.channelId)?.row;
	if (!row) return;
	try {
		const member = message.member ?? (await message.guild.members.fetch(message.author.id));
		const access = await panelAccess(await actorFromMember(member), row.panelId);
		if (!access || !atLeast(levelFor(access, row.serverId), 'full')) {
			await message.reply({ content: 'You need **Full** access on this server to send console commands.', allowedMentions: { parse: [] } });
			return;
		}
		await clientFor(access.panel).sendCommand(row.serverId, truncate(command, 2_000));
	} catch (error) {
		await message.reply({ content: describeError(error), allowedMentions: { parse: [] } }).catch(() => undefined);
	}
}

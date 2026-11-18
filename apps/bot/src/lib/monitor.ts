// Once a minute: every panel with a status board or alert rule is asked for its servers'
// resources once, then boards are re-rendered and alert rules evaluated from that one
// snapshot. Alerts poll on every panel; Calagopus also gets its crash log read, so a
// crash is told apart from a normal stop.

import { DiscordAPIError, type Client, type MessageCreateOptions } from 'discord.js';
import { eq, inArray } from 'drizzle-orm';
import type { CrashLog, ServerResources, ServerSummary } from '@zettako/panels';
import { db } from '../db/client.ts';
import { ALL_SERVERS, alertRules, panels, statusBoards, type AlertRuleRow, type PanelRow, type StatusBoardRow } from '../db/schema.ts';
import { logger } from '../logger.ts';
import { renderAlert, renderStatusBoard, type BoardServer } from '../views/status-board.ts';
import { evaluate, type ServerMemory } from './alert-state.ts';
import { clientFor, listServersCached } from './panels.ts';
import { describeError } from './replies.ts';

const TICK_MS = 60_000;
const FIRST_TICK_MS = 10_000;
/** A board or `all servers` rule watches at most this many servers per panel. */
export const MAX_SERVERS_PER_PANEL = 50;
const CONCURRENCY = 5;

const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;

let discord: Client<true> | null = null;
let running = false;
/** Alert memory per `<ruleId>:<serverId>`. Lost on restart, which only means a fresh baseline. */
const memory = new Map<string, ServerMemory>();

export function startMonitor(client: Client<true>): void {
	discord = client;
	setTimeout(() => void tick(), FIRST_TICK_MS).unref();
	setInterval(() => void tick(), TICK_MS).unref();
}

/** Fills in a new board right away instead of at the next tick. Leaves alert memory alone. */
export async function updateBoard(board: StatusBoardRow): Promise<void> {
	const [panel] = await db.select().from(panels).where(eq(panels.id, board.panelId)).limit(1);
	if (panel) await checkPanel(panel, [board], [], new Set());
}

async function tick(): Promise<void> {
	if (running) return;
	running = true;
	try {
		await checkAll();
	} catch (error) {
		logger.warn({ err: error }, 'Monitor tick failed');
	} finally {
		running = false;
	}
}

async function checkAll(): Promise<void> {
	const [boards, rules] = await Promise.all([db.select().from(statusBoards), db.select().from(alertRules)]);
	const panelIds = [...new Set([...boards, ...rules].map((row) => row.panelId))];
	if (panelIds.length === 0) {
		memory.clear();
		return;
	}

	const panelRows = await db.select().from(panels).where(inArray(panels.id, panelIds));
	const seen = new Set<string>();
	for (const panel of panelRows) {
		await checkPanel(
			panel,
			boards.filter((board) => board.panelId === panel.id),
			rules.filter((rule) => rule.panelId === panel.id),
			seen,
		).catch((error: unknown) => logger.warn({ err: error, panel: panel.id }, 'Monitor check failed for a panel'));
	}
	for (const key of memory.keys()) if (!seen.has(key)) memory.delete(key);
}

async function checkPanel(panel: PanelRow, boards: StatusBoardRow[], rules: AlertRuleRow[], seen: Set<string>): Promise<void> {
	const client = clientFor(panel);
	let servers: ServerSummary[];
	try {
		servers = await listServersCached(panel);
	} catch (error) {
		for (const board of boards) await editBoard(board, renderStatusBoard(panel, [], { error: describeError(error) }));
		return;
	}

	const targets = [...boards, ...rules];
	const ids = new Set(targets.map((target) => target.serverId));
	const watched = servers
		.filter((server) => ids.has(ALL_SERVERS) || ids.has(server.id))
		.toSorted((a, b) => a.name.localeCompare(b.name))
		.slice(0, MAX_SERVERS_PER_PANEL);
	const hidden = Math.max(0, (ids.has(ALL_SERVERS) ? servers.length : watched.length) - watched.length);

	const crashWatch = new Set(
		client.capabilities.crashLogs
			? rules.filter((rule) => rule.events.includes('crash')).flatMap((rule) => (rule.serverId === ALL_SERVERS ? watched.map((server) => server.id) : [rule.serverId]))
			: [],
	);

	const resources = new Map<string, ServerResources | null>();
	const crashes = new Map<string, CrashLog | null>();
	await forEachLimit(watched, CONCURRENCY, async (server) => {
		resources.set(server.id, await client.getResources(server.id).catch(() => null));
		if (crashWatch.has(server.id)) crashes.set(server.id, (await client.listCrashes(server.id).catch(() => []))[0] ?? null);
	});

	for (const board of boards) {
		const entries: BoardServer[] = watched
			.filter((server) => board.serverId === ALL_SERVERS || server.id === board.serverId)
			.map((server) => ({ server, resources: resources.get(server.id) ?? null }));
		if (board.serverId !== ALL_SERVERS) {
			const single = entries[0];
			await editBoard(
				board,
				single ? renderStatusBoard(panel, entries, { title: single.server.name }) : renderStatusBoard(panel, [], { error: 'That server is no longer on the panel.' }),
			);
		} else {
			await editBoard(board, renderStatusBoard(panel, entries, { hidden }));
		}
	}

	for (const rule of rules) {
		for (const server of watched.filter((candidate) => rule.serverId === ALL_SERVERS || candidate.id === rule.serverId)) {
			const key = `${rule.id}:${server.id}`;
			seen.add(key);
			const observation = { resources: resources.get(server.id) ?? null, limits: server.limits, latestCrash: crashes.get(server.id) ?? null };
			const { next, alerts } = evaluate(memory.get(key), observation, rule);
			if (next) memory.set(key, next);
			for (const alert of alerts) await sendAlert(rule, renderAlert(rule, panel, server, alert));
		}
	}
}

async function editBoard(board: StatusBoardRow, payload: MessageCreateOptions): Promise<void> {
	try {
		const channel = await discord?.channels.fetch(board.channelId);
		if (!channel?.isSendable() || channel.isDMBased()) return;
		await channel.messages.edit(board.messageId, { embeds: payload.embeds, allowedMentions: payload.allowedMentions });
	} catch (error) {
		if (error instanceof DiscordAPIError && (error.code === UNKNOWN_MESSAGE || error.code === UNKNOWN_CHANNEL)) {
			// Deleting the message is how people take a board down.
			logger.info({ board: board.id }, 'Status board message is gone, removing the board');
			await db.delete(statusBoards).where(eq(statusBoards.id, board.id));
		} else {
			logger.warn({ err: error, board: board.id }, 'Could not update a status board');
		}
	}
}

async function sendAlert(rule: AlertRuleRow, payload: MessageCreateOptions): Promise<void> {
	try {
		const channel = await discord?.channels.fetch(rule.channelId);
		if (!channel?.isSendable()) return;
		await channel.send(payload);
	} catch (error) {
		if (error instanceof DiscordAPIError && error.code === UNKNOWN_CHANNEL) {
			logger.info({ rule: rule.id }, 'Alert channel is gone, removing the rule');
			await db.delete(alertRules).where(eq(alertRules.id, rule.id));
		} else {
			logger.warn({ err: error, rule: rule.id }, 'Could not send an alert');
		}
	}
}

async function forEachLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const item = items[next++] as T;
			await run(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

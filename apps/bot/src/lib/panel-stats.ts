// Once a minute: every panel with a stats board is looked at once through its admin API,
// then each board is re-rendered, its uptime memory advanced and saved, and up or down
// alerts posted. Boards rebuild from the database, so unlinking a panel stops them.

import { DiscordAPIError, type Client, type MessageCreateOptions } from 'discord.js';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { panels, panelStatsBoards, type PanelRow, type PanelStatsBoardRow } from '../db/schema.ts';
import { logger } from '../logger.ts';
import { renderPanelStats, renderStatsAlert } from '../views/panel-stats.ts';
import { collectSnapshot, type PanelSnapshot } from './panel-snapshot.ts';
import { adminClientFor } from './panels.ts';
import { advance, type StatsObservation } from './stats-state.ts';

const TICK_MS = 60_000;
const FIRST_TICK_MS = 15_000;

const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;

let discord: Client<true> | null = null;
let running = false;

export function startPanelStats(client: Client<true>): void {
	discord = client;
	setTimeout(() => void tick(), FIRST_TICK_MS).unref();
	setInterval(() => void tick(), TICK_MS).unref();
}

/** Fills in a new board right away instead of at the next tick. */
export async function updateStatsBoard(board: PanelStatsBoardRow): Promise<void> {
	const [panel] = await db.select().from(panels).where(eq(panels.id, board.panelId)).limit(1);
	if (panel) await checkPanel(panel, [board]);
}

async function tick(): Promise<void> {
	if (running) return;
	running = true;
	try {
		const boards = await db.select().from(panelStatsBoards);
		const panelIds = [...new Set(boards.map((board) => board.panelId))];
		if (panelIds.length === 0) return;
		for (const panel of await db.select().from(panels).where(inArray(panels.id, panelIds))) {
			await checkPanel(
				panel,
				boards.filter((board) => board.panelId === panel.id),
			).catch((error: unknown) => logger.warn({ err: error, panel: panel.id }, 'Panel stats check failed'));
		}
	} catch (error) {
		logger.warn({ err: error }, 'Panel stats tick failed');
	} finally {
		running = false;
	}
}

export function toObservation(snapshot: PanelSnapshot): StatsObservation {
	if (!snapshot.ok) return { panelOnline: snapshot.down ? false : null, nodes: null };
	return {
		panelOnline: true,
		nodes: snapshot.nodes.map(({ node, status }) => ({ id: node.id, name: node.name, online: status === 'unknown' ? null : status === 'online' })),
	};
}

async function checkPanel(panel: PanelRow, boards: PanelStatsBoardRow[]): Promise<void> {
	const admin = adminClientFor(panel);
	const snapshot: PanelSnapshot = admin
		? await collectSnapshot(admin)
		: { ok: false, down: false, error: 'This panel no longer has an admin key. Add one with `/admin key`.' };
	const observation = toObservation(snapshot);
	const now = new Date().toISOString();

	for (const board of boards) {
		const { state, events } = advance(board.state, observation, now);
		await db.update(panelStatsBoards).set({ state }).where(eq(panelStatsBoards.id, board.id));
		if (!(await editBoard(board, renderPanelStats(panel, snapshot, state, { live: true })))) continue;
		for (const event of board.alertChannelId ? events : []) await sendAlert(board, renderStatsAlert(panel, event, board.mentionRoleId));
	}
}

/** Returns false when the board's message is gone, after removing the board. */
async function editBoard(board: PanelStatsBoardRow, payload: MessageCreateOptions): Promise<boolean> {
	try {
		const channel = await discord?.channels.fetch(board.channelId);
		if (!channel?.isSendable() || channel.isDMBased()) return true;
		await channel.messages.edit(board.messageId, { embeds: payload.embeds, components: payload.components, allowedMentions: payload.allowedMentions });
	} catch (error) {
		if (error instanceof DiscordAPIError && (error.code === UNKNOWN_MESSAGE || error.code === UNKNOWN_CHANNEL)) {
			// Deleting the message is how people take a board down.
			logger.info({ board: board.id }, 'Panel stats message is gone, removing the board');
			await db.delete(panelStatsBoards).where(eq(panelStatsBoards.id, board.id));
			return false;
		}
		logger.warn({ err: error, board: board.id }, 'Could not update a panel stats board');
	}
	return true;
}

async function sendAlert(board: PanelStatsBoardRow, payload: MessageCreateOptions): Promise<void> {
	if (!board.alertChannelId) return;
	try {
		const channel = await discord?.channels.fetch(board.alertChannelId);
		if (!channel?.isSendable()) return;
		await channel.send(payload);
	} catch (error) {
		if (error instanceof DiscordAPIError && error.code === UNKNOWN_CHANNEL) {
			logger.info({ board: board.id }, 'Panel stats alert channel is gone, turning its alerts off');
			await db.update(panelStatsBoards).set({ alertChannelId: null }).where(eq(panelStatsBoards.id, board.id));
		} else {
			logger.warn({ err: error, board: board.id }, 'Could not send a panel stats alert');
		}
	}
}

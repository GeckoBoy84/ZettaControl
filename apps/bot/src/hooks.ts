// Optional hooks for things that should run on the public Zettako bot but stay
// out of this public repo: telemetry, staff alerts, internal dashboards.
// The open source build runs fine with none of them. See private.example/.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Client, Guild } from 'discord.js';
import type { PanelKind } from '@zettako/panels';
import { env } from './env.ts';
import { logger } from './logger.ts';

export interface CommandEvent {
	command: string;
	userId: string;
	guildId: string | null;
	durationMs: number;
	ok: boolean;
}

export type FeedbackKind = 'bug' | 'idea' | 'question' | 'other';

export interface FeedbackEvent {
	kind: FeedbackKind;
	message: string;
	userId: string;
	userTag: string;
	guildId: string | null;
}

export interface BotHooks {
	onReady?(client: Client<true>): void | Promise<void>;
	onCommand?(event: CommandEvent): void | Promise<void>;
	onError?(error: unknown, context: Record<string, unknown>): void | Promise<void>;
	onGuildJoin?(guild: Guild): void | Promise<void>;
	onGuildLeave?(guild: Guild): void | Promise<void>;
	onPanelLinked?(event: { kind: PanelKind; scope: 'user' | 'guild'; isZettako: boolean }): void | Promise<void>;
	onPanelUnlinked?(event: { kind: PanelKind; scope: 'user' | 'guild' }): void | Promise<void>;
	/** Without this hook, /feedback points people to the support server instead. */
	onFeedback?(event: FeedbackEvent): void | Promise<void>;
}

let hooks: BotHooks = {};

const DEFAULT_PATH = resolve(import.meta.dirname, '../../../private/index.ts');

export async function loadHooks(): Promise<void> {
	const path = env.PRIVATE_HOOKS ? resolve(env.PRIVATE_HOOKS) : DEFAULT_PATH;
	if (!existsSync(path)) return;

	const module = (await import(pathToFileURL(path).href)) as { default?: BotHooks };
	hooks = module.default ?? {};
	logger.info({ hooks: Object.keys(hooks) }, 'Loaded private hooks');
}

export function hasHook(name: keyof BotHooks): boolean {
	return typeof hooks[name] === 'function';
}

/** Calls a hook without letting it break the bot. Never awaited by callers. */
export function emit<K extends keyof BotHooks>(name: K, ...args: Parameters<NonNullable<BotHooks[K]>>): void {
	const hook = hooks[name] as ((...hookArgs: typeof args) => void | Promise<void>) | undefined;
	if (!hook) return;
	try {
		Promise.resolve(hook(...args)).catch((error: unknown) => logger.warn({ err: error, hook: name }, 'Private hook failed'));
	} catch (error) {
		logger.warn({ err: error, hook: name }, 'Private hook failed');
	}
}

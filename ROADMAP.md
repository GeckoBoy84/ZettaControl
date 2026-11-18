# Roadmap

## Phase 1: Foundation (in progress)

- [x] Monorepo, TypeScript on Node 26, discord.js 14, Postgres with Drizzle
- [x] Panel adapters: Calagopus, Pterodactyl 1.x, Pterodactyl 2.x, Pelican, with auto-detection
- [x] Encrypted API keys, keys entered through modals only
- [x] Personal panels (DMs, user installs) and Discord server panels
- [x] Manager roles and per panel or per game server role access (View, Power, Full)
- [x] `/server view | power | command`, `/panel add | list | remove`, `/access grant | revoke | list | managers`, `/help`, `/about`
- [x] Private hooks for deployment-only telemetry and alerts
- [ ] Test against live panels of each type
- [ ] Docker image and Calagopus egg for hosting

## Phase 2: Panel depth

Backups, files, schedules, databases, subusers, network and startup variables. Each adapter declares what it supports and the bot hides the rest.

## Phase 3: Live features

- Console threads: stream the server console into a thread and send what is typed there as commands
- Status boards: a channel message that keeps every server's state up to date
- Alerts: crash, offline and high resource notifications (Calagopus webhooks where available, polling elsewhere)

## Phase 4: Admin

Application and admin API: users, servers, nodes. Pterodactyl 1.x nests, 2.x tags, Pelican and Calagopus each in their own adapter.

## Phase 5: Zettako one-click link

A Calagopus extension that lets a Zettako client approve the bot in the panel, which creates a scoped API key and hands it to the bot. No copying keys.

## Phase 6: Website and release

Small site in `WEBSITE/` (home, docs, privacy, terms), then v2.0.0.

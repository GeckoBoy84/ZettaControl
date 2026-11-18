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

## Phase 2: Panel depth (done)

- [x] Backups, files, schedules, databases, subusers, network and startup variables. Each adapter declares what it supports and the bot hides the rest.
- [ ] Test each section against live Pterodactyl and Pelican panels

## Phase 3: Live features (done)

- [x] Console threads: stream the server console into a private thread and send what is typed there as commands (`CONSOLE_TYPED_COMMANDS`, else a button)
- [x] Status boards: a channel message that keeps every server's state up to date
- [x] Alerts: crash, offline and high resource notifications. Polling on every panel, plus the Calagopus crash log
- [ ] Calagopus webhooks instead of polling. Needs a public HTTP endpoint on the bot and keys with webhook permissions

## Phase 4: Admin (done)

- [x] Admin adapters for every panel in their own files: Calagopus `/api/admin`, the application API on Pterodactyl 1.x, 2.x and Pelican. Optional encrypted admin key per panel; Calagopus can use the linked key.
- [x] `/admin overview | servers | users`: totals, node status, find any server or user, suspend, unsuspend and reinstall servers, suspend users on Calagopus
- [x] Panel stats boards (`/stats`): panel and node uptime and usage with down and recovery posts, debounced over two checks, state kept across restarts
- [ ] Nests (1.x), tags (2.x) and eggs
- [ ] Create users and servers from Discord
- [ ] Test against live panels of each type

## Phase 5: Zettako one-click link

A Calagopus extension that lets a Zettako client approve the bot in the panel, which creates a scoped API key and hands it to the bot. No copying keys.

## Phase 6: Website and release

Small site in `WEBSITE/` (home, docs, privacy, terms), then v2.0.0.
# Roadmap

## Phase 1: Foundation (in progress)

- [x] Monorepo, TypeScript on Node 26, discord.js 14, Postgres with Drizzle
- [x] Panel adapters: Calagopus, Pterodactyl 1.x, Pterodactyl 2.x, Pelican, with auto-detection
- [x] Encrypted API keys, keys entered through modals only
- [x] Personal panels (DMs, user installs) and Discord server panels with role access
- [x] `/server view | power | command`, `/panel add | list | remove | access`, `/help`, `/about`
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

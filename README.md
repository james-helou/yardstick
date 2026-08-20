# Yardstick

Local SEO diagnostics for agencies. Measure a prospect's visibility, show them the gap,
and win the work.

Conventions live in `CLAUDE.md`. The reasoning behind the load-bearing decisions is in
`docs/teardown-findings.md`. Current state and open items are in `.claude/HANDOFF.md`.

## Local setup

```bash
createdb yardstick_dev && createdb yardstick_test
cp .env.example .env.local        # point DATABASE_URL at yardstick_dev
npm install
npm run db:migrate
npm run dev                       # http://localhost:3000
npm run worker:dev                # the queue worker, in a second terminal
```

## Gates

`npm run verify` runs typecheck, lint, tests, and build. All four must be green; the same
command runs in CI on every push.

## Deployment

Railway project `yardstick`, three services from one image:

| Service | Role | Start |
|---|---|---|
| `web` | `SERVICE_ROLE=web` | migrates, then `next start` |
| `worker` | `SERVICE_ROLE=worker` | claim / run / sleep loop |
| `Postgres` | database | Railway managed |

Both application services deploy from `main` on push and share `DATABASE_URL` by
reference. `docker-entrypoint.sh` picks the role, so the two can never drift out of sync.

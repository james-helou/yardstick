<div align="center">

# Yardstick

**Local SEO diagnostics for agencies: measure a prospect's visibility, show them the gap, and win the work.**

<img alt="Scan to signed deal" src="https://img.shields.io/badge/Scan_to-signed_deal-24292f?style=for-the-badge"> <img alt="Built for the phone in a meeting" src="https://img.shields.io/badge/Built_for-the_phone_in_a_meeting-24292f?style=for-the-badge"> <img alt="Runs on Railway" src="https://img.shields.io/badge/Runs_on-Railway-24292f?style=for-the-badge">

</div>

<br>

Small SEO agencies sell to dentists, plumbers and restaurants who don't know where they stand online. Yardstick scans a local business, scores it across five areas, and turns that score into a report the owner can understand on a phone screen. From there the agency sends a quote, gets it signed, does the work, and the same screen later shows the client what moved. It's one tool for the whole job: scan, report, quote, sign, deliver, track.

## What you can do with it

- Scan any local business across five areas: its Google profile, reviews and reputation, website health, map rankings on a grid around the business, and whether AI assistants recommend it.
- Share a clean public report that says plainly what it measured and what it couldn't.
- Put a free-scan widget on the agency's own site to capture leads.
- Turn a report into a quote, then have the client sign it online.
- Keep up with prospects through a follow-up queue that says who to call next.
- Track rankings over time, and give each client a portal to see their progress.
- Work through a delivery checklist for every signed client.
- See monthly recurring revenue, churn and sales commissions in one place.

## How it's built

Next.js 16 and TypeScript, Postgres in plain SQL, and Better Auth for sign-in. Scans are slow and call many outside services, so they never run inside a web request. They go into a Postgres job queue that a separate worker drains. The reasoning behind the main design decisions is in [`docs/teardown-findings.md`](docs/teardown-findings.md).

## Run it locally

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

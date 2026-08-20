# Why Yardstick is built the way it is

These seven decisions came out of a teardown of a shipped, vibe-coded local-SEO sales
platform. Each one is cheap to honour now and expensive to retrofit later. They are
settled — do not re-litigate them mid-build. Where a decision has a corresponding
guard in the codebase, it is named.

## 1. A scan cannot run inside a request

A full diagnostic is 60+ external calls. A 7x7 geogrid alone is 49 Maps queries per
keyword. Wall clock is 30 seconds to 3 minutes, individual providers fail, and every
run costs real money.

**Decision.** A Postgres job table is the source of truth, claimed with
`SELECT ... FOR UPDATE SKIP LOCKED`. Each pillar is an independent, idempotent job
writing its own row, so partial results stream in as they land and one dead provider
degrades a single pillar rather than the scan. QStash dispatches immediately; a cron
sweeper re-queues anything stuck. No step-function vendor: the jobs table has to exist
anyway for the credits ledger and audit trail, and owning it keeps retries inspectable
in SQL.

**In code.** `src/lib/jobs/queue.ts`, `migrations/0003_jobs.sql`.

## 2. Geogrid is the cost centre, not the build

Every grid point is a paid Maps query. Three keywords on a 7x7 grid is 147 requests per
scan. An unmetered free public audit is a way to lose money at scale, not a growth loop.

**Decision.** Buy the data, behind a `RankProvider` interface so a second source can be
added without touching callers. An append-only credits ledger from day one, debited per
scan and checked *before* dispatch, never after. Free public scans get one keyword on a
coarse 5x5 grid; the full grid is for authenticated runs. Cache on
(business, keyword, grid spec) with a freshness window.

## 3. The AI visibility score must survive being shown twice

This is the differentiator and the most fragile thing in the product. If an agency shows
a client 42/100 on Monday and 71/100 on Friday with nothing changed, the number is
worthless and so is the tool.

**Decision.** A fixed, versioned prompt set per vertical and locale. Every scan is
stamped with `prompt_set_version`, and old scans are never re-scored with a new set.
Multiple samples per prompt, lowest available temperature, and a score expressed as a
mention rate and mean position rather than a binary. Raw model responses stored
append-only so any score can be re-derived and defended. Reported per model. A golden
set with known ground truth runs as an eval on every prompt-set change. This is the one
place in the build where evals are not optional.

## 4. A sent proposal must never change under the client

If a public proposal reads prices live from the catalogue, editing a price silently
rewrites every quote already sitting in a prospect's inbox. That is a legal problem, not
a bug.

**Decision.** Totals are computed by a pure function and snapshotted onto the proposal
when it is sent: line items, prices, discounts, currency, cadence. The catalogue is a
source for building a quote, never for rendering a sent one. All money in integer minor
units, no floats, `NUMERIC` coerced at the boundary rather than trusted. The same rule
applies to reports and decks.

**In code.** `src/lib/money.ts`.

## 5. Multi-tenant now, billing later

Retrofitting tenancy is one of the few genuinely unrecoverable mistakes. Building
billing before there is a customer is one of the most common wasted months.

**Decision.** Every row carries `org_id` from the first migration, and every tenant
query goes through one owning module that takes an explicit org scope, with a test that
fails the build if a tenant table is reached without one. Ship to a single agency first.
The seam exists; the pricing page does not.

**In code.** `src/lib/db/scope.ts`, `src/lib/db/tenancy-guard.test.ts`.

## 6. A skeleton that can outlive its data is a bug

The direct lesson from the teardown's critical defect: a rate limit swallowed silently,
a Suspense boundary that never resolved, and a rep left staring at a shimmer in front of
a client with no error and no retry.

**Decision.** Built into the foundation before any feature ships. Every external call
gets a timeout, bounded retry with backoff, and a circuit breaker. Every Suspense
boundary gets an error boundary and a maximum duration, after which it becomes a real
error state with a retry control. A provider outage degrades one pillar and says so.

**In code.** `src/lib/external/call.ts`, `src/components/GuardedSuspense.tsx`,
`src/app/error.tsx`.

## 7. The free audit is an abuse surface

An unauthenticated endpoint that spends money on external APIs is an invitation. It is
also the top of the funnel, so it cannot be locked down into uselessness.

**Decision.** Turnstile on the form, rate limits on IP and email, and a two-tier result:
cheap pillars render immediately and free, while the geogrid and AI pillars unlock after
email verification. That gates the expensive work behind a verified contact.

## One external constraint to know before building

Google Places terms allow storing a `place_id` indefinitely but restrict caching most
other Place fields to roughly 30 days. Keep the place ID as our own key, snapshot the
rest for display, and refresh on read past the window. Do not design a permanent local
mirror of Places data; that is hard to unwind once reports depend on it.

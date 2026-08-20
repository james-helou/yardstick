-- Which pillars a scan dispatched. Finalisation waits for exactly these, so adding a
-- pillar in a later phase cannot strand the scans that are already in flight.
alter table scans add column if not exists expected_pillars text[] not null default '{}';

-- The geogrid pillar arrives in this migration, so the pillar vocabulary grows.
alter table pillar_results drop constraint if exists pillar_results_pillar_check;
alter table pillar_results add constraint pillar_results_pillar_check
  check (pillar in ('gbp', 'reputation', 'site_health', 'geogrid'));

-- Append-only. A balance is the sum of the rows, never a column someone can update.
-- Grants are positive, spends negative, refunds positive again, and every row says why.
create table if not exists credits_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,

  delta integer not null check (delta <> 0),
  reason text not null,
  scan_id uuid references scans (id) on delete set null,

  -- A retried dispatch must not charge twice. The key is what makes a spend at-most-once.
  idempotency_key text unique,

  created_at timestamptz not null default now()
);

create index if not exists credits_ledger_org_idx on credits_ledger (org_id, created_at desc);

-- Rank at each point of the grid. Append-only, because phase 9 is movement over time.
create table if not exists grid_points (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  scan_id uuid not null references scans (id) on delete cascade,

  keyword text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  -- Null means "not found in the results we looked at", which is worse than any number.
  rank integer check (rank > 0),

  created_at timestamptz not null default now()
);

create index if not exists grid_points_scan_idx on grid_points (scan_id, created_at desc);

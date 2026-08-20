-- A diagnostic run against one business. Many per business over time, because phase 9
-- is movement rather than a snapshot.
create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,

  status text not null default 'queued'
    check (status in ('queued', 'running', 'complete', 'failed')),

  -- Null until the last pillar lands. Renormalised over the pillars that actually ran,
  -- so a scan with an unconfigured provider still scores out of what it measured.
  score integer check (score between 0 and 100),

  requested_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scans_org_created_idx on scans (org_id, created_at desc);
create index if not exists scans_business_created_idx on scans (business_id, created_at desc);

-- Append-only. A retry writes a new row and the newest row per pillar wins, so the
-- history of what a provider said stays inspectable.
create table if not exists pillar_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  scan_id uuid not null references scans (id) on delete cascade,

  pillar text not null check (pillar in ('gbp', 'reputation', 'site_health')),
  status text not null check (status in ('ok', 'skipped', 'failed')),

  -- Present only when the pillar ran. A skipped pillar carries a reason instead.
  score integer check (score between 0 and 100),
  findings jsonb not null default '{}'::jsonb,
  detail text,

  created_at timestamptz not null default now()
);

create index if not exists pillar_results_scan_idx on pillar_results (scan_id, created_at desc);

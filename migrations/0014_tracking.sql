-- Recurring measurement. One schedule per business, because two schedules for the same
-- business is a bug that presents as a doubled bill.
create table if not exists scan_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  business_id uuid not null unique references businesses (id) on delete cascade,

  -- 'weekly', 'monthly', 'quarterly'
  cadence text not null check (cadence in ('weekly', 'monthly', 'quarterly')),
  -- When the next scan is owed. A worker claims by this column and moves it forward in
  -- the same transaction, so two workers cannot both run the same business.
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_scan_id uuid references scans (id) on delete set null,
  -- Paused rather than deleted: an agency that pauses a client for a month should not
  -- lose the cadence they chose.
  paused_at timestamptz,

  created_at timestamptz not null default now()
);

-- The worker's sweep is "what is owed, right now", across every workspace at once.
create index if not exists scan_schedules_due_idx on scan_schedules (next_run_at) where paused_at is null;
create index if not exists scan_schedules_org_idx on scan_schedules (org_id, created_at desc);

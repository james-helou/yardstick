-- What a signature turned into. One engagement per accepted proposal: the relationship
-- the agency now owes work against, and the monthly figure the portfolio is summed from.
create table if not exists engagements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  proposal_id uuid not null unique references proposals (id) on delete cascade,

  -- 'active', 'ended'
  status text not null default 'active' check (status in ('active', 'ended')),
  -- The recurring figure as signed, in integer minor units. Copied, never looked up:
  -- what the client pays does not change because a catalogue price did.
  currency text not null check (currency in ('EUR', 'CAD')),
  monthly_amount bigint not null default 0,
  one_time_amount bigint not null default 0,

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Why it ended, in the agency's own words. Kept because churn without a reason is a
  -- number nobody can act on.
  ended_reason text,

  created_at timestamptz not null default now()
);

create index if not exists engagements_org_idx on engagements (org_id, started_at desc);
create index if not exists engagements_business_idx on engagements (business_id);

-- The checklist. Generated from the proposal at signature, then worked by hand.
create table if not exists work_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  engagement_id uuid not null references engagements (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,

  title text not null,
  -- 'onboarding', 'setup', 'recurring'
  kind text not null check (kind in ('onboarding', 'setup', 'recurring')),
  -- 'todo', 'doing', 'done'
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  -- Null for recurring work, which is never late.
  due_at timestamptz,
  done_at timestamptz,
  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists work_items_engagement_idx on work_items (engagement_id, sort_order);
create index if not exists work_items_org_open_idx on work_items (org_id, due_at) where status <> 'done';

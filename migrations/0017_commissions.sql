-- Who sold it. Null on every proposal written before this migration, and a commission
-- with nobody to owe it to is simply not accrued, which is why this can be nullable.
alter table proposals add column if not exists owner_user_id uuid references "user" (id) on delete set null;

create index if not exists proposals_owner_idx on proposals (org_id, owner_user_id);

-- What a rep earns. One plan per workspace for now: the shape allows more, but a second
-- plan is a policy decision nobody has asked for yet.
create table if not exists commission_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,

  name text not null default 'Standard',
  -- Basis points, so 12.5% of a setup fee stays exact in storage.
  one_time_bp integer not null default 0 check (one_time_bp between 0 and 10000),
  monthly_bp integer not null default 0 check (monthly_bp between 0 and 10000),
  -- How many months of the retainer the rep earns on. One means the first month only.
  monthly_months integer not null default 1 check (monthly_months between 0 and 60),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commission_plans_one_per_org on commission_plans (org_id);

-- Append-only, like the credits ledger. What a rep is owed is the sum of their rows,
-- never a column that can drift away from the payments it is supposed to describe.
-- Accruals are positive, payments negative, and every row says which deal it came from.
create table if not exists commission_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  user_id uuid not null references "user" (id) on delete cascade,

  -- 'accrued' when a deal was signed, 'paid' when the rep was actually paid.
  kind text not null check (kind in ('accrued', 'paid')),
  currency text not null check (currency in ('EUR', 'CAD')),
  amount bigint not null check (amount <> 0),

  engagement_id uuid references engagements (id) on delete cascade,
  plan_id uuid references commission_plans (id) on delete set null,
  note text,

  created_at timestamptz not null default now()
);

-- One accrual per deal, whatever happens upstream. A retried signature, a second pass by
-- the agency, or two workers finishing together can never pay a rep twice for one deal.
create unique index if not exists commission_entries_one_accrual
  on commission_entries (engagement_id) where kind = 'accrued';

create index if not exists commission_entries_owed_idx on commission_entries (org_id, user_id, created_at desc);

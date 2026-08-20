create table jobs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  kind             text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'pending'
                   check (status in ('pending','running','done','failed')),
  attempts         int not null default 0,
  max_attempts     int not null default 5,
  run_after        timestamptz not null default now(),
  locked_by        text,
  locked_at        timestamptz,
  last_error       text,
  idempotency_key  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index jobs_idempotency_uniq
  on jobs (idempotency_key) where idempotency_key is not null;

create index jobs_claimable_idx
  on jobs (run_after) where status = 'pending';

create index jobs_org_idx on jobs (org_id);

create index jobs_stuck_idx
  on jobs (locked_at) where status = 'running';

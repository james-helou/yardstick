-- Every email we tried to send, kept whether it worked or not. Append-only: a failed
-- send is a row that says so, never a row that gets overwritten when a retry succeeds,
-- because "we emailed them twice and the first one bounced" is the thing an agency
-- actually needs to know.
create table if not exists email_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  lead_id uuid references leads (id) on delete set null,

  -- Which template produced it, so a change to the wording is visible in the history.
  template text not null,
  to_address text not null,
  subject text not null,

  -- 'sent', 'skipped' (no provider configured) or 'failed'.
  status text not null,
  -- The provider's own id when it accepted the message, its complaint when it did not.
  provider_id text,
  error text,

  created_at timestamptz not null default now()
);

create index if not exists email_deliveries_org_idx on email_deliveries (org_id, created_at desc);
create index if not exists email_deliveries_lead_idx on email_deliveries (lead_id, created_at desc);

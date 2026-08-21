-- The fingerprint of the terms as they were sent. Computed once, at send, and checked
-- again at signature: if a single cent, month or word had moved, the two would differ.
alter table proposals add column if not exists terms_fingerprint text;

-- One live link per proposal. The token is the authorization, so it is long, revocable,
-- and optionally dated.
create table if not exists proposal_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  proposal_id uuid not null unique references proposals (id) on delete cascade,

  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists proposal_links_org_idx on proposal_links (org_id, created_at desc);

-- Everything that happened to a proposal after it left, in the order it happened.
-- Append-only: this is the raw material the follow-up queue is derived from, and a
-- rewritten history would quietly change who a rep is told to call.
create table if not exists proposal_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  proposal_id uuid not null references proposals (id) on delete cascade,

  -- 'sent', 'viewed', 'accepted', 'declined'
  type text not null check (type in ('sent', 'viewed', 'accepted', 'declined')),
  -- A salted hash, never an address.
  ip_hash text,
  user_agent text,

  created_at timestamptz not null default now()
);

create index if not exists proposal_events_proposal_idx on proposal_events (proposal_id, created_at desc);
create index if not exists proposal_events_org_idx on proposal_events (org_id, created_at desc);

-- A typed signature, kept with everything needed to say what was signed and by whom.
-- One per proposal: a second answer does not overwrite the first.
create table if not exists proposal_signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  proposal_id uuid not null unique references proposals (id) on delete cascade,

  signer_name text not null,
  signer_email text not null,
  -- What the signer read, hashed. Stored next to the signature rather than looked up,
  -- so the proof does not depend on the proposal row still being intact.
  terms_fingerprint text not null,
  -- The totals as signed, in integer minor units.
  currency text not null check (currency in ('EUR', 'CAD')),
  one_time_total bigint not null,
  monthly_total bigint not null,
  contract_value bigint not null,

  ip_hash text,
  user_agent text,
  signed_at timestamptz not null default now()
);

create index if not exists proposal_signatures_org_idx on proposal_signatures (org_id, signed_at desc);

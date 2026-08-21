-- Client access. A grant is an invitation to see one business, and nothing else: the
-- client never joins the agency's workspace, has no membership, and cannot reach a
-- proposal, a price or another client.
create table if not exists portal_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,

  -- Who it was sent to. The invitation is addressed, and the token proves it arrived.
  email text not null,
  token text not null unique,
  -- Null until the invitation is opened by somebody signed in. Access requires this,
  -- so knowing an address is never enough on its own.
  user_id uuid references "user" (id) on delete cascade,
  accepted_at timestamptz,
  revoked_at timestamptz,

  invited_by uuid,
  created_at timestamptz not null default now(),

  unique (business_id, email)
);

create index if not exists portal_grants_org_idx on portal_grants (org_id, created_at desc);
create index if not exists portal_grants_user_idx on portal_grants (user_id) where revoked_at is null;

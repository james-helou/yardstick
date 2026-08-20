-- The businesses an agency is selling to, or already sells to.
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,

  name text not null,
  status text not null default 'prospect'
    check (status in ('prospect', 'client', 'archived')),

  -- Location. Every part is optional because a business can be entered from a business
  -- card long before anyone has looked it up.
  address_line text,
  locality text,
  region text,
  postal_code text,
  country char(2),
  latitude numeric(9, 6),
  longitude numeric(9, 6),

  primary_category text,
  website_url text,
  phone text,

  -- Set only when the record came from a places provider. Null for manual entry.
  place_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The same listing must not be added to one workspace twice. Different workspaces may
-- each hold the same business; they are separate tenants selling to the same prospect.
create unique index if not exists businesses_org_place_idx
  on businesses (org_id, place_id)
  where place_id is not null;

create index if not exists businesses_org_created_idx
  on businesses (org_id, created_at desc);

create index if not exists businesses_org_name_idx
  on businesses (org_id, lower(name));

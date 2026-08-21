-- A public key an agency embeds on their own website. It is not a secret: it names the
-- workspace a lead belongs to and nothing else. Abuse is held off by the rate limit and
-- the bot check, never by the key being hard to read.
create table if not exists widget_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,

  public_key text not null unique,
  label text not null default 'Website widget',
  active boolean not null default true,

  created_at timestamptz not null default now()
);

create index if not exists widget_keys_org_idx on widget_keys (org_id, created_at desc);

-- Somebody who asked for an audit. The business and the scan are created alongside, so
-- a lead is never a name in a box that nobody scored.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  widget_key_id uuid references widget_keys (id) on delete set null,
  -- Both nullable so the lead survives a business or scan being deleted later. The
  -- contact details are the part an agency cannot recreate.
  business_id uuid references businesses (id) on delete set null,
  scan_id uuid references scans (id) on delete set null,

  email text not null,
  contact_name text,
  phone text,
  source text not null default 'widget',

  -- A salted hash, never an address. Enough to rate limit one submitter, useless as a
  -- record of who visited.
  ip_hash text,

  created_at timestamptz not null default now()
);

create index if not exists leads_org_idx on leads (org_id, created_at desc);
create index if not exists leads_rate_idx on leads (ip_hash, created_at desc);

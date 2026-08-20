-- A report an agency can send to a prospect who has no login. The token is the
-- authorization, so it is long, random, and revocable. Nothing else about the workspace
-- is reachable through it.
create table if not exists report_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  scan_id uuid not null references scans (id) on delete cascade,

  token text not null unique,
  -- Both nullable: a link with neither is live forever until someone revokes it.
  expires_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now()
);

-- One live link per scan. A second share of the same scan reuses the first token rather
-- than leaving an older link the agency has forgotten about still working.
create unique index if not exists report_links_scan_idx on report_links (scan_id);
create index if not exists report_links_org_idx on report_links (org_id, created_at desc);

-- Append-only. A view count is the number of rows, never a column someone can update,
-- for the same reason a credit balance is: history is the product in phase 7.
create table if not exists report_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  report_link_id uuid not null references report_links (id) on delete cascade,

  -- Coarse on purpose. Enough to tell a rep "they opened it twice", not enough to be a
  -- tracking profile of somebody who never signed up for anything.
  referrer text,
  user_agent text,

  viewed_at timestamptz not null default now()
);

create index if not exists report_views_link_idx on report_views (report_link_id, viewed_at desc);

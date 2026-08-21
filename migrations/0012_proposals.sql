-- What an agency sells, in its own words and at its own prices. Editable, because a
-- price list that only a developer can change stops being true within a month.
create table if not exists service_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,

  name text not null,
  description text,
  -- 'one_time' or 'monthly'. Every deal shape is a combination of these two.
  billing text not null check (billing in ('one_time', 'monthly')),
  -- Integer minor units, always. A float never touches a money path.
  unit_amount bigint not null check (unit_amount >= 0),
  currency text not null check (currency in ('EUR', 'CAD')),
  default_quantity integer not null default 1 check (default_quantity >= 0),

  active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_items_org_idx on service_items (org_id, sort_order, created_at);

-- A quote for one prospect. While it is a draft it is recomputed from its lines every
-- time it is read. The moment it is sent it stops moving: the totals below are written
-- once and rendered forever after, so a catalogue price change cannot rewrite history.
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  business_id uuid references businesses (id) on delete set null,
  -- The audit that justified the price, when there was one.
  scan_id uuid references scans (id) on delete set null,

  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),

  currency text not null check (currency in ('EUR', 'CAD')),
  term_months integer not null default 0 check (term_months >= 0),
  free_months integer not null default 0 check (free_months >= 0),
  -- Basis points, so a discount of 12.5% is exact rather than a float.
  discount_bp integer not null default 0 check (discount_bp between 0 and 10000),
  tax_bp integer not null default 0 check (tax_bp between 0 and 10000),

  notes text,

  -- Written once, when it is sent. Null while it is a draft.
  sent_at timestamptz,
  one_time_total bigint,
  monthly_total bigint,
  contract_value bigint,

  expires_at timestamptz,
  decided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_org_idx on proposals (org_id, created_at desc);
create index if not exists proposals_business_idx on proposals (business_id, created_at desc);

-- A line carries its own name and price rather than pointing at the catalogue, so a
-- sent proposal reads the same next year even if the item behind it was renamed or
-- deleted. The catalogue reference is a convenience, never the source of the price.
create table if not exists proposal_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  proposal_id uuid not null references proposals (id) on delete cascade,
  service_item_id uuid references service_items (id) on delete set null,

  name text not null,
  billing text not null check (billing in ('one_time', 'monthly')),
  unit_amount bigint not null check (unit_amount >= 0),
  quantity integer not null default 1 check (quantity >= 0),
  discount_bp integer not null default 0 check (discount_bp between 0 and 10000),

  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists proposal_lines_proposal_idx on proposal_lines (proposal_id, sort_order, created_at);

-- The AI visibility pillar arrives in this migration, so the vocabulary grows again.
alter table pillar_results drop constraint if exists pillar_results_pillar_check;
alter table pillar_results add constraint pillar_results_pillar_check
  check (pillar in ('gbp', 'reputation', 'site_health', 'geogrid', 'ai_visibility'));

-- Every question we asked an assistant, and what it answered. Append-only, and stamped
-- with the prompt set version and the model, because a visibility score is only
-- comparable to another score produced by the same questions put to the same model.
-- Without those two stamps a trend line is just noise from a prompt someone reworded.
create table if not exists ai_probes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  scan_id uuid references scans (id) on delete cascade,

  prompt_set_version text not null,
  prompt_key text not null,
  prompt text not null,
  model text not null,

  -- Kept verbatim. When an agency disputes a finding, the answer itself is the evidence.
  response text not null,

  mentioned boolean not null,
  -- Null while still mentioned means named in prose but not in the ranked list.
  mention_position integer check (mention_position > 0),
  competitors text[] not null default '{}',

  created_at timestamptz not null default now()
);

create index if not exists ai_probes_business_idx on ai_probes (business_id, created_at desc);
create index if not exists ai_probes_scan_idx on ai_probes (scan_id, created_at desc);

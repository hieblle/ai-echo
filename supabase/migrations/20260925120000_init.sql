-- KI-Barometer — initial schema (Phase 4).
--
-- Source: SPEC.md §6 data model, adjusted per DECISIONS.md D1.17 / D3.3 / D4.x:
--   * every id is a random uuid (no sequential ids → submission groups are
--     not reconstructible from ordering);
--   * `responses` carries NO user/membership/respondent key and NO timestamp
--     (only the ISO week); `respondent_profiles` carries no timestamps either
--     (they would correlate with participations.completed_at);
--   * the respondent key is a keyed hash derived by the app — the membership
--     id never enters this table;
--   * k_anonymity_min >= 5 is enforced by the database;
--   * questions, templates and recommendation rules stay versioned in the
--     repo (lib/seed) — no tables for them yet (DECISIONS D4.1).
--
-- Row Level Security: enabled on every table. Members of an org may READ the
-- org context they belong to (org, departments, tools, own membership, cycles,
-- own participations). `responses`, `respondent_profiles` and
-- `recommendation_states` have NO policies at all: only the server (service
-- role) reads them and returns k-anonymised aggregates (SPEC §7.2).

-- --- Organizations & setup -------------------------------------------------

create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(name) between 1 and 200),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url            text,
  primary_color       text,
  hourly_rate_default numeric(10, 2) not null default 60 check (hourly_rate_default >= 0),
  locale              text not null default 'de' check (locale = 'de'),
  form_of_address     text not null default 'du' check (form_of_address in ('du', 'sie')),
  k_anonymity_min     integer not null default 5 check (k_anonymity_min >= 5),
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now()
);

create table public.departments (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name   text not null check (length(name) between 1 and 120),
  unique (org_id, name)
);

create table public.org_settings_tools (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations (id) on delete cascade,
  tool_value               text not null,
  tool_label               text not null,
  monthly_license_cost_eur numeric(10, 2) not null default 0 check (monthly_license_cost_eur >= 0),
  active                   boolean not null default true,
  unique (org_id, tool_value)
);

-- --- Memberships: the ONLY table that references a user ----------------------

create table public.memberships (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  email         text not null,
  department_id uuid references public.departments (id) on delete set null,
  role          text not null check (role in ('org_admin', 'team_lead', 'employee')),
  status        text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  invited_at    timestamptz not null default now(),
  joined_at     timestamptz,
  unique (org_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- --- Survey cycles & participation (who took part — never what was answered) --

create table public.survey_cycles (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  template_key     text not null check (template_key in ('onboarding', 'weekly', 'monthly', 'leadership')),
  iso_week         text not null check (iso_week ~ '^\d{4}-W\d{2}$'),
  period_start     date not null,
  period_end       date not null check (period_end >= period_start),
  status           text not null default 'open' check (status in ('scheduled', 'open', 'closed')),
  reminder_sent_at timestamptz,
  unique (org_id, template_key, iso_week)
);

create table public.participations (
  id            uuid primary key default gen_random_uuid(),
  cycle_id      uuid not null references public.survey_cycles (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  status        text not null default 'invited' check (status in ('invited', 'completed', 'skipped')),
  -- rounded to the hour by the app (SPEC §7.1)
  completed_at  timestamptz,
  unique (cycle_id, membership_id)
);

create index participations_membership_id_idx on public.participations (membership_id);

-- invited/completed per cycle — the only participation numbers the dashboard sees
create view public.participation_stats
  with (security_invoker = true) as
select
  c.org_id,
  c.id           as cycle_id,
  c.template_key,
  c.iso_week     as week,
  count(p.id)::integer as invited,
  count(p.id) filter (where p.status = 'completed')::integer as completed
from public.survey_cycles c
join public.participations p on p.cycle_id = c.id
group by c.id;

-- --- Respondent profiles: pseudonymous survey state ---------------------------

create table public.respondent_profiles (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  -- keyed hash (HMAC) derived by the app; the membership id is never stored here
  respondent_key       text not null,
  department_id        uuid references public.departments (id) on delete set null,
  role_scope           text not null check (role_scope in ('employee', 'lead')),
  tools_used           jsonb not null default '[]'::jsonb,
  uses_no_tools        boolean not null default false,
  ai_experience        text,
  question_history     jsonb,
  onboarding_completed boolean not null default false,
  unique (org_id, respondent_key)
);

-- --- Responses: anonymous by construction --------------------------------------

create table public.responses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  -- logical cycle key "<template>-<iso week>", also for onboarding (no cycle row)
  cycle_id      text not null,
  department_id uuid references public.departments (id) on delete set null,
  role_scope    text not null check (role_scope in ('employee', 'lead')),
  question_code text not null,
  answer        jsonb not null,
  created_week  text not null check (created_week ~ '^\d{4}-W\d{2}$')
  -- NO user_id, NO membership_id, NO respondent_key, NO created_at (SPEC §6/§7)
);

create index responses_org_week_idx on public.responses (org_id, created_week);

-- --- Recommendation decisions (flow F7) --------------------------------------

create table public.recommendation_states (
  org_id   uuid not null references public.organizations (id) on delete cascade,
  rule_key text not null,
  context  text not null default '',
  status   text not null check (status in ('open', 'done', 'dismissed')),
  primary key (org_id, rule_key, context)
);

-- --- Row Level Security ------------------------------------------------------

alter table public.organizations         enable row level security;
alter table public.departments           enable row level security;
alter table public.org_settings_tools    enable row level security;
alter table public.memberships           enable row level security;
alter table public.survey_cycles         enable row level security;
alter table public.participations        enable row level security;
alter table public.respondent_profiles   enable row level security;
alter table public.responses             enable row level security;
alter table public.recommendation_states enable row level security;

-- Anonymous (not logged in) clients read nothing at all.
revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- Orgs the calling user is a member of (security definer: memberships itself
-- is RLS-protected, the function must not recurse into its own policy).
create function public.member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id
  from public.memberships
  where user_id = auth.uid() and status <> 'removed'
$$;

revoke all on function public.member_org_ids() from public;
grant execute on function public.member_org_ids() to authenticated;

create policy "members read their organizations"
  on public.organizations for select to authenticated
  using (id in (select public.member_org_ids()));

create policy "members read their departments"
  on public.departments for select to authenticated
  using (org_id in (select public.member_org_ids()));

create policy "members read their org tools"
  on public.org_settings_tools for select to authenticated
  using (org_id in (select public.member_org_ids()));

create policy "users read their own memberships"
  on public.memberships for select to authenticated
  using (user_id = auth.uid());

create policy "members read their cycles"
  on public.survey_cycles for select to authenticated
  using (org_id in (select public.member_org_ids()));

create policy "users read their own participations"
  on public.participations for select to authenticated
  using (
    membership_id in (
      select id from public.memberships where user_id = auth.uid()
    )
  );

-- respondent_profiles, responses, recommendation_states: RLS on, no policies.
-- Only the service role (server) can read or write them.

-- --- Bookkeeping ---------------------------------------------------------------
-- Self-register, so a migration pasted into the SQL editor is recorded exactly
-- like one applied by `pnpm db:migrate` (which inserts the same row and
-- ignores the conflict).

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  statements text[],
  name       text
);
insert into supabase_migrations.schema_migrations (version, name)
values ('20260925120000', 'init')
on conflict (version) do nothing;

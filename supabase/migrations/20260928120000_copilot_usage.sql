-- KI-Barometer — Microsoft 365 Copilot telemetry (DECISIONS D4.10,
-- docs/COPILOT-INTEGRATION.md)
--
-- Two server-only tables:
--   * org_integrations: which external source an org is connected to. Holds
--     the Entra tenant id after admin consent — NEVER a client secret (those
--     live in the app's environment).
--   * copilot_usage_snapshots: ONE aggregate per org, week, source and
--     window. Counts only — no user principal name, no hash, no display
--     name: the per-user rows of Microsoft's report are consumed in memory
--     at import time and discarded (SPEC §7 anonymity by construction).
-- RLS on, no client policies: only the service role reads or writes them.
-- Applied with `pnpm db:migrate` or pasted into the SQL editor.

create table public.org_integrations (
  org_id          uuid not null references public.organizations (id) on delete cascade,
  provider        text not null check (provider in ('m365')),
  tenant_id       text,
  status          text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  names_concealed boolean,
  consented_at    timestamptz,
  last_sync_at    timestamptz,
  last_error      text,
  primary key (org_id, provider)
);

create table public.copilot_usage_snapshots (
  org_id                  uuid not null references public.organizations (id) on delete cascade,
  week                    text not null check (week ~ '^\d{4}-W\d{2}$'),
  source                  text not null check (source in ('csv', 'graph', 'viva')),
  period_days             integer not null check (period_days > 0),
  report_refresh_date     date not null,
  enabled_users           integer not null check (enabled_users >= 0),
  active_users            integer not null check (active_users >= 0),
  active_by_app           jsonb not null default '{}'::jsonb,
  prompts_total           integer,
  prompts_per_active_user numeric(10, 2),
  active_days_avg         numeric(6, 2),
  active_days_buckets     jsonb,
  assisted_hours          numeric(12, 2),
  imported_at             timestamptz not null default now(),
  primary key (org_id, week, source, period_days)
  -- NO user_principal_name, NO display_name, NO per-user rows (SPEC §7)
);

alter table public.org_integrations        enable row level security;
alter table public.copilot_usage_snapshots enable row level security;

-- org_integrations, copilot_usage_snapshots: RLS on, no policies.
-- Only the service role (server) can read or write them.

-- --- Bookkeeping (self-registration for SQL-editor runs) ----------------------

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  statements text[],
  name       text
);
insert into supabase_migrations.schema_migrations (version, name)
values ('20260928120000', 'copilot_usage')
on conflict (version) do nothing;

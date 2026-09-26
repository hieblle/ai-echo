-- KI-Barometer — licence seats per tool (DECISIONS D4.8)
--
-- The ROI measures savings per head and scales them to the licensed
-- headcount; `seats` is the number of licences behind the monthly cost.
-- NULL = unknown or flat-rate (the ROI then falls back to the invited
-- members). Applied with `pnpm db:migrate` or pasted into the SQL editor.

alter table public.org_settings_tools
  add column if not exists seats integer
  check (seats is null or seats > 0);

-- --- Bookkeeping (self-registration for SQL-editor runs) ----------------------

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  statements text[],
  name       text
);
insert into supabase_migrations.schema_migrations (version, name)
values ('20260926120000', 'tool_seats')
on conflict (version) do nothing;

-- Enable Row Level Security on athletes and weigh_ins.
--
-- ⚠️  DO NOT RUN THIS UNTIL:
--       1. The app with the login screen (v4.8.0+) is deployed, AND
--       2. At least one user exists in Supabase → Authentication → Users, AND
--       3. You have signed in successfully on at least one device.
--
--     Running it before then takes the app completely offline: every read and
--     write currently runs as the `anon` role, and with RLS on and no policy
--     for anon, that role can see and do nothing.
--
--     Rollback is db/002_rollback_rls.sql — one line per table, instant.
--
-- Verified behavior of this policy shape (tested in a rolled-back transaction
-- against this database on 2026-08-07):
--     anon           -> 0 rows visible, INSERT denied
--     authenticated  -> all rows visible, INSERT allowed

begin;

alter table public.athletes  enable row level security;
alter table public.weigh_ins enable row level security;

-- Any signed-in user is a coach with full access. There is no per-athlete or
-- per-coach ownership model in this app: athletes do not have accounts, and the
-- kiosk is a shared device signed in as the program. Adding ownership columns
-- later would refine `using (...)` here without changing the app.
drop policy if exists "authenticated_full_access" on public.athletes;
create policy "authenticated_full_access" on public.athletes
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated_full_access" on public.weigh_ins;
create policy "authenticated_full_access" on public.weigh_ins
  for all
  to authenticated
  using (true)
  with check (true);

commit;

-- Confirm: expect rls_enabled = true and 2 policies.
select
  (select bool_and(relrowsecurity) from pg_class
     where relname in ('athletes','weigh_ins') and relnamespace='public'::regnamespace) as rls_enabled,
  (select count(*) from pg_policies
     where schemaname='public' and tablename in ('athletes','weigh_ins')) as policies;

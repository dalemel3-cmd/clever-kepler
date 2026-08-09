-- 004: Repair the live defects found by auditing the running project.
--
-- Safe to run more than once. Every statement is additive or idempotent; nothing
-- here drops data. Rollback is 004_rollback below (kept in 004_rollback.sql).
--
-- ---------------------------------------------------------------------------
-- 1. alert_status is locked: RLS on, zero policies  (CRITICAL)
-- ---------------------------------------------------------------------------
-- Supabase installs an event trigger (public.rls_auto_enable) that enables RLS on
-- every new table in `public` at CREATE TABLE time. alert_status was created for
-- the v4.6.0 Alerts rework and picked that up automatically, but 003 only wrote
-- policies for athletes, weigh_ins and coaches. A table with RLS enabled and no
-- policy denies everything, so acknowledge/resolve has never once reached the
-- cloud - the table still holds 0 rows. The app swallows the error and falls back
-- to localStorage, so each device kept its own private copy of alert state and no
-- coach ever saw another's. Same policy shape as the other tables.

alter table public.alert_status enable row level security;

drop policy if exists approved_coaches_full_access on public.alert_status;
create policy approved_coaches_full_access
  on public.alert_status
  for all
  to authenticated
  using (is_approved_coach())
  with check (is_approved_coach());

-- ---------------------------------------------------------------------------
-- 2. Realtime has never fired: supabase_realtime publication is empty
-- ---------------------------------------------------------------------------
-- The app subscribes to postgres_changes on weigh_ins, athletes and alert_status,
-- but no table was ever added to the publication those events are sourced from,
-- so not one of those subscriptions has ever delivered a row. Cross-device sync
-- has been carried entirely by the adaptive poll (and by the broadcast channel,
-- which does not depend on the publication and does work). Adding the tables
-- turns push back on; the poll stays as the safety net and backs off to 60s once
-- the socket reports SUBSCRIBED, so this reduces polling rather than adding load.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='weigh_ins') then
    alter publication supabase_realtime add table public.weigh_ins;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='athletes') then
    alter publication supabase_realtime add table public.athletes;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='alert_status') then
    alter publication supabase_realtime add table public.alert_status;
  end if;
end $$;

-- Realtime respects RLS, so a subscriber only receives rows its policies allow.
-- REPLICA IDENTITY FULL makes the old row available on UPDATE/DELETE events too,
-- which is what the app's payload handling expects.
alter table public.weigh_ins replica identity full;
alter table public.athletes replica identity full;
alter table public.alert_status replica identity full;

-- ---------------------------------------------------------------------------
-- 3. weigh_ins.athlete_id has no index
-- ---------------------------------------------------------------------------
-- Every profile view, baseline scan and per-athlete report filters on athlete_id,
-- and the foreign key itself is uncovered. At 1,340 rows Postgres still seq-scans
-- happily; this is cheap insurance before the other sports are loaded and the
-- table grows an order of magnitude.

create index if not exists weigh_ins_athlete_id_idx on public.weigh_ins (athlete_id);
create index if not exists weigh_ins_created_at_idx on public.weigh_ins (created_at desc);
create index if not exists coaches_approved_by_idx on public.coaches (approved_by);

-- ---------------------------------------------------------------------------
-- 4. Policy performance: re-evaluated auth call per row
-- ---------------------------------------------------------------------------
-- `user_id = auth.uid()` re-runs auth.uid() for every row scanned. Wrapping it in
-- a scalar subquery lets the planner evaluate it once (Supabase linter 0003).

drop policy if exists "read own coach row" on public.coaches;
create policy "read own coach row"
  on public.coaches
  for select
  to authenticated
  using (user_id = (select auth.uid()));

analyze public.weigh_ins;
analyze public.athletes;

-- ---------------------------------------------------------------------------
-- 5. rpe CHECK constraint contradicts the rpeScaleMax setting
-- ---------------------------------------------------------------------------
-- The column hardcodes 1..10 while Settings allows a scale maximum up to 100.
-- Raising the setting would make every RPE save fail at the database with no
-- indication in the UI. Widen the constraint so the setting is the real limit
-- and the app's own validation stays the gate; the column still refuses
-- nonsense. Nothing changes at the default scale of 10.

alter table public.weigh_ins drop constraint if exists weigh_ins_rpe_check;
alter table public.weigh_ins add constraint weigh_ins_rpe_check
  check (rpe is null or (rpe >= 1 and rpe <= 100));

-- ---------------------------------------------------------------------------
-- 6. Function grants and duplicate coach SELECT policies
-- ---------------------------------------------------------------------------
-- handle_new_user and rls_auto_enable are trigger / event-trigger functions that were
-- left executable by PUBLIC. Neither is called by the app, and both fire in a context
-- that does not depend on these grants. is_approved_coach() is evaluated inside every
-- RLS policy, so `authenticated` MUST keep EXECUTE - only anon is revoked there.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.is_approved_coach() from anon;

-- Two permissive SELECT policies on coaches meant both ran for every row. Folded into
-- one, keeping the "pending user can read their own row" behaviour the app relies on to
-- tell someone they are awaiting approval rather than showing them an empty app.
drop policy if exists "approved coaches read all" on public.coaches;
drop policy if exists "read own coach row" on public.coaches;
create policy "coaches read"
  on public.coaches for select to authenticated
  using (user_id = (select auth.uid()) or (select is_approved_coach()));

drop policy if exists "approved coaches delete" on public.coaches;
create policy "approved coaches delete"
  on public.coaches for delete to authenticated
  using (
    (select is_approved_coach())
    and (user_id <> (select auth.uid())
         or (select count(*) from public.coaches c where c.approved) > 1)
  );

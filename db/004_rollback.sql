-- Rollback for 004. Returns the database to exactly the state the audit found it in.
-- Note that state included a broken alert_status, so this is a rollback, not a fix.

-- 1. Re-lock alert_status (RLS stays on, policy removed = deny all).
drop policy if exists approved_coaches_full_access on public.alert_status;

-- 2. Remove the tables from the realtime publication.
alter publication supabase_realtime drop table public.weigh_ins;
alter publication supabase_realtime drop table public.athletes;
alter publication supabase_realtime drop table public.alert_status;

alter table public.weigh_ins replica identity default;
alter table public.athletes replica identity default;
alter table public.alert_status replica identity default;

-- 3. Drop the added indexes.
drop index if exists public.weigh_ins_athlete_id_idx;
drop index if exists public.weigh_ins_created_at_idx;
drop index if exists public.coaches_approved_by_idx;

-- 4. Restore the original (per-row auth call) policy.
drop policy if exists "read own coach row" on public.coaches;
create policy "read own coach row"
  on public.coaches
  for select
  to authenticated
  using (user_id = auth.uid());

-- 5. Restore the original rpe range.
alter table public.weigh_ins drop constraint if exists weigh_ins_rpe_check;
alter table public.weigh_ins add constraint weigh_ins_rpe_check
  check (rpe is null or (rpe >= 1 and rpe <= 10));

-- 6. Restore function grants and the split coach SELECT policies.
grant execute on function public.handle_new_user() to public, anon, authenticated;
grant execute on function public.rls_auto_enable() to public, anon, authenticated;
grant execute on function public.is_approved_coach() to anon;

drop policy if exists "coaches read" on public.coaches;
create policy "approved coaches read all"
  on public.coaches for select to authenticated using (is_approved_coach());
create policy "read own coach row"
  on public.coaches for select to authenticated using (user_id = auth.uid());

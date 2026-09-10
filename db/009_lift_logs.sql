-- 009: lift_logs table for the Lift Tracker (Bench, Squat, Deadlift, Hang Clean,
-- Power Clean by default; a coach can add more from Settings -> Lift Types).
--
-- Same shape/reasoning as performance_tests (db/006): a separate table rather than
-- more nullable columns on weigh_ins, because a lift result is tied to a lift session
-- rather than a daily check-in, and several lifts can be logged per visit.
--
-- `lift_type` is text, not an enum - a coach adding "Front Squat" in Settings should
-- not require a schema migration. `weight_lbs` and `reps` are stored separately
-- (rather than pre-computing a 1RM) so the raw set an athlete actually did is never
-- lost; any "best lift" estimate is computed in the app from these two columns.

create table if not exists public.lift_logs (
  id uuid primary key default extensions.uuid_generate_v4(),
  athlete_id uuid references public.athletes(id),
  athlete_name text,
  sport text,
  lift_type text not null,        -- e.g. 'Bench', 'Squat', 'Deadlift'
  weight_lbs numeric not null,
  reps integer not null,
  source text not null default 'manual' check (source in ('manual', 'kiosk')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists lift_logs_athlete_id_idx on public.lift_logs (athlete_id);
create index if not exists lift_logs_created_at_idx on public.lift_logs (created_at desc);

-- RLS: locked by default the moment this table is created (public.rls_auto_enable -
-- see docs/HANDOFF.md §3). The policy is written in the SAME migration that creates
-- the table, which is the rule that alert_status violated for four releases.
alter table public.lift_logs enable row level security;

drop policy if exists approved_coaches_full_access on public.lift_logs;
create policy approved_coaches_full_access
  on public.lift_logs
  for all
  to authenticated
  using (is_approved_coach())
  with check (is_approved_coach());

-- Realtime, matching weigh_ins/athletes/alert_status/performance_tests so a save on
-- one device pushes to others rather than waiting on the poll.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='lift_logs') then
    alter publication supabase_realtime add table public.lift_logs;
  end if;
end $$;
alter table public.lift_logs replica identity full;

analyze public.lift_logs;

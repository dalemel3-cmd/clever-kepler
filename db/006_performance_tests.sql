-- 006: performance_tests table for Speed & Power (10yd fly, laser time, and eventually
-- Plyomat jump data).
--
-- Deliberately a separate table from weigh_ins, not more nullable columns on it. Test
-- results are a different shape: sparse, tied to test days rather than daily, and
-- several metrics can exist per session. See docs/HANDOFF.md §9 and §5 for the full
-- reasoning - §5 is the account of what the null-heavy weigh_ins row class already cost
-- this app three times over.
--
-- `test_type` and `metric` are text rather than an enum on purpose: a coach's next test
-- (a vertical jump, a broad jump, a Plyomat-specific metric) should be addable from the
-- app without a schema migration. `source` distinguishes a hand-entered time from a
-- future Plyomat CSV import without needing a second table.

create table if not exists public.performance_tests (
  id uuid primary key default extensions.uuid_generate_v4(),
  athlete_id uuid references public.athletes(id),
  athlete_name text,
  sport text,
  test_type text not null,        -- e.g. '10yd_fly', 'laser_time'
  metric numeric not null,        -- the recorded value (seconds, for both test types today)
  unit text not null default 'sec',
  source text not null default 'manual' check (source in ('manual', 'plyomat')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists performance_tests_athlete_id_idx on public.performance_tests (athlete_id);
create index if not exists performance_tests_created_at_idx on public.performance_tests (created_at desc);

-- RLS: locked by default the moment this table is created (public.rls_auto_enable - see
-- docs/HANDOFF.md §3). The policy is written in the SAME migration that creates the
-- table, which is the rule that alert_status violated for four releases.
alter table public.performance_tests enable row level security;

drop policy if exists approved_coaches_full_access on public.performance_tests;
create policy approved_coaches_full_access
  on public.performance_tests
  for all
  to authenticated
  using (is_approved_coach())
  with check (is_approved_coach());

-- Realtime, matching weigh_ins/athletes/alert_status (db/004 §2) so a save on one
-- device pushes to others rather than waiting on the poll.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='performance_tests') then
    alter publication supabase_realtime add table public.performance_tests;
  end if;
end $$;
alter table public.performance_tests replica identity full;

analyze public.performance_tests;

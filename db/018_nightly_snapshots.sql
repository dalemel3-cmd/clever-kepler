-- 018: nightly snapshots inside the database (v5.16.1, docs/HANDOFF.md §156).
--
-- The project is on Supabase's free plan, which has no automatic backups: until this, a bad
-- bulk edit or delete could not be undone. Every night at 08:20 UTC (2:20 am Central, 3:20
-- in summer) each table is copied into backups.snapshots as one JSON value per table
-- (Postgres compresses it; about 130 KB a night against the plan's 500 MB).
-- Kept: the last 14 nights, plus the earliest snapshot of each month for about 6 months.
-- The first snapshot of a day is never overwritten, so running take_snapshot() again
-- after something went wrong cannot replace last night's good copy with the damaged one.
--
-- The `backups` schema is not exposed through the API, has row level security with no
-- policies, and all rights are revoked from the API roles: only the database owner (the
-- Supabase dashboard / SQL editor) can read it or run its functions.
--
-- This protects against mistakes inside the app. It does NOT protect against losing the
-- whole project: for that, Settings > Offline data recovery > Download full backup.
--
-- What is stored:
--   select taken_on, table_name, row_count from backups.snapshots order by 1 desc, 2;
-- Put back rows that were DELETED since a snapshot (owner, SQL editor; a production write):
--   select * from backups.restore_missing('2026-11-10');
-- It inserts rows that are in that night's snapshot and no longer in the table, parents
-- first (athletes and programs, then check-ins, lifts, tests, alerts, workout sessions),
-- and leaves every row that still exists exactly as it is now (one exception: a workout
-- session whose program was deleted gets its program link back). So it does not undo an EDIT:
-- for that, read the old values out of the snapshot and update those rows by hand, e.g.
--   select r.* from jsonb_populate_recordset(null::public.weigh_ins,
--     (select data from backups.snapshots where taken_on = '2026-11-10' and table_name = 'weigh_ins')) r
--   where r.athlete_id = '<athlete id>';
-- (`coaches` is snapshotted for reference but not restored: it points at sign-in accounts.)

create schema if not exists backups;
revoke all on schema backups from public, anon, authenticated;

create table if not exists backups.snapshots (
  taken_on   date        not null,
  table_name text        not null,
  row_count  integer     not null,
  data       jsonb       not null,
  taken_at   timestamptz not null default now(),
  primary key (taken_on, table_name)
);
alter table backups.snapshots enable row level security;
revoke all on backups.snapshots from public, anon, authenticated;

create or replace function backups.take_snapshot()
returns void
language plpgsql
set search_path = ''
as $$
declare
  t     text;
  n     integer;
  d     jsonb;
  today date := (now() at time zone 'America/Chicago')::date;
begin
  foreach t in array array['athletes', 'weigh_ins', 'lift_logs', 'performance_tests',
                           'programs', 'workout_sessions', 'alert_status', 'coaches']
  loop
    execute format('select count(*), coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t)
      into n, d;
    insert into backups.snapshots (taken_on, table_name, row_count, data)
    values (today, t, n, d)
    on conflict (taken_on, table_name) do nothing; -- the day's first copy stays
  end loop;
  -- Keep 14 nights, and each month's earliest snapshot for about 6 months.
  delete from backups.snapshots s
   where s.taken_on < today - 14
     and not (s.taken_on >= today - 186
              and s.taken_on = (select min(m.taken_on) from backups.snapshots m
                                 where date_trunc('month', m.taken_on) = date_trunc('month', s.taken_on)));
end;
$$;
revoke all on function backups.take_snapshot() from public, anon, authenticated;

create or replace function backups.restore_missing(p_date date)
returns table (restored_table text, restored_rows integer)
language plpgsql
set search_path = ''
as $$
declare
  d jsonb;
  n integer;
begin
  if not exists (select 1 from backups.snapshots s where s.taken_on = p_date) then
    raise exception 'No snapshot for %', p_date;
  end if;

  select s.data into d from backups.snapshots s where s.taken_on = p_date and s.table_name = 'athletes';
  insert into public.athletes
  select r.* from jsonb_populate_recordset(null::public.athletes, d) r
  on conflict do nothing;
  get diagnostics n = row_count; restored_table := 'athletes'; restored_rows := n; return next;

  select s.data into d from backups.snapshots s where s.taken_on = p_date and s.table_name = 'programs';
  insert into public.programs
  select r.* from jsonb_populate_recordset(null::public.programs, d) r
  on conflict do nothing;
  get diagnostics n = row_count; restored_table := 'programs'; restored_rows := n; return next;

  -- Children: only rows whose athlete exists now (it was just put back if it was deleted).
  select s.data into d from backups.snapshots s where s.taken_on = p_date and s.table_name = 'weigh_ins';
  insert into public.weigh_ins
  select r.* from jsonb_populate_recordset(null::public.weigh_ins, d) r
   where r.athlete_id is null or exists (select 1 from public.athletes a where a.id = r.athlete_id)
  on conflict do nothing;
  get diagnostics n = row_count; restored_table := 'weigh_ins'; restored_rows := n; return next;

  select s.data into d from backups.snapshots s where s.taken_on = p_date and s.table_name = 'lift_logs';
  insert into public.lift_logs
  select r.* from jsonb_populate_recordset(null::public.lift_logs, d) r
   where r.athlete_id is null or exists (select 1 from public.athletes a where a.id = r.athlete_id)
  on conflict do nothing;
  get diagnostics n = row_count; restored_table := 'lift_logs'; restored_rows := n; return next;

  select s.data into d from backups.snapshots s where s.taken_on = p_date and s.table_name = 'performance_tests';
  insert into public.performance_tests
  select r.* from jsonb_populate_recordset(null::public.performance_tests, d) r
   where r.athlete_id is null or exists (select 1 from public.athletes a where a.id = r.athlete_id)
  on conflict do nothing;
  get diagnostics n = row_count; restored_table := 'performance_tests'; restored_rows := n; return next;

  select s.data into d from backups.snapshots s where s.taken_on = p_date and s.table_name = 'alert_status';
  insert into public.alert_status
  select r.* from jsonb_populate_recordset(null::public.alert_status, d) r
   where r.athlete_id is null or exists (select 1 from public.athletes a where a.id = r.athlete_id)
  on conflict do nothing;
  get diagnostics n = row_count; restored_table := 'alert_status'; restored_rows := n; return next;

  -- A session keeps its program link only if that program exists now.
  select s.data into d from backups.snapshots s where s.taken_on = p_date and s.table_name = 'workout_sessions';
  insert into public.workout_sessions
  select r.* from jsonb_populate_recordset(null::public.workout_sessions,
    (select coalesce(jsonb_agg(case when e->>'program_id' is not null
                                     and not exists (select 1 from public.programs p where p.id = (e->>'program_id')::uuid)
                                    then e || '{"program_id": null}'::jsonb else e end), '[]'::jsonb)
       from jsonb_array_elements(d) e)) r
   where exists (select 1 from public.athletes a where a.id = r.athlete_id)
  on conflict do nothing;
  get diagnostics n = row_count; restored_table := 'workout_sessions'; restored_rows := n; return next;

  -- Sessions that still exist lost their program link when their program was deleted
  -- (the link is set to null): link them again now that the program is back.
  update public.workout_sessions w
     set program_id = (e->>'program_id')::uuid
    from jsonb_array_elements(d) e
   where w.id = (e->>'id')::uuid and w.program_id is null and e->>'program_id' is not null
     and exists (select 1 from public.programs p where p.id = (e->>'program_id')::uuid);
  get diagnostics n = row_count; restored_table := 'workout_sessions linked to their program again'; restored_rows := n; return next;
end;
$$;
revoke all on function backups.restore_missing(date) from public, anon, authenticated;

-- The nightly job (pg_cron is included in the free plan). Scheduling again under the same
-- name replaces the job.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('hpd-nightly-snapshot', '20 8 * * *', $$select backups.take_snapshot()$$);

-- The first snapshot, now.
select backups.take_snapshot();

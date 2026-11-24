-- 020: GPS sessions from Titan (v5.16.7, docs/HANDOFF.md §162). Football, one row per athlete
-- per day, loaded from the Titan "synced data" CSV on Performance > GPS.
--
-- (athlete_id, session_date) is unique, so loading the same days again replaces them.
-- Same access rule as every data table: approved coaches only; anon has nothing.

create table if not exists public.gps_sessions (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references public.athletes(id) on delete cascade,
  session_date      date not null,
  distance_yd       numeric,   -- GPS Distance, yards
  top_speed_mph     numeric,   -- GPS Top Speed, mi/hr
  accel_count       integer,   -- high-speed accelerations (4-8 m/s^2)
  decel_count       integer,   -- high-speed decelerations (4-8 m/s^2)
  high_speed_yd     numeric,   -- speed band 12.5-22.4 mph, yards
  personal_band_yd  numeric,   -- personal band: 80% or faster of the athlete's top mph, yards
  source            text not null default 'titan',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (athlete_id, session_date)
);

create index if not exists gps_sessions_date_idx on public.gps_sessions (session_date desc);

alter table public.gps_sessions enable row level security;
revoke all on public.gps_sessions from anon;
grant select, insert, update, delete on public.gps_sessions to authenticated;

drop policy if exists approved_coaches_full_access on public.gps_sessions;
create policy approved_coaches_full_access on public.gps_sessions
  for all to authenticated
  using (public.is_approved_coach())
  with check (public.is_approved_coach());

-- ---------------------------------------------------------------------------
-- Backups: the nightly in-database copy (db/018) now includes gps_sessions, and
-- backups.restore_missing puts back deleted GPS rows too. Same functions as db/018 with
-- gps_sessions added; nothing else about them changes.
-- ---------------------------------------------------------------------------
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
                           'programs', 'workout_sessions', 'alert_status', 'gps_sessions', 'coaches']
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

  select s.data into d from backups.snapshots s where s.taken_on = p_date and s.table_name = 'gps_sessions';
  if d is not null then
    insert into public.gps_sessions
    select r.* from jsonb_populate_recordset(null::public.gps_sessions, d) r
     where exists (select 1 from public.athletes a where a.id = r.athlete_id)
    on conflict do nothing;
    get diagnostics n = row_count; restored_table := 'gps_sessions'; restored_rows := n; return next;
  end if;

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

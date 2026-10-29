-- 015: workout_sessions - each athlete's workout on the rack tablets (v5.13.0,
-- docs/HANDOFF.md §141), plus the program query the tablets use to offer this week's
-- and next week's days.
--
-- One row = one athlete doing one program day on one date. The tablet keeps the live
-- session on the device (localStorage) and saves it here as it goes, so an athlete can
-- move racks, coaches can see who did which day and when, and completed volume can be
-- compared with prescribed. Logged barbell sets are still lift_logs rows; `sets` only
-- records which of the day's sets they were (with the lift_logs id).
--   sets: { blockId: { setIndex: { w, r, liftId } } }
--   done: { blockId | blockId_setIndex: true }   (checked-off work)

create table if not exists public.workout_sessions (
  id uuid primary key default extensions.uuid_generate_v4(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  athlete_name text,
  sport text,
  session_date date not null,            -- Central date it was done
  program_id uuid references public.programs(id) on delete set null,
  day_id text not null,
  program_name text,
  week_label text,
  planned_date date,                     -- the day's date in the program (null = undated)
  day_label text,
  started_at timestamptz,
  finished_at timestamptz,
  minutes integer,
  rpe numeric,
  sets jsonb not null default '{}'::jsonb,
  done jsonb not null default '{}'::jsonb,
  items_done integer not null default 0,
  items_total integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, session_date, day_id)
);

create index if not exists workout_sessions_date_idx on public.workout_sessions (session_date desc);

-- RLS in the same migration that creates the table (docs/HANDOFF.md §3).
alter table public.workout_sessions enable row level security;

drop policy if exists approved_coaches_full_access on public.workout_sessions;
create policy approved_coaches_full_access
  on public.workout_sessions
  for all
  to authenticated
  using (is_approved_coach())
  with check (is_approved_coach());

-- The tablets' programs: active team programs with a day dated in [d_from, d_to], plus
-- active team programs with no dated days at all touched since `undated_since` (a week
-- programmed as Day 1-3 without dates). Runs as the caller, so RLS applies.
create or replace function public.programs_for_tablets(d_from date, d_to date, undated_since timestamptz)
returns setof public.programs
language sql
stable
security invoker
set search_path = public
as $$
  select p.*
  from public.programs p
  where p.archived_at is null
    and p.sport is not null
    and (
      exists (select 1 from jsonb_array_elements(p.days) d
              where nullif(d->>'date', '') between d_from::text and d_to::text)
      or (p.updated_at >= undated_since
          and not exists (select 1 from jsonb_array_elements(p.days) d where coalesce(d->>'date', '') <> ''))
    )
$$;

grant execute on function public.programs_for_tablets(date, date, timestamptz) to authenticated;

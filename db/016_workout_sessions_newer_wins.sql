-- 016: workout_sessions keeps the newest save; advisor fixes (v5.15.4, docs/HANDOFF.md §149).
--
-- 1. Newer save wins. The rack tablets queue session saves while offline and upsert them
--    when the signal is back. A plain upsert keeps whichever write arrives last, so a
--    tablet that reconnects late could replace a newer save from another rack (athlete
--    moved racks and finished there) with its older copy. A save older than the row
--    already stored is now ignored. `updated_at` is set by the tablet when the change is
--    made (src/features/programs/sessionCloud.js sessionRow).
create or replace function public.workout_sessions_keep_newer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at is not null and old.updated_at is not null and new.updated_at < old.updated_at then
    return null; -- keep the stored (newer) row
  end if;
  return new;
end;
$$;

drop trigger if exists workout_sessions_keep_newer on public.workout_sessions;
create trigger workout_sessions_keep_newer
  before update on public.workout_sessions
  for each row execute function public.workout_sessions_keep_newer();

-- 2. Index the program_id foreign key (performance advisor: unindexed foreign key).
create index if not exists workout_sessions_program_id_idx on public.workout_sessions (program_id);

-- 3. Pin search_path on the athletes metadata trigger (security advisor: mutable
--    search_path). It only uses built-in types and functions, so an empty path is safe.
alter function public.sync_athlete_metadata() set search_path = '';

-- 017: workout_sessions newer-wins, safe against a wrong tablet clock (v5.15.4,
-- docs/HANDOFF.md §149). Follow-up to 016, from the pre-release review.
--
-- `updated_at` comes from the tablet's own clock. With 016 alone, a tablet whose clock ran
-- ahead could stamp a save in the future and every later save for that athlete and day
-- (from correctly-set racks) would be ignored. Now a stamp in the future is replaced with the
-- database's time, on insert and update, before the newer-wins check. (A slow clock is
-- handled in the app: a tablet that picks up a session saved by another rack stamps its
-- saves after that rack's.)
create or replace function public.workout_sessions_keep_newer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at is null or new.updated_at > now() then
    new.updated_at := now();
  end if;
  if tg_op = 'UPDATE' and old.updated_at is not null and new.updated_at < old.updated_at then
    return null; -- keep the stored (newer) row
  end if;
  return new;
end;
$$;

drop trigger if exists workout_sessions_keep_newer on public.workout_sessions;
create trigger workout_sessions_keep_newer
  before insert or update on public.workout_sessions
  for each row execute function public.workout_sessions_keep_newer();

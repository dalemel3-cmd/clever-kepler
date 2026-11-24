-- 019: settings shared by every device (v5.16.6, docs/HANDOFF.md §161). The lift list.
--
-- Until now the lift buttons (Settings > Lift Tracker > Lift Types) were stored in each
-- device's own browser, so an iPad whose list lacked Front Squat logged Squat. One row here
-- holds the list for all devices; each device reads it when the app opens and when it comes
-- back to the front, and keeps the last copy for when it is offline.
--
-- Same access rule as every data table: signed-in, approved coaches (the shared login
-- counts) can read and change it.

create table if not exists public.shared_settings (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.shared_settings enable row level security;
revoke all on public.shared_settings from anon;
grant select, insert, update on public.shared_settings to authenticated; -- Supabase grants this by default; stated so it doesn't depend on that

drop policy if exists approved_coaches_full_access on public.shared_settings;
create policy approved_coaches_full_access on public.shared_settings
  for all to authenticated
  using (public.is_approved_coach())
  with check (public.is_approved_coach());

-- The list the weight room uses now (production lift_logs, 2026-11-24: Front Squat, Bench,
-- Hang Clean, Squat, Deadlift, Power Clean, Belt Squat). Not overwritten if it exists.
insert into public.shared_settings (key, value)
values ('lift_types', '["Bench", "Front Squat", "Squat", "Belt Squat", "Deadlift", "Hang Clean", "Power Clean"]'::jsonb)
on conflict (key) do nothing;

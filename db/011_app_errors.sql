-- 011: production error capture. Until now the app had zero visibility into real
-- runtime errors - a coach could hit a crash or a silent exception and the only way
-- anyone found out was them noticing and sending a screenshot. This table is the
-- landing spot for a lightweight client-side reporter (src/errorReporting.js) that
-- catches window.onerror, unhandledrejection, and the top-level React ErrorBoundary,
-- and writes a row here instead of the error only ever reaching the browser console.
--
-- Deliberately minimal columns - this is a triage feed, not an APM product. No
-- resolved/status workflow: rows are read, understood, and left alone (or deleted in
-- bulk) rather than tracked through a lifecycle.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  source text,          -- 'window.onerror' | 'unhandledrejection' | 'react-boundary'
  url text,              -- location.href at the time of the error
  user_agent text,
  app_version text,
  coach_email text,      -- best-effort, from the signed-in session; never PII beyond that
  created_at timestamptz not null default now()
);

create index if not exists app_errors_created_at_idx on public.app_errors (created_at desc);

-- RLS: locked in the same migration that creates the table (docs/HANDOFF.md §3's rule).
alter table public.app_errors enable row level security;

-- Any signed-in (approved) coach's browser can report an error it just saw - insert
-- only, no read-back requirement for the reporting path itself.
drop policy if exists approved_coaches_can_report on public.app_errors;
create policy approved_coaches_can_report
  on public.app_errors
  for insert
  to authenticated
  with check (is_approved_coach());

-- Reading/triaging errors is a coach-review action, same gate as everything else.
drop policy if exists approved_coaches_can_read on public.app_errors;
create policy approved_coaches_can_read
  on public.app_errors
  for select
  to authenticated
  using (is_approved_coach());

drop policy if exists approved_coaches_can_delete on public.app_errors;
create policy approved_coaches_can_delete
  on public.app_errors
  for delete
  to authenticated
  using (is_approved_coach());

-- No realtime publication: this is a periodic triage feed, not something that needs
-- to push live into an open tab the moment a row lands.

analyze public.app_errors;

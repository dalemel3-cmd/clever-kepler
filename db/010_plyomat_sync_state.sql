-- 010: single-row checkpoint for the live "Sync from Plyomat" pull (v4.36.0). Distinct
-- from the CSV import path, which has no checkpoint at all - a coach re-uploading the
-- same file is deduped per-row via the plyomat: notes prefix instead (see
-- plyomatImport.js). The API sync fetches by `?since=<timestamp>`, so it needs somewhere
-- durable to remember the last successful sync's cutoff, shared across every coach's
-- device rather than living in one browser's localStorage.
--
-- A dedicated singleton table rather than a generic key/value settings table: this app
-- has no KV table precedent (every other feature gets its own table), and one value does
-- not justify designing a schema for many.

create table if not exists public.plyomat_sync_state (
  id boolean primary key default true check (id),  -- singleton row: exactly one exists
  last_synced_at timestamptz,
  last_synced_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.plyomat_sync_state (id) values (true) on conflict (id) do nothing;

-- RLS: locked in the same migration that creates the table (docs/HANDOFF.md §3's rule -
-- see db/006's comment for the history of why this is non-negotiable).
alter table public.plyomat_sync_state enable row level security;

drop policy if exists approved_coaches_full_access on public.plyomat_sync_state;
create policy approved_coaches_full_access
  on public.plyomat_sync_state
  for all
  to authenticated
  using (is_approved_coach())
  with check (is_approved_coach());

-- No realtime publication: this is read once before a sync click and written once after
-- a successful one, not something another open device needs pushed to it live.

analyze public.plyomat_sync_state;

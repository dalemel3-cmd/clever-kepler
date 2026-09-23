-- 012: index tuning from the Supabase performance advisor (v5.1.9).
--
-- Added: a covering index for plyomat_sync_state.last_synced_by -> auth.users, so a
-- user delete doesn't sequentially scan this table to check the foreign key.
--
-- Dropped: alert_status_status_idx. The app only ever reads alert_status in full
-- (useAlertStatus selects '*' and upserts on alert_key), never filters by status, so
-- this index is pure write overhead.
--
-- Deliberately kept despite "unused" advisor notes:
--   coaches_approved_by_idx, lift_logs_athlete_id_idx - foreign-key covering indexes;
--     they're used on parent deletes, which just haven't happened yet.
--   app_errors_created_at_idx - the daily error-check routine filters on created_at;
--     the table is simply still too small for the planner to pick it.
create index if not exists plyomat_sync_state_last_synced_by_idx
  on public.plyomat_sync_state (last_synced_by);

drop index if exists public.alert_status_status_idx;

-- Rollback for 006. Drops performance_tests entirely, including all recorded test data.
-- Confirm that is actually intended before running this - unlike the other rollbacks in
-- this directory, there is no partial undo: the table did not exist before 006.

alter publication supabase_realtime drop table if exists public.performance_tests;
drop table if exists public.performance_tests;

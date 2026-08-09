-- Coach accounts with approval gating.
--
-- REPLACES db/001_enable_rls.sql — run this one instead. It enables RLS *and*
-- restricts access to approved coaches, so signing up is no longer the same thing
-- as getting in. Safe to run whether or not 001 was applied already.
--
-- The model:
--   * Anyone may create an account (Supabase sign-up).
--   * Creating an account grants NOTHING. A row lands in public.coaches with
--     approved = false, and every policy below requires approved = true.
--   * An approved coach approves the next one, from Settings in the app.
--
-- ⚠️  BOOTSTRAP: the first coach must be approved by hand — see the final step.
--     Miss it and nobody can approve anybody, and the app locks everyone out.
--     (Recoverable: run the same UPDATE, or db/002_rollback_rls.sql.)

begin;

-- ---------------------------------------------------------------------------
-- 1. Roster of people allowed in
-- ---------------------------------------------------------------------------
create table if not exists public.coaches (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  approved     boolean     not null default false,
  requested_at timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid references auth.users(id) on delete set null
);

comment on table public.coaches is
  'Access control for the app. A row with approved=false is a pending request and grants nothing.';

-- ---------------------------------------------------------------------------
-- 2. New sign-ups automatically appear as pending requests
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coaches (user_id, email, approved)
  values (new.id, new.email, false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this migration (they'd otherwise have no
-- row at all, and no way to even appear in the approval list).
insert into public.coaches (user_id, email, approved)
select id, email, false from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. The access test
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the check itself isn't subject to the coaches policies,
-- which would otherwise recurse.
create or replace function public.is_approved_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coaches
    where user_id = auth.uid() and approved
  );
$$;

revoke all on function public.is_approved_coach() from public;
grant execute on function public.is_approved_coach() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Data policies — approved coaches only
-- ---------------------------------------------------------------------------
alter table public.athletes  enable row level security;
alter table public.weigh_ins enable row level security;
alter table public.coaches   enable row level security;

drop policy if exists "authenticated_full_access" on public.athletes;
drop policy if exists "approved_coaches_full_access" on public.athletes;
create policy "approved_coaches_full_access" on public.athletes
  for all to authenticated
  using (public.is_approved_coach())
  with check (public.is_approved_coach());

drop policy if exists "authenticated_full_access" on public.weigh_ins;
drop policy if exists "approved_coaches_full_access" on public.weigh_ins;
create policy "approved_coaches_full_access" on public.weigh_ins
  for all to authenticated
  using (public.is_approved_coach())
  with check (public.is_approved_coach());

-- ---------------------------------------------------------------------------
-- 5. Policies on the coaches table itself
-- ---------------------------------------------------------------------------
-- Everyone signed in can read their own row, so a pending user can be told they
-- are pending rather than shown an empty, broken-looking app.
drop policy if exists "read own coach row" on public.coaches;
create policy "read own coach row" on public.coaches
  for select to authenticated
  using (user_id = auth.uid());

-- Approved coaches can see the full list, in order to approve others.
drop policy if exists "approved coaches read all" on public.coaches;
create policy "approved coaches read all" on public.coaches
  for select to authenticated
  using (public.is_approved_coach());

-- Approved coaches can approve/rename others.
drop policy if exists "approved coaches update" on public.coaches;
create policy "approved coaches update" on public.coaches
  for update to authenticated
  using (public.is_approved_coach())
  with check (public.is_approved_coach());

-- Approved coaches can remove a request or revoke someone. The guard stops the
-- last approved coach from deleting themselves and locking everyone out.
drop policy if exists "approved coaches delete" on public.coaches;
create policy "approved coaches delete" on public.coaches
  for delete to authenticated
  using (
    public.is_approved_coach()
    and (
      user_id <> auth.uid()
      or (select count(*) from public.coaches where approved) > 1
    )
  );

-- No direct inserts: rows arrive only via the sign-up trigger.
drop policy if exists "no direct insert" on public.coaches;

commit;

-- ---------------------------------------------------------------------------
-- 6. BOOTSTRAP — approve the first coach. EDIT THE EMAIL, then run.
-- ---------------------------------------------------------------------------
update public.coaches c
set approved = true,
    approved_at = now(),
    approved_by = c.user_id
where c.email = 'masonm@shilohsaints.org';

-- Confirm: expect at least one row with approved = true.
select email, approved, requested_at, approved_at from public.coaches order by requested_at;

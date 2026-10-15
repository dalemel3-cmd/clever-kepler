-- 014: programs table for the in-app Program Builder and the Weight Room Card
-- (design handoff "HPD Athlete Reports" #3, docs/HANDOFF.md §120).
--
-- One row = one week of training (2-4 sessions). The sessions live in `days` as JSON
-- rather than child tables: a program is always loaded, edited and printed as a whole,
-- coaches add/reorder exercises freely, and nothing queries inside it. Shape:
--   days: [{ date, focus, warmTitle, warm: [text], finTitle, fin: [text],
--            blocks: [{ code, name, note, maxKey, rx, sets: [{ reps, pct, tempo }], velocity }] }]
--   max_map: { clean: 'Hang Clean', bench: 'Bench', squat: 'Front Squat', dl: 'Deadlift', ohp: '' }
--     which Lift Tracker lift each %-of-max key reads the athlete's best est. 1RM from.

create table if not exists public.programs (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  week_label text,
  phase text,
  sport text,
  days jsonb not null default '[]'::jsonb,
  max_map jsonb not null default '{}'::jsonb,
  archived_at timestamptz,          -- set by Archive: hidden from the list, kept for reprints
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists programs_updated_at_idx on public.programs (updated_at desc);
-- in case the table was created from an earlier copy of this file
alter table public.programs add column if not exists archived_at timestamptz;

-- RLS in the same migration that creates the table (docs/HANDOFF.md §3).
alter table public.programs enable row level security;

drop policy if exists approved_coaches_full_access on public.programs;
create policy approved_coaches_full_access
  on public.programs
  for all
  to authenticated
  using (is_approved_coach())
  with check (is_approved_coach());

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='programs') then
    alter publication supabase_realtime add table public.programs;
  end if;
end $$;
alter table public.programs replica identity full;

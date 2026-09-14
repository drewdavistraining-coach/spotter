-- Spotter sync: one-time database setup.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to re-run.

-- Every record from every device-side store (clients, sessions, drills, ...) is one row here.
-- `data` is the record as the app stores it; deleted records stay as tombstones so the delete syncs.
create table if not exists public.records (
  user_id    uuid        not null references auth.users on delete cascade,
  store      text        not null,
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  modified   bigint      not null default 0,          -- device time of the edit (ms); newest edit wins
  updated_at timestamptz not null default clock_timestamp(), -- server time; devices pull "everything since"
  primary key (user_id, store, id)
);

create index if not exists records_user_updated on public.records (user_id, updated_at);

-- Newest edit wins: an older edit arriving late (e.g. from a phone that was offline) is ignored.
create or replace function public.records_newest_wins() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.modified < old.modified then
    return null; -- keep the newer row that's already here
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_newest_wins on public.records;
create trigger records_newest_wins before insert or update on public.records
  for each row execute function public.records_newest_wins();

-- Row-level security: a signed-in user can only ever see and change their own rows.
alter table public.records enable row level security;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Voice memo audio: private bucket, files stored under <user id>/<memo id>.
insert into storage.buckets (id, name, public)
values ('memos', 'memos', false)
on conflict (id) do nothing;

drop policy if exists "own memo audio" on storage.objects;
create policy "own memo audio" on storage.objects
  for all to authenticated
  using (bucket_id = 'memos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'memos' and (storage.foldername(name))[1] = auth.uid()::text);

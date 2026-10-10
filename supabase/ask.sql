-- Ask Spotter: a daily cap so a stuck loop or a curious afternoon can't run up a bill.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

create table if not exists public.ask_usage (
  user_id uuid    not null references auth.users on delete cascade,
  day     date    not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ask_usage enable row level security;

drop policy if exists "own ask usage" on public.ask_usage;
create policy "own ask usage" on public.ask_usage
  for select to authenticated
  using (user_id = auth.uid());

-- Counts one question against today's allowance and says whether it's allowed.
-- Runs as the definer so the app can only ever go through this door.
create or replace function public.bump_ask_usage(p_limit integer)
returns table (allowed boolean, used integer, daily_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.ask_usage (user_id, day, count)
  values (auth.uid(), current_date, 0)
  on conflict (user_id, day) do nothing;

  select count into current_count
  from public.ask_usage
  where user_id = auth.uid() and day = current_date
  for update;

  if current_count >= p_limit then
    return query select false, current_count, p_limit;
    return;
  end if;

  update public.ask_usage
  set count = count + 1
  where user_id = auth.uid() and day = current_date
  returning count into current_count;

  return query select true, current_count, p_limit;
end $$;

-- Supabase grants new functions to every role by default, so revoke the anonymous one explicitly:
-- without this, a stranger can invoke it (it fails harmlessly, but it shouldn't be reachable).
revoke all on function public.bump_ask_usage(integer) from public;
revoke all on function public.bump_ask_usage(integer) from anon;
grant execute on function public.bump_ask_usage(integer) to authenticated;

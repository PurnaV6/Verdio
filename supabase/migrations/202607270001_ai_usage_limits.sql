-- Per-user and global daily usage counters for the AI assistant (/api/chat).
-- The tables have RLS enabled and NO client policies: nothing can read or write
-- them directly. The only way in is consume_ai_quota(), which runs as the table
-- owner and always keys on auth.uid(), so a user can only ever touch their own row.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('advisor', 'insights')),
  count integer not null default 0 check (count >= 0),
  last_call timestamptz,
  primary key (user_id, day, kind)
);

create table if not exists public.ai_usage_global (
  day date not null,
  kind text not null check (kind in ('advisor', 'insights')),
  count integer not null default 0 check (count >= 0),
  primary key (day, kind)
);

alter table public.ai_usage enable row level security;
alter table public.ai_usage_global enable row level security;

revoke all on table public.ai_usage from public, anon, authenticated;
revoke all on table public.ai_usage_global from public, anon, authenticated;

-- Returns 'ok', 'user_limit', 'global_limit' or 'too_fast'.
-- The caller supplies the limits (so they can be tuned with environment variables),
-- but they are clamped to hard ceilings below: a signed-in user calling this function
-- directly cannot raise their own allowance beyond the ceiling.
create or replace function public.consume_ai_quota(p_kind text, p_user_max int, p_global_max int, p_min_gap_seconds int)
returns text language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  user_ceiling int;
  global_ceiling int;
  user_max int;
  global_max int;
  gap int := least(greatest(coalesce(p_min_gap_seconds, 3), 1), 60);
  usage_row public.ai_usage%rowtype;
  updated int;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_kind = 'advisor' then user_ceiling := 100; global_ceiling := 2000;
  elsif p_kind = 'insights' then user_ceiling := 20; global_ceiling := 400;
  else raise exception 'Unknown usage kind'; end if;
  user_max := least(greatest(coalesce(p_user_max, 0), 1), user_ceiling);
  global_max := least(greatest(coalesce(p_global_max, 0), 1), global_ceiling);

  insert into public.ai_usage_global(day, kind, count) values (today, p_kind, 0) on conflict do nothing;
  insert into public.ai_usage(user_id, day, kind, count) values (uid, today, p_kind, 0) on conflict do nothing;

  -- Row lock on the caller's own row makes concurrent requests from one user queue up.
  select * into usage_row from public.ai_usage where user_id = uid and day = today and kind = p_kind for update;
  if usage_row.last_call is not null and usage_row.last_call > now() - make_interval(secs => gap) then
    return 'too_fast';
  end if;
  if usage_row.count >= user_max then return 'user_limit'; end if;

  -- Atomic conditional increment of the shared budget.
  update public.ai_usage_global set count = count + 1 where day = today and kind = p_kind and count < global_max;
  get diagnostics updated = row_count;
  if updated = 0 then return 'global_limit'; end if;

  update public.ai_usage set count = count + 1, last_call = now() where user_id = uid and day = today and kind = p_kind;
  return 'ok';
end $$;

revoke all on function public.consume_ai_quota(text, int, int, int) from public, anon;
grant execute on function public.consume_ai_quota(text, int, int, int) to authenticated;

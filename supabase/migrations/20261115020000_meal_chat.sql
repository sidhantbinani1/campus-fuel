-- Daily message counter for the signed-in meal chat.
-- Nothing reads or writes this table except the function below, so a student
-- can only ever spend their own allowance.
create table public.meal_chat_usage (
 user_id uuid not null references auth.users on delete cascade,
 used_on date not null,
 messages integer not null default 0 check (messages >= 0),
 primary key (user_id, used_on)
);
alter table public.meal_chat_usage enable row level security;
revoke all on public.meal_chat_usage from anon,authenticated;

-- Counts one message for the caller and returns how many are left today.
-- Raises once the caller has used the daily allowance.
create function public.use_meal_chat() returns integer language plpgsql security definer set search_path='' as $$
declare
 daily_limit constant integer := 20;
 today date := (now() at time zone 'America/Los_Angeles')::date;
 used integer;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
 insert into public.meal_chat_usage as u (user_id,used_on,messages) values ((select auth.uid()),today,1)
 on conflict (user_id,used_on) do update set messages=u.messages+1 where u.messages<daily_limit
 returning u.messages into used;
 if used is null then raise exception 'Daily chat limit reached'; end if;
 return daily_limit-used;
end $$;
revoke all on function public.use_meal_chat() from public,anon;
grant execute on function public.use_meal_chat() to authenticated;

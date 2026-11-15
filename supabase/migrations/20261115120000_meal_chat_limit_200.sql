-- Raise the meal chat allowance from 20 to 200 messages per student per day
-- (temporary, for the demo and early testing). Same function, new limit.
create or replace function public.use_meal_chat() returns integer language plpgsql security definer set search_path='' as $$
declare
 daily_limit constant integer := 200;
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

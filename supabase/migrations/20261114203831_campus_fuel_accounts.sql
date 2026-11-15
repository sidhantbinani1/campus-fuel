-- Account data is readable only by its owner. All mutations use validated RPCs.
create table public.schools (id text primary key, name text not null, menus boolean not null default false);
create table public.meal_catalog (id text primary key, school_id text not null references public.schools, snapshot jsonb not null);
create table public.profiles (
 user_id uuid primary key references auth.users on delete cascade,
 school text not null references public.schools,
 nickname text not null default '' check (nickname='' or nickname ~ '^[A-Za-z0-9 _-]{2,24}$'),
 participating boolean not null default true, show_nickname boolean not null default false,
 terms_version text not null, accepted_at timestamptz not null default now(),
 check (not show_nickname or length(nickname)>=2)
);
create table public.fuel_states (
 user_id uuid primary key references auth.users on delete cascade,
 revision integer not null default 0, goals jsonb not null default '{}', daily_goals jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table public.meal_logs (
 user_id uuid not null references auth.users on delete cascade,
 entry_id text not null check(length(entry_id) between 1 and 200),
 meal_id text not null references public.meal_catalog, school_id text not null references public.schools,
 logged_on date not null, servings numeric not null default 1 check(servings between 0.25 and 10),
 snapshot jsonb not null, primary key(user_id,entry_id)
);
create index meal_logs_campus_date on public.meal_logs(school_id,logged_on,meal_id);
create table public.favorites (
 user_id uuid not null references auth.users on delete cascade,
 meal_id text not null references public.meal_catalog, school_id text not null references public.schools,
 saved_on date not null, primary key(user_id,school_id,meal_id)
);
create index favorites_campus_date on public.favorites(school_id,saved_on,meal_id);
create table public.legal_acceptances (
 user_id uuid not null references auth.users on delete cascade,
 version text not null, accepted_at timestamptz not null default now(), primary key(user_id,version)
);
alter table public.schools enable row level security;
alter table public.meal_catalog enable row level security;
alter table public.profiles enable row level security;
alter table public.fuel_states enable row level security;
alter table public.meal_logs enable row level security;
alter table public.favorites enable row level security;
alter table public.legal_acceptances enable row level security;
create policy schools_read on public.schools for select to authenticated using (true);
create policy catalog_read on public.meal_catalog for select to authenticated using (true);
create policy profile_owner on public.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy state_owner on public.fuel_states for select to authenticated using ((select auth.uid())=user_id);
create policy logs_owner on public.meal_logs for select to authenticated using ((select auth.uid())=user_id);
create policy favorites_owner on public.favorites for select to authenticated using ((select auth.uid())=user_id);
create policy acceptance_owner on public.legal_acceptances for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.schools,public.meal_catalog,public.profiles,public.fuel_states,public.meal_logs,public.favorites,public.legal_acceptances from anon,authenticated;
grant select on public.schools,public.meal_catalog,public.profiles,public.fuel_states,public.meal_logs,public.favorites,public.legal_acceptances to authenticated;

create function public.save_fuel_profile(p_school text,p_nickname text,p_participating boolean,p_show_nickname boolean,p_terms_version text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_terms_version is distinct from '2026-11-14' then raise exception 'Current terms must be accepted'; end if;
 insert into public.profiles(user_id,school,nickname,participating,show_nickname,terms_version)
 values(auth.uid(),p_school,trim(p_nickname),p_participating,p_show_nickname,p_terms_version)
 on conflict(user_id) do update set school=excluded.school,nickname=excluded.nickname,participating=excluded.participating,show_nickname=excluded.show_nickname,terms_version=excluded.terms_version,accepted_at=case when public.profiles.terms_version=excluded.terms_version then public.profiles.accepted_at else now() end;
 insert into public.legal_acceptances(user_id,version) values(auth.uid(),p_terms_version) on conflict do nothing;
end $$;

create function public.save_fuel_state(expected_revision integer,p_goals jsonb,p_daily_goals jsonb,p_entries jsonb,p_favorites jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_revision integer; item jsonb; v_school text; v_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select school into v_school from public.profiles where user_id=auth.uid() and terms_version='2026-11-14';
 if v_school is null then raise exception 'Finish account setup first'; end if;
 if jsonb_typeof(p_goals) is distinct from 'object' or jsonb_typeof(p_daily_goals) is distinct from 'object' or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_typeof(p_favorites) is distinct from 'array' then raise exception 'Invalid account data';end if;
 if octet_length(p_goals::text)>10000 or octet_length(p_daily_goals::text)>2000000 or jsonb_array_length(p_entries)>20000 or jsonb_array_length(p_favorites)>1000 then raise exception 'Account payload exceeds supported size';end if;
 insert into public.fuel_states(user_id) values(auth.uid()) on conflict do nothing;
 select revision into v_revision from public.fuel_states where user_id=auth.uid() for update;
 if v_revision is distinct from expected_revision then raise exception 'Revision conflict'; end if;
 for item in select value from jsonb_array_elements(p_entries) loop
  if not exists(select 1 from public.meal_catalog where id=item->>'meal_id' and school_id=item->>'school_id') then raise exception 'Unknown campus meal';end if;
  if item->>'logged_on' is null or (item->>'logged_on')::date>v_today+1 or (item->>'logged_on')::date<'2000-01-01' then raise exception 'Invalid meal date';end if;
  if exists(select 1 from public.meal_logs where user_id=auth.uid() and entry_id=item->>'entry_id' and (meal_id is distinct from item->>'meal_id' or school_id is distinct from item->>'school_id')) then raise exception 'A logged meal cannot change identity or campus';end if;
  insert into public.meal_logs(user_id,entry_id,meal_id,school_id,logged_on,servings,snapshot)
  select auth.uid(),item->>'entry_id',m.id,m.school_id,(item->>'logged_on')::date,(item->>'servings')::numeric,m.snapshot - 'components' - 'description' from public.meal_catalog m where m.id=item->>'meal_id'
  on conflict(user_id,entry_id) do update set logged_on=excluded.logged_on,servings=excluded.servings;
 end loop;
 delete from public.meal_logs where user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_entries) e where e->>'entry_id'=entry_id);
 for item in select value from jsonb_array_elements(p_favorites) loop
  if not exists(select 1 from public.meal_catalog where id=item->>'meal_id' and school_id=item->>'school_id') then raise exception 'Unknown favorite';end if;
  -- First save date is server-owned; a repeated save cannot reset ranking dates.
  insert into public.favorites(user_id,meal_id,school_id,saved_on) values(auth.uid(),item->>'meal_id',item->>'school_id',v_today) on conflict do nothing;
 end loop;
 delete from public.favorites f where f.user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_favorites) e where e->>'meal_id'=f.meal_id and e->>'school_id'=f.school_id);
 update public.fuel_states set revision=v_revision+1,goals=p_goals,daily_goals=p_daily_goals,updated_at=now() where user_id=auth.uid();
 return v_revision+1;
end $$;

create function public.fuel_board(p_period text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school text; v_start date; v_today date:=(now() at time zone 'America/Los_Angeles')::date; result jsonb;
begin
 select school into v_school from public.profiles where user_id=auth.uid() and participating and terms_version='2026-11-14';
 if v_school is null then raise exception 'Sign in and enable participation to view the Fuel Board';end if;
 v_start:=case p_period when 'day' then v_today when 'week' then date_trunc('week',v_today)::date when 'month' then date_trunc('month',v_today)::date else null end;
 if v_start is null then raise exception 'Invalid ranking period';end if;
 with eaters as (
  select l.meal_id,count(distinct l.user_id)::int n,array_agg(distinct p.nickname order by p.nickname) filter(where p.show_nickname and p.nickname<>'') names
  from public.meal_logs l join public.profiles p on p.user_id=l.user_id and p.participating
  where l.school_id=v_school and l.logged_on between v_start and v_today group by l.meal_id
 ), savers as (
  select f.meal_id,count(distinct f.user_id)::int n,array_agg(distinct p.nickname order by p.nickname) filter(where p.show_nickname and p.nickname<>'') names
  from public.favorites f join public.profiles p on p.user_id=f.user_id and p.participating
  where f.school_id=v_school and f.saved_on between v_start and v_today group by f.meal_id
 ), ranked as (
  select m.id,m.snapshot->>'name' name,m.snapshot->>'location' location,
  case when coalesce(e.n,0)>=5 then e.n else 0 end eaters,case when coalesce(s.n,0)>=5 then s.n else 0 end savers,
  case when coalesce(e.n,0)>=5 then to_jsonb(coalesce(e.names[1:8],array[]::text[])) when coalesce(s.n,0)>=5 then to_jsonb(coalesce(s.names[1:8],array[]::text[])) else '[]'::jsonb end nicknames
  from public.meal_catalog m left join eaters e on e.meal_id=m.id left join savers s on s.meal_id=m.id
  where m.school_id=v_school and (coalesce(e.n,0)>=5 or coalesce(s.n,0)>=5)
 ), locations as (
  select l.snapshot->>'location' location,count(distinct l.user_id)::int students
  from public.meal_logs l join public.profiles p on p.user_id=l.user_id and p.participating
  where l.school_id=v_school and l.logged_on between v_start and v_today
  group by l.snapshot->>'location' having count(distinct l.user_id)>=5
 ) select jsonb_build_object('start_date',v_start,'meals',coalesce((select jsonb_agg(to_jsonb(r) order by eaters desc,savers desc,id) from ranked r),'[]'::jsonb),'locations',coalesce((select jsonb_agg(to_jsonb(l) order by students desc,location) from locations l),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.delete_fuel_account() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 delete from auth.users where id=auth.uid();
end $$;
revoke all on function public.save_fuel_profile(text,text,boolean,boolean,text),public.save_fuel_state(integer,jsonb,jsonb,jsonb,jsonb),public.fuel_board(text),public.delete_fuel_account() from public,anon;
grant execute on function public.save_fuel_profile(text,text,boolean,boolean,text),public.save_fuel_state(integer,jsonb,jsonb,jsonb,jsonb),public.fuel_board(text),public.delete_fuel_account() to authenticated;

-- One statement gives profile, revision and records a consistent database snapshot.
create function public.load_fuel_account() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 return (select jsonb_build_object(
 'profile',(select to_jsonb(p) from public.profiles p where user_id=auth.uid()),
 'state',(select to_jsonb(s) from public.fuel_states s where user_id=auth.uid()),
 'logs',coalesce((select jsonb_agg(to_jsonb(l) order by logged_on,entry_id) from public.meal_logs l where user_id=auth.uid()),'[]'::jsonb),
 'favorites',coalesce((select jsonb_agg(to_jsonb(f)) from public.favorites f where user_id=auth.uid()),'[]'::jsonb)));
end $$;
revoke all on function public.load_fuel_account() from public,anon;
grant execute on function public.load_fuel_account() to authenticated;

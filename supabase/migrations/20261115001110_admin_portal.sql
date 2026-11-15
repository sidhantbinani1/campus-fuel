-- Admin membership and inquiry records are never exposed as Data API tables.
create schema if not exists admin_private;
revoke all on schema admin_private from public, anon, authenticated;
create table admin_private.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 reason text not null default 'Owner approved'
);
create table admin_private.university_inquiries (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 full_name text not null check(length(full_name) between 2 and 120),
 email text not null check(length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 university text not null check(length(university) between 2 and 160),
 role text not null check(length(role) between 2 and 120),
 provider text not null check(provider in ('Not sure / not applicable','Grubhub','Transact','Other')),
 message text not null check(length(message) between 10 and 4000),
 scope text not null default '' check(length(scope)<=500),
 status text not null default 'new' check(status in ('new','contacted','qualified','closed')),
 notes text not null default '' check(length(notes)<=4000)
);
create index inquiries_created_idx on admin_private.university_inquiries(created_at desc,id);
create index inquiries_status_created_idx on admin_private.university_inquiries(status,created_at desc,id);
create table admin_private.inquiry_rate_limits (
 key text not null, bucket timestamptz not null, count integer not null, primary key(key,bucket)
);
create table admin_private.admin_audit_log (
 id uuid primary key default gen_random_uuid(), actor uuid references auth.users(id) on delete set null,
 occurred_at timestamptz not null default now(), action text not null, inquiry_id uuid,
 detail jsonb not null default '{}'
);
alter table admin_private.admin_users enable row level security;
alter table admin_private.university_inquiries enable row level security;
alter table admin_private.inquiry_rate_limits enable row level security;
alter table admin_private.admin_audit_log enable row level security;
revoke all on all tables in schema admin_private from public,anon,authenticated;

create function admin_private.require_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from admin_private.admin_users a join auth.users u on u.id=a.user_id where a.user_id=auth.uid() and u.deleted_at is null and u.email_confirmed_at is not null) then
  raise exception 'Admin access required' using errcode='42501';
 end if;
end $$;
revoke all on function admin_private.require_admin() from public,anon,authenticated;

create function public.admin_access() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from admin_private.admin_users a join auth.users u on u.id=a.user_id where a.user_id=auth.uid() and u.deleted_at is null and u.email_confirmed_at is not null);
$$;
create function public.admin_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform admin_private.require_admin();
 select jsonb_build_object(
  'total_accounts',count(*),
  'confirmed_accounts',count(*) filter(where u.email_confirmed_at is not null),
  'new_7_days',count(*) filter(where u.created_at>=now()-interval '7 days'),
  'new_30_days',count(*) filter(where u.created_at>=now()-interval '30 days'),
  'completed_setup',count(p.user_id) filter(where p.terms_version='2026-11-14'),
  'pending_setup',count(*)-count(p.user_id) filter(where p.terms_version='2026-11-14')
 ) into result from auth.users u left join public.profiles p on p.user_id=u.id where u.deleted_at is null and u.email is not null;
 return result || jsonb_build_object(
  'total_inquiries',(select count(*) from admin_private.university_inquiries),
  'new_inquiries',(select count(*) from admin_private.university_inquiries where status='new'),
  'schools',coalesce((select jsonb_agg(t order by t.accounts desc,t.school) from (
   select s.name school,count(*) accounts from public.profiles p join auth.users u on u.id=p.user_id join public.schools s on s.id=p.school where u.deleted_at is null and u.email is not null group by s.name
  ) t),'[]'::jsonb)
 );
end $$;

create function public.admin_account_directory(p_search text default '',p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; term text:=lower(trim(coalesce(p_search,'')));
begin
 perform admin_private.require_admin();
 if p_offset is null or p_offset<0 or p_offset>100000 or p_limit is null or p_limit not between 1 and 50 or length(term)>100 then raise exception 'Invalid pagination or search';end if;
 with directory as (
  select u.id user_id,coalesce(nullif(left(u.raw_user_meta_data->>'full_name',120),''),nullif(left(u.raw_user_meta_data->>'name',120),''),nullif(p.nickname,''),'Not provided') name,
   u.email,u.created_at signed_up_at,u.email_confirmed_at is not null email_confirmed,
   s.name school,coalesce(p.terms_version='2026-11-14',false) setup_complete,
   exists(select 1 from admin_private.admin_users a where a.user_id=u.id) is_admin
  from auth.users u left join public.profiles p on p.user_id=u.id left join public.schools s on s.id=p.school
  where u.deleted_at is null and u.email is not null
 ), filtered as (select * from directory where term='' or strpos(lower(name||' '||email||' '||coalesce(school,'')),term)>0)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(t order by t.signed_up_at desc,t.user_id) from (select * from filtered order by signed_up_at desc,user_id offset p_offset limit p_limit)t),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.admin_inquiry_list(p_search text default '',p_status text default '',p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;term text:=lower(trim(coalesce(p_search,'')));
begin
 perform admin_private.require_admin();
 if p_offset is null or p_offset<0 or p_offset>100000 or p_limit is null or p_limit not between 1 and 50 or length(term)>100 or p_status is null or p_status not in ('','new','contacted','qualified','closed') then raise exception 'Invalid pagination or filter';end if;
 with filtered as (select * from admin_private.university_inquiries where (p_status='' or status=p_status) and (term='' or strpos(lower(full_name||' '||email||' '||university),term)>0))
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(t order by t.created_at desc,t.id) from (select * from filtered order by created_at desc,id offset p_offset limit p_limit)t),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.admin_update_inquiry(p_id uuid,p_status text,p_notes text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare before_row admin_private.university_inquiries;updated admin_private.university_inquiries;
begin
 perform admin_private.require_admin();
 if p_status is null or p_status not in ('new','contacted','qualified','closed') or p_notes is null or length(p_notes)>4000 then raise exception 'Invalid inquiry update';end if;
 select * into before_row from admin_private.university_inquiries where id=p_id for update;
 if not found then raise exception 'Inquiry not found';end if;
 if before_row.updated_at is distinct from p_expected_updated_at then raise exception 'Inquiry changed. Refresh before saving.';end if;
 update admin_private.university_inquiries set status=p_status,notes=p_notes,updated_at=clock_timestamp() where id=p_id returning * into updated;
 insert into admin_private.admin_audit_log(actor,action,inquiry_id,detail) values(auth.uid(),'inquiry_updated',p_id,jsonb_build_object('from',before_row.status,'to',updated.status,'notes_changed',before_row.notes is distinct from updated.notes));
 return to_jsonb(updated);
end $$;

create function admin_private.consume_inquiry_limit(p_key text,p_limit integer) returns void language plpgsql set search_path='' as $$
declare n integer;b timestamptz:=date_trunc('hour',now());
begin
 insert into admin_private.inquiry_rate_limits(key,bucket,count) values(p_key,b,1)
 on conflict(key,bucket) do update set count=admin_private.inquiry_rate_limits.count+1 returning count into n;
 if n>p_limit then raise exception 'Too many inquiries. Please try again later.' using errcode='P0001';end if;
end $$;
revoke all on function admin_private.consume_inquiry_limit(text,integer) from public,anon,authenticated;

create function public.submit_university_inquiry(p_payload jsonb,p_submission_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n text;e text;u text;r text;pr text;m text;sc text;headers jsonb;network text;
begin
 if p_submission_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>12000 then raise exception 'Invalid inquiry';end if;
 if length(coalesce(p_payload->>'website',''))>0 then return jsonb_build_object('received',true,'reference',p_submission_id);end if;
 n:=trim(coalesce(p_payload->>'full_name',''));e:=lower(trim(coalesce(p_payload->>'email','')));u:=trim(coalesce(p_payload->>'university',''));r:=trim(coalesce(p_payload->>'role',''));pr:=coalesce(p_payload->>'provider','Not sure / not applicable');m:=trim(coalesce(p_payload->>'message',''));sc:=trim(coalesce(p_payload->>'scope',''));
 if length(n) not between 2 and 120 or length(e) not between 3 and 254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(u) not between 2 and 160 or length(r) not between 2 and 120 or length(m) not between 10 and 4000 or length(sc)>500 or pr not in ('Not sure / not applicable','Grubhub','Transact','Other') then raise exception 'Check the required fields and their length limits.';end if;
 if exists(select 1 from admin_private.university_inquiries where id=p_submission_id) then return jsonb_build_object('received',true,'reference',p_submission_id);end if;
 -- Enforced inside the transaction; direct RPC callers cannot bypass these limits.
 perform admin_private.consume_inquiry_limit('global',60);
 perform admin_private.consume_inquiry_limit('email:'||md5(e),3);
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 network:=left(trim(split_part(coalesce(headers->>'x-forwarded-for',''),',',1)),200);
 if network<>'' then perform admin_private.consume_inquiry_limit('network:'||md5(network),10);end if;
 insert into admin_private.university_inquiries(id,full_name,email,university,role,provider,message,scope) values(p_submission_id,n,e,u,r,pr,m,sc) on conflict(id) do nothing;
 delete from admin_private.inquiry_rate_limits where bucket<now()-interval '2 days';
 return jsonb_build_object('received',true,'reference',p_submission_id);
end $$;

revoke all on function public.admin_access(),public.admin_dashboard(),public.admin_account_directory(text,integer,integer),public.admin_inquiry_list(text,text,integer,integer),public.admin_update_inquiry(uuid,text,text,timestamptz),public.submit_university_inquiry(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_access(),public.admin_dashboard(),public.admin_account_directory(text,integer,integer),public.admin_inquiry_list(text,text,integer,integer),public.admin_update_inquiry(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.submit_university_inquiry(jsonb,uuid) to anon,authenticated;

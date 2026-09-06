-- Construct360 v13: Staff, Teams, Permissions and Planner.
-- Run AFTER 005_clients_jobs.sql, as postgres. Run the complete transaction.
-- Existing users, invitations and operational records are retained. Rerunnable.
begin;

do $$ begin
  if to_regclass('public.jobs') is null or to_regprocedure('public.workspace_save(text,jsonb,uuid)') is null then
    raise exception 'Install 005_clients_jobs.sql before this combined v13 migration';
  end if;
end $$;

alter table public.staff_members alter column user_id drop not null;
alter table public.staff_members drop constraint if exists staff_members_user_id_fkey;
alter table public.staff_members add constraint staff_members_user_id_fkey
  foreign key(user_id) references auth.users(id) on delete set null;
alter table public.staff_members add column if not exists phone text not null default '' check(length(phone)<=60);
alter table public.staff_members add column if not exists notes text not null default '' check(length(notes)<=5000);
alter table public.staff_members add column if not exists archived boolean not null default false;
alter table public.staff_members add column if not exists version integer not null default 1 check(version>0);
alter table public.staff_members add column if not exists qualifications jsonb not null default '[]'::jsonb;
create unique index if not exists staff_org_id_unique on public.staff_members(organisation_id,id);
create unique index if not exists jobs_org_id_unique on public.jobs(organisation_id,id);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check(length(btrim(name)) between 1 and 120),
  supervisor_id uuid not null,
  notes text not null default '' check(length(notes)<=3000),
  archived boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,id),
  foreign key(organisation_id,supervisor_id) references public.staff_members(organisation_id,id)
);
create unique index if not exists teams_unique_name on public.teams(organisation_id,lower(btrim(name)));
create table if not exists public.team_members (
  organisation_id uuid not null, team_id uuid not null, staff_id uuid not null,
  primary key(team_id,staff_id),
  foreign key(organisation_id,team_id) references public.teams(organisation_id,id),
  foreign key(organisation_id,staff_id) references public.staff_members(organisation_id,id)
);
create table if not exists public.planner_bookings (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null,
  job_id uuid not null, team_id uuid,
  -- Site-local UK wall-clock times. No implicit browser timezone conversions.
  starts_at timestamp without time zone not null,
  ends_at timestamp without time zone not null,
  task text not null check(length(btrim(task)) between 1 and 180),
  instructions text not null default '' check(length(instructions)<=5000),
  status text not null default 'scheduled' check(status in ('scheduled','cancelled')),
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(ends_at>starts_at and ends_at<=starts_at+interval '7 days'),
  unique(organisation_id,id),
  foreign key(organisation_id,job_id) references public.jobs(organisation_id,id),
  foreign key(organisation_id,team_id) references public.teams(organisation_id,id)
);
create table if not exists public.planner_assignments (
  organisation_id uuid not null, booking_id uuid not null, staff_id uuid not null,
  primary key(booking_id,staff_id),
  foreign key(organisation_id,booking_id) references public.planner_bookings(organisation_id,id),
  foreign key(organisation_id,staff_id) references public.staff_members(organisation_id,id)
);
create index if not exists planner_dates on public.planner_bookings(organisation_id,starts_at,ends_at) where status='scheduled';
create index if not exists planner_staff on public.planner_assignments(organisation_id,staff_id,booking_id);
create index if not exists team_staff on public.team_members(organisation_id,staff_id);

create or replace function public.operations_member_org() returns uuid
language sql stable security definer set search_path='' as $$
  select m.organisation_id from public.organisation_memberships m
  join public.organisations o on o.id=m.organisation_id join auth.users u on u.id=m.user_id
  where m.user_id=auth.uid() and m.is_active and o.status='active'
    and u.email_confirmed_at is not null
    and coalesce(u.raw_user_meta_data->>'needs_password_setup','false')<>'true'
$$;
-- Also apply password-setup gating to the existing management RPCs and policies.
create or replace function public.workspace_organisation_id() returns uuid
language sql stable security definer set search_path='' as $$
  select m.organisation_id from public.organisation_memberships m
  where m.user_id=auth.uid() and m.organisation_id=public.operations_member_org()
    and m.role in ('admin','operations')
$$;

create or replace function public.operations_staff_validate() returns trigger
language plpgsql set search_path='' as $$
declare q jsonb; expires date;
begin
  if tg_op='UPDATE' then new.version:=old.version+1; new.updated_at:=clock_timestamp(); end if;
  if jsonb_typeof(new.qualifications) is distinct from 'array' or jsonb_array_length(new.qualifications)>30 then
    raise exception 'Supply no more than 30 qualifications';
  end if;
  for q in select value from jsonb_array_elements(new.qualifications) loop
    if jsonb_typeof(q) is distinct from 'object' or length(btrim(coalesce(q->>'name',''))) not between 1 and 160
      or length(coalesce(q->>'reference',''))>120 then raise exception 'Enter a qualification name and valid reference'; end if;
    expires:=nullif(q->>'expires','')::date;
  end loop;
  return new;
end $$;
drop trigger if exists operations_staff_validate on public.staff_members;
create trigger operations_staff_validate before insert or update on public.staff_members
for each row execute function public.operations_staff_validate();

-- Membership changes are the authority for linked accounts. Keep staff history.
create or replace function public.operations_sync_member() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  if tg_op='DELETE' then
    update public.staff_members set is_active=false,archived=true,availability='Unavailable'
      where user_id=old.user_id and organisation_id=old.organisation_id;
    return old;
  end if;
  if new.role in ('supervisor','operative') then
    select * into p from public.profiles where id=new.user_id;
    insert into public.staff_members(organisation_id,user_id,full_name,email,employment_role,is_active,created_by)
    values(new.organisation_id,new.user_id,coalesce(nullif(btrim(p.full_name),''),p.email,'Staff member'),
      coalesce(p.email,''),case when new.role='supervisor' then 'Scaffold Supervisor' else 'Operative' end,new.is_active,new.created_by)
    on conflict(user_id) do update set is_active=excluded.is_active,employment_role=excluded.employment_role
      where staff_members.organisation_id=excluded.organisation_id;
  else
    update public.staff_members set archived=true,is_active=false,availability='Unavailable'
      where user_id=new.user_id and organisation_id=new.organisation_id;
  end if;
  return new;
end $$;
drop trigger if exists operations_sync_member on public.organisation_memberships;
create trigger operations_sync_member after insert or update of role,is_active or delete
on public.organisation_memberships for each row execute function public.operations_sync_member();

-- Auth deletion removes login identity but preserves archived staffing history.
create or replace function public.operations_retire_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.staff_members set user_id=null,is_active=false,archived=true,availability='Unavailable',
    email='',phone='' where user_id=old.id;
  return old;
end $$;
drop trigger if exists operations_retire_user on auth.users;
create trigger operations_retire_user before delete on auth.users
for each row execute function public.operations_retire_user();

create or replace function public.operations_sync_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.staff_members set full_name=coalesce(nullif(btrim(new.full_name),''),new.email,'Staff member'),email=new.email
    where user_id=new.id and (full_name is distinct from coalesce(nullif(btrim(new.full_name),''),new.email,'Staff member') or email is distinct from new.email);
  return new;
end $$;
drop trigger if exists operations_sync_profile on public.profiles;
create trigger operations_sync_profile after update of full_name,email on public.profiles
for each row execute function public.operations_sync_profile();

-- Same invitation behaviour as v11; staff creation is now handled by membership trigger.
create or replace function public.attach_reserved_company_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v public.organisation_invitations; v_member public.organisation_memberships;
begin
  if new.invited_at is null then return new; end if;
  select * into v from public.organisation_invitations where email=lower(new.email) for update;
  if not found then return new; end if;
  if not exists(select 1 from public.organisations where id=v.organisation_id and status='active') then raise exception 'This company is suspended'; end if;
  select * into v_member from public.organisation_memberships where user_id=new.id;
  if found then
    if v_member.organisation_id<>v.organisation_id or not v_member.is_active then raise exception 'Existing company access does not match the invitation'; end if;
  else
    insert into public.profiles(id,email,full_name) values(new.id,new.email,v.full_name)
      on conflict(id) do update set email=excluded.email,full_name=excluded.full_name;
    insert into public.organisation_memberships(organisation_id,user_id,role,is_active,created_by)
      values(v.organisation_id,new.id,v.role,true,v.invited_by);
  end if;
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('needs_password_setup',true) where id=new.id;
  update public.organisation_invitations set user_id=new.id,status='sent',last_sent_at=new.invited_at,last_error=null where id=v.id;
  insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
    values(v.organisation_id,coalesce(v.last_sender,v.invited_by),'user_invited','Sent company invitation',jsonb_build_object('target_user_id',new.id));
  if v.initial_admin then
    insert into public.platform_activity_log(actor_user_id,organisation_id,event_type,description)
      values(coalesce(v.last_sender,v.invited_by),v.organisation_id,'admin_invited','Sent first Admin invitation');
  end if;
  return new;
end $$;

-- Fill missing staff, without resetting existing availability, archives or qualifications.
insert into public.staff_members(organisation_id,user_id,full_name,email,employment_role,is_active,created_by)
select m.organisation_id,m.user_id,coalesce(nullif(btrim(p.full_name),''),p.email,'Staff member'),p.email,
  case when m.role='supervisor' then 'Scaffold Supervisor' else 'Operative' end,m.is_active,m.created_by
from public.organisation_memberships m join public.profiles p on p.id=m.user_id
where m.role in ('supervisor','operative') on conflict(user_id) do nothing;

-- Keep full private staff/job rows management-only. Field users get a deliberately
-- limited projection from operations_snapshot, never private notes/contact directories.
drop policy if exists "members view linked staff" on public.staff_members;
drop policy if exists operations_staff_read on public.staff_members;
create policy operations_staff_read on public.staff_members for select to authenticated
using(organisation_id=(select public.workspace_organisation_id()));
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.planner_bookings enable row level security;
alter table public.planner_assignments enable row level security;
revoke all on public.staff_members,public.teams,public.team_members,public.planner_bookings,public.planner_assignments from public,anon,authenticated;
grant select on public.staff_members,public.teams,public.team_members,public.planner_bookings,public.planner_assignments to authenticated;
drop policy if exists operations_teams_read on public.teams;
create policy operations_teams_read on public.teams for select to authenticated using(organisation_id=(select public.workspace_organisation_id()));
drop policy if exists operations_members_read on public.team_members;
create policy operations_members_read on public.team_members for select to authenticated using(organisation_id=(select public.workspace_organisation_id()));
drop policy if exists operations_bookings_read on public.planner_bookings;
create policy operations_bookings_read on public.planner_bookings for select to authenticated using(organisation_id=(select public.workspace_organisation_id()));
drop policy if exists operations_assignments_read on public.planner_assignments;
create policy operations_assignments_read on public.planner_assignments for select to authenticated using(organisation_id=(select public.workspace_organisation_id()));

-- Existing profile/membership policies already allow self and Company Admin only.

create or replace function public.operations_save(p_kind text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_org uuid:=public.workspace_organisation_id(); v_id uuid; v_version integer; v_result jsonb;
  v_fingerprint text:=md5(auth.uid()::text||coalesce(p_kind,'')||coalesce(p_data::text,''));
  v_receipt public.workspace_mutations; s public.staff_members; t public.teams; b public.planner_bookings;
  v_ids uuid[]; v_extra uuid[]; v_team uuid; v_supervisor uuid; v_job public.jobs;
  v_start timestamp; v_end timestamp; v_conflict text; v_name text; v_archived boolean;
begin
  if v_org is null then raise exception 'Active company Admin or Operations access required'; end if;
  if p_request_id is null or p_kind is null or p_kind not in ('staff','team','booking','cancel_booking')
    or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>150000 then raise exception 'Invalid save request'; end if;
  if p_data ? 'organisation_id' or p_data ? 'user_id' then raise exception 'Company and user links are assigned by the server'; end if;
  -- Shared with Clients & Jobs: serialize validation + writes for one company.
  perform pg_advisory_xact_lock(hashtextextended(v_org::text,12));
  select * into v_receipt from public.workspace_mutations where organisation_id=v_org and request_id=p_request_id;
  if found then
    if v_receipt.fingerprint<>v_fingerprint then raise exception 'Request changed. Start a new save'; end if;
    return v_receipt.result;
  end if;
  v_id:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); v_version:=coalesce((p_data->>'version')::integer,0);
  if p_kind='staff' then
    select * into s from public.staff_members where organisation_id=v_org and id=v_id for update;
    if (v_version=0 and found) or (v_version<>0 and (not found or s.version<>v_version)) then raise exception 'This staff record changed or is unavailable. Close, refresh and try again'; end if;
    if s.user_id is not null and (p_data ? 'employment_role' and p_data->>'employment_role'<>s.employment_role
      or p_data ? 'is_active' and (p_data->>'is_active')::boolean is distinct from s.is_active) then
      raise exception 'Only a Company Admin can change linked user roles or account status in Users';
    end if;
    if coalesce(p_data->>'availability','Available') not in ('Available','Unavailable') then raise exception 'Choose Available or Unavailable'; end if;
    if s.user_id is not null and (p_data->>'full_name' is distinct from s.full_name or p_data->>'email' is distinct from s.email) then
      raise exception 'Linked name and email are managed through the user account';
    end if;
    if length(coalesce(p_data->>'email',''))>254 then raise exception 'Email is too long'; end if;
    if v_version=0 then
      insert into public.staff_members(id,organisation_id,full_name,email,employment_role,phone,notes,is_active,availability,archived,qualifications,created_by)
      values(v_id,v_org,btrim(p_data->>'full_name'),btrim(coalesce(p_data->>'email','')),coalesce(p_data->>'employment_role','Operative'),
        btrim(coalesce(p_data->>'phone','')),btrim(coalesce(p_data->>'notes','')),coalesce((p_data->>'is_active')::boolean,true),
        coalesce(p_data->>'availability','Available'),coalesce((p_data->>'archived')::boolean,false),coalesce(p_data->'qualifications','[]'),auth.uid());
    else
      update public.staff_members set full_name=btrim(p_data->>'full_name'),email=btrim(coalesce(p_data->>'email','')),
        employment_role=coalesce(p_data->>'employment_role',employment_role),phone=btrim(coalesce(p_data->>'phone','')),notes=btrim(coalesce(p_data->>'notes','')),
        is_active=coalesce((p_data->>'is_active')::boolean,is_active),availability=coalesce(p_data->>'availability','Available'),
        archived=coalesce((p_data->>'archived')::boolean,false),qualifications=coalesce(p_data->'qualifications','[]')
      where organisation_id=v_org and id=v_id;
    end if;
    select jsonb_build_object('id',id,'version',version) into v_result from public.staff_members where id=v_id and organisation_id=v_org;
  elsif p_kind='team' then
    select * into t from public.teams where organisation_id=v_org and id=v_id;
    if (v_version=0 and found) or (v_version<>0 and (not found or t.version<>v_version)) then raise exception 'This team changed or is unavailable. Close, refresh and try again'; end if;
    v_archived:=coalesce((p_data->>'archived')::boolean,false);
    v_supervisor:=nullif(p_data->>'supervisor_id','')::uuid;
    if jsonb_typeof(p_data->'staff_ids') is distinct from 'array' or jsonb_array_length(p_data->'staff_ids')>100 then raise exception 'Choose up to 100 team members'; end if;
    select coalesce(array_agg(distinct value::uuid),'{}') into v_ids from jsonb_array_elements_text(p_data->'staff_ids');
    if v_supervisor is null then raise exception 'Choose a supervisor'; end if;
    v_ids:=array_append(v_ids,v_supervisor);
    if exists(select 1 from unnest(v_ids) x(id) where id is null or not exists(select 1 from public.staff_members where organisation_id=v_org and id=x.id)) then raise exception 'Team member unavailable for this company'; end if;
    if not v_archived then
      if not exists(select 1 from public.staff_members where organisation_id=v_org and id=v_supervisor and employment_role='Scaffold Supervisor' and is_active and not archived) then raise exception 'Choose an active Scaffold Supervisor'; end if;
      if exists(select 1 from public.staff_members where id=any(v_ids) and (not is_active or archived)) then raise exception 'Remove inactive or archived staff before saving an active team'; end if;
    end if;
    if v_version=0 then
      insert into public.teams(id,organisation_id,name,supervisor_id,notes,archived)
      values(v_id,v_org,btrim(p_data->>'name'),v_supervisor,coalesce(p_data->>'notes',''),v_archived);
    else
      update public.teams set name=btrim(p_data->>'name'),supervisor_id=v_supervisor,notes=coalesce(p_data->>'notes',''),archived=v_archived,version=version+1,updated_at=clock_timestamp() where id=v_id and organisation_id=v_org;
    end if;
    delete from public.team_members where organisation_id=v_org and team_id=v_id;
    insert into public.team_members(organisation_id,team_id,staff_id) select v_org,v_id,id from (select distinct unnest(v_ids) id) x;
    select jsonb_build_object('id',id,'version',version) into v_result from public.teams where id=v_id and organisation_id=v_org;
  else
    select * into b from public.planner_bookings where organisation_id=v_org and id=v_id;
    if (v_version=0 and found) or (v_version<>0 and (not found or b.version<>v_version)) then raise exception 'This booking changed or is unavailable. Close, refresh and try again'; end if;
    if p_kind='cancel_booking' then
      if v_version=0 then raise exception 'Booking unavailable'; end if;
      update public.planner_bookings set status='cancelled',version=version+1,updated_at=clock_timestamp() where id=v_id and organisation_id=v_org;
    else
      v_start:=(p_data->>'starts_at')::timestamp; v_end:=(p_data->>'ends_at')::timestamp;
      if v_start is null or v_end is null or v_end<=v_start or v_end>v_start+interval '7 days' then raise exception 'Set start and finish times in order, no more than seven days apart'; end if;
      select * into v_job from public.jobs where organisation_id=v_org and id=(p_data->>'job_id')::uuid;
      if not found or v_job.archived or v_job.status in ('Completion/Closed','Cancelled','Completed') then raise exception 'Choose an open, unarchived job'; end if;
      if v_job.start_date is not null and v_start::date<v_job.start_date or v_job.end_date is not null and (v_end-interval '1 microsecond')::date>v_job.end_date then raise exception 'Booking must fit within the job dates. Edit the job dates first'; end if;
      if jsonb_typeof(p_data->'staff_ids') is distinct from 'array' or jsonb_array_length(p_data->'staff_ids')>100 then raise exception 'Choose up to 100 staff'; end if;
      select coalesce(array_agg(distinct value::uuid),'{}') into v_ids from jsonb_array_elements_text(p_data->'staff_ids');
      v_team:=nullif(p_data->>'team_id','')::uuid;
      if v_team is not null then
        select * into t from public.teams where organisation_id=v_org and id=v_team and not archived;
        if not found then raise exception 'Team unavailable'; end if;
        if coalesce((p_data->>'team_version')::integer,0)<>t.version then raise exception 'Team roster changed. Refresh and review the crew before saving'; end if;
        if not exists(select 1 from public.staff_members where organisation_id=v_org and id=t.supervisor_id and is_active and not archived and employment_role='Scaffold Supervisor') then raise exception 'Team needs an active supervisor'; end if;
        v_ids:=v_ids||array(select staff_id from public.team_members where organisation_id=v_org and team_id=v_team);
      end if;
      select coalesce(array_agg(distinct id),'{}') into v_ids from unnest(v_ids) x(id);
      if cardinality(v_ids)=0 then raise exception 'Assign at least one staff member or team'; end if;
      if exists(select 1 from unnest(v_ids) x(id) where id is null or not exists(select 1 from public.staff_members where organisation_id=v_org and id=x.id and is_active and not archived and availability='Available')) then raise exception 'Assigned staff must be active, available and belong to this company'; end if;
      select person.full_name||' is already booked for '||pb.task into v_conflict
      from public.planner_bookings pb join public.planner_assignments pa on pa.booking_id=pb.id and pa.organisation_id=pb.organisation_id
      join public.staff_members person on person.id=pa.staff_id and person.organisation_id=pa.organisation_id
      where pb.organisation_id=v_org and pb.status='scheduled' and pb.id<>v_id and pa.staff_id=any(v_ids)
        and pb.starts_at<v_end and pb.ends_at>v_start limit 1;
      if v_conflict is not null then raise exception 'Scheduling conflict: %. Choose another time or crew',v_conflict; end if;
      if v_version=0 then
        insert into public.planner_bookings(id,organisation_id,job_id,team_id,starts_at,ends_at,task,instructions,created_by)
        values(v_id,v_org,v_job.id,v_team,v_start,v_end,btrim(p_data->>'task'),coalesce(p_data->>'instructions',''),auth.uid());
      else
        update public.planner_bookings set job_id=v_job.id,team_id=v_team,starts_at=v_start,ends_at=v_end,task=btrim(p_data->>'task'),
          instructions=coalesce(p_data->>'instructions',''),status='scheduled',version=version+1,updated_at=clock_timestamp() where id=v_id and organisation_id=v_org;
      end if;
      delete from public.planner_assignments where organisation_id=v_org and booking_id=v_id;
      insert into public.planner_assignments(organisation_id,booking_id,staff_id) select v_org,v_id,unnest(v_ids);
    end if;
    select jsonb_build_object('id',id,'version',version) into v_result from public.planner_bookings where id=v_id and organisation_id=v_org;
  end if;
  insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(v_org,p_request_id,v_fingerprint,v_result);
  insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
    values(v_org,auth.uid(),'operations_saved','Saved '||p_kind,jsonb_build_object('record_id',v_id,'version',v_result->'version'));
  return v_result;
end $$;

-- Prevent existing job editing from invalidating scheduled work.
create or replace function public.operations_guard_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.planner_bookings b where b.organisation_id=new.organisation_id and b.job_id=new.id and b.status='scheduled'
    and ((new.archived or new.status in ('Completed','Cancelled','Completion/Closed')) and b.ends_at>(now() at time zone 'Europe/London')
      or new.start_date is not null and b.starts_at::date<new.start_date
      or new.end_date is not null and (b.ends_at-interval '1 microsecond')::date>new.end_date)) then
    raise exception 'Cancel or adjust this job’s scheduled bookings before closing, archiving or narrowing its dates';
  end if;
  return new;
end $$;
drop trigger if exists operations_guard_job on public.jobs;
create trigger operations_guard_job before update on public.jobs for each row execute function public.operations_guard_job();

create or replace function public.operations_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid:=public.operations_member_org(); v_role text; v_staff uuid; v_bookings uuid[]; result jsonb;
begin
  if v_org is null then raise exception 'Active company access required'; end if;
  select role::text into v_role from public.organisation_memberships where user_id=auth.uid() and organisation_id=v_org;
  if v_role in ('admin','operations') then
    return public.workspace_snapshot()||jsonb_build_object('role',v_role,'staff',
      coalesce((select jsonb_agg(s order by s.full_name,s.id) from public.staff_members s where organisation_id=v_org),'[]'::jsonb),
      'teams',coalesce((select jsonb_agg(t order by t.name,t.id) from public.teams t where organisation_id=v_org),'[]'::jsonb),
      'team_members',coalesce((select jsonb_agg(t) from public.team_members t where organisation_id=v_org),'[]'::jsonb),
      'bookings',coalesce((select jsonb_agg(b order by b.starts_at,b.id) from public.planner_bookings b where organisation_id=v_org),'[]'::jsonb),
      'crew',coalesce((select jsonb_agg(a) from public.planner_assignments a where organisation_id=v_org),'[]'::jsonb));
  end if;
  select id into v_staff from public.staff_members where organisation_id=v_org and user_id=auth.uid() and is_active and not archived;
  select coalesce(array_agg(b.id),'{}') into v_bookings from public.planner_bookings b
    join public.planner_assignments a on a.organisation_id=b.organisation_id and a.booking_id=b.id
    where b.organisation_id=v_org and a.staff_id=v_staff and b.status='scheduled';
  -- Operatives receive their own identity only. Supervisors receive crew names
  -- and working roles for bookings they themselves are explicitly assigned to.
  select jsonb_build_object('organisation_id',v_org,'role',v_role,'clients','[]'::jsonb,'contacts','[]'::jsonb,'assignments','[]'::jsonb,
    'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'code',j.code,'site',j.site,'scaffold_type',j.scaffold_type,'status',j.status,'start_date',j.start_date,'end_date',j.end_date))
      from public.jobs j where j.organisation_id=v_org and exists(select 1 from public.planner_bookings b where b.id=any(v_bookings) and b.job_id=j.id)),'[]'::jsonb),
    'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'job_id',b.job_id,'starts_at',b.starts_at,'ends_at',b.ends_at,'task',b.task,'instructions',b.instructions,'status',b.status) order by b.starts_at)
      from public.planner_bookings b where b.id=any(v_bookings) and b.organisation_id=v_org),'[]'::jsonb),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'full_name',s.full_name,'employment_role',s.employment_role)) from public.staff_members s
      where s.organisation_id=v_org and (s.id=v_staff or v_role='supervisor' and exists(select 1 from public.planner_assignments a where a.booking_id=any(v_bookings) and a.staff_id=s.id and a.organisation_id=v_org))),'[]'::jsonb),
    'crew',coalesce((select jsonb_agg(a) from public.planner_assignments a where a.organisation_id=v_org and a.booking_id=any(v_bookings) and (v_role='supervisor' or a.staff_id=v_staff)),'[]'::jsonb),
    'teams','[]'::jsonb,'team_members','[]'::jsonb) into result;
  return result;
end $$;

revoke all on function public.operations_member_org(),public.operations_staff_validate(),public.operations_sync_member(),public.operations_retire_user(),public.operations_sync_profile(),public.operations_guard_job(),public.operations_save(text,jsonb,uuid),public.operations_snapshot() from public,anon,authenticated;
grant execute on function public.operations_member_org(),public.operations_snapshot(),public.operations_save(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

-- v19: install once, after v18. No records or reports are deleted.
begin;
do $$ begin
 if to_regprocedure('public.scaffold_snapshot()') is null then raise exception 'Install v18 first'; end if;
end $$;

alter table public.jobs drop constraint jobs_status_check;
update public.jobs set status=case status when 'Completed' then 'Completion/Closed' when 'Handover & Initial Inspection' then 'Handover' else status end
 where status in ('Completed','Handover & Initial Inspection');
alter table public.jobs add constraint jobs_status_check check(status in ('Quotation','Acceptance & Planning','Delivery & Erection','Handover','Dismantling & Removal','Completion/Closed','Cancelled'));
alter table public.jobs add column handover_requested_at timestamptz;
alter table public.jobs add column handover_registration_required boolean not null default false;

-- Legacy clients/imports can still send the old names during the frontend rollout.
create function c360_private.normalise_job_handover() returns trigger
language plpgsql set search_path='' as $$
begin
 new.status:=case new.status when 'Completed' then 'Completion/Closed' when 'Handover & Initial Inspection' then 'Handover' else new.status end;
 if new.status='Handover' and (tg_op='INSERT' or old.status is distinct from 'Handover') then
  new.handover_requested_at:=date_trunc('second',clock_timestamp());
  new.handover_registration_required:=not exists(select 1 from public.job_scaffolds where organisation_id=new.organisation_id and job_id=new.id and not dismantled);
 end if;
 return new;
end $$;
create trigger c360_job_handover_before before insert or update on public.jobs for each row execute function c360_private.normalise_job_handover();
create function c360_private.require_handover_inspections() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='Handover' and (tg_op='INSERT' or old.status is distinct from 'Handover') then
  update public.job_scaffolds set inspection_required=true,required_reason='Handover inspection required',required_at=new.handover_requested_at,version=version+1
   where organisation_id=new.organisation_id and job_id=new.id and not dismantled;
  insert into public.scaffold_events(organisation_id,scaffold_id,actor_id,action,note)
   select new.organisation_id,id,auth.uid(),'handover','Job moved to Handover — inspection required'
   from public.job_scaffolds where organisation_id=new.organisation_id and job_id=new.id and not dismantled;
 end if;
 return new;
end $$;
create trigger c360_job_handover_after after insert or update on public.jobs for each row execute function c360_private.require_handover_inspections();
create function c360_private.register_handover_scaffold() returns trigger
language plpgsql security definer set search_path='' as $$
declare requested timestamptz;
begin
 select handover_requested_at into requested from public.jobs where id=new.job_id and organisation_id=new.organisation_id;
 if requested is not null then
  new.required_at:=requested;
  new.required_reason:='Initial / handover inspection required';
  update public.jobs set handover_registration_required=false where id=new.job_id and organisation_id=new.organisation_id;
 end if;
 return new;
end $$;
create trigger c360_scaffold_handover before insert on public.job_scaffolds for each row execute function c360_private.register_handover_scaffold();
revoke all on function c360_private.normalise_job_handover(),c360_private.require_handover_inspections(),c360_private.register_handover_scaffold() from public,anon,authenticated;

alter function public.scaffold_snapshot() set schema c360_private;
alter function c360_private.scaffold_snapshot() rename to scaffold_snapshot_v18;
revoke all on function c360_private.scaffold_snapshot_v18() from public,anon,authenticated;
create function public.scaffold_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=public.operations_member_org(); result jsonb;
begin
 if org is null then raise exception 'Active company access required'; end if;
 result:=c360_private.scaffold_snapshot_v18();
 return result||jsonb_build_object('handover_pending',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'site',site,'requested_at',handover_requested_at)) from public.jobs
  where organisation_id=org and handover_registration_required and not archived),'[]'::jsonb));
end $$;

alter table public.staff_members add column address text not null default '' check(length(address)<=1500);
alter table public.staff_members add column profile_photo text check(length(profile_photo)<=300);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('staff-profiles','staff-profiles',false,5242880,array['image/jpeg']);
create policy staff_profile_read on storage.objects for select to authenticated using(bucket_id='staff-profiles' and split_part(name,'/',1)=(select public.workspace_organisation_id())::text);
create policy staff_profile_insert on storage.objects for insert to authenticated with check(bucket_id='staff-profiles' and split_part(name,'/',1)=(select public.workspace_organisation_id())::text
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');

create table public.staff_annual_leave(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),staff_id uuid not null,
 starts_on date not null,ends_on date not null,created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),cancelled_at timestamptz,cancelled_by uuid references auth.users(id) on delete set null,version integer not null default 1,
 foreign key(organisation_id,staff_id) references public.staff_members(organisation_id,id),
 check(isfinite(starts_on) and isfinite(ends_on) and ends_on>=starts_on and ends_on-starts_on<=366)
);
create index staff_leave_dates on public.staff_annual_leave(organisation_id,staff_id,starts_on,ends_on) where cancelled_at is null;
alter table public.staff_annual_leave enable row level security;
revoke all on public.staff_annual_leave from public,anon,authenticated;
grant select on public.staff_annual_leave to authenticated;
create function c360_private.leave_owner_staff() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.staff_members where user_id=(select auth.uid()) and organisation_id=(select public.operations_member_org()) and is_active and not archived
$$;
revoke all on function c360_private.leave_owner_staff() from public,anon,authenticated;
grant execute on function c360_private.leave_owner_staff() to authenticated;
create policy leave_office_or_self on public.staff_annual_leave for select to authenticated using(organisation_id=(select public.operations_member_org()) and
 (organisation_id=(select public.workspace_organisation_id()) or staff_id=(select c360_private.leave_owner_staff())));

create function public.annual_leave_save(p_action text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=public.workspace_organisation_id(); receipt public.workspace_mutations; rec public.staff_annual_leave; person public.staff_members;
 fingerprint text:=md5(auth.uid()::text||'annual_leave'||coalesce(p_action,'')||coalesce(p_data::text,'')); result jsonb; start_day date; end_day date;
begin
 if org is null then raise exception 'Active company Admin or Operations access required'; end if;
 if p_request_id is null or p_action is null or p_action not in ('add','cancel') or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>3000 then raise exception 'Invalid leave request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 select * into receipt from public.workspace_mutations where organisation_id=org and request_id=p_request_id;
 if found then
  if receipt.fingerprint<>fingerprint then raise exception 'Request changed. Start a new save'; end if;
  return receipt.result;
 end if;
 if p_action='add' then
  select * into person from public.staff_members where organisation_id=org and id=(p_data->>'staff_id')::uuid and not archived;
  if not found then raise exception 'Staff member unavailable'; end if;
  start_day:=(p_data->>'starts_on')::date;end_day:=(p_data->>'ends_on')::date;
  if start_day is null or end_day is null or not isfinite(start_day) or not isfinite(end_day) or end_day<start_day or end_day-start_day>366 then raise exception 'Choose dates in order, no more than a year apart'; end if;
  if exists(select 1 from public.staff_annual_leave where organisation_id=org and staff_id=person.id and cancelled_at is null and starts_on<=end_day and ends_on>=start_day) then raise exception 'Annual leave already covers part of this date range'; end if;
  insert into public.staff_annual_leave(organisation_id,staff_id,starts_on,ends_on,created_by) values(org,person.id,start_day,end_day,auth.uid()) returning * into rec;
 else
  select * into rec from public.staff_annual_leave where organisation_id=org and id=(p_data->>'id')::uuid;
  if not found or rec.version is distinct from (p_data->>'version')::integer or rec.cancelled_at is not null then raise exception 'Leave changed or unavailable. Refresh and try again'; end if;
  update public.staff_annual_leave set cancelled_at=now(),cancelled_by=auth.uid(),version=version+1 where id=rec.id returning * into rec;
 end if;
 result:=jsonb_build_object('id',rec.id,'version',rec.version);
 insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(org,p_request_id,fingerprint,result);
 insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata) values(org,auth.uid(),'annual_leave_'||p_action,'Annual leave '||p_action,result);
 return result;
end $$;

alter function public.operations_snapshot() set schema c360_private;
alter function c360_private.operations_snapshot() rename to operations_snapshot_v14;
revoke all on function c360_private.operations_snapshot_v14() from public,anon,authenticated;
create function public.operations_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=public.operations_member_org(); office boolean; result jsonb;
begin
 if org is null then raise exception 'Active company access required'; end if;
 office:=public.workspace_organisation_id() is not null;
 result:=c360_private.operations_snapshot_v14();
 return result||jsonb_build_object('annual_leave',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'staff_id',l.staff_id,'full_name',s.full_name,'starts_on',l.starts_on,'ends_on',l.ends_on,'version',l.version) order by l.starts_on,s.full_name)
 from public.staff_annual_leave l join public.staff_members s on s.id=l.staff_id and s.organisation_id=l.organisation_id
 where l.organisation_id=org and l.cancelled_at is null and (office or s.user_id=auth.uid())),'[]'::jsonb));
end $$;

-- Preserve the tested v14 save engine, receipt checks, roster snapshots and overlap protection.
alter function public.operations_save(text,jsonb,uuid) set schema c360_private;
alter function c360_private.operations_save(text,jsonb,uuid) rename to operations_save_v14;
revoke all on function c360_private.operations_save_v14(text,jsonb,uuid) from public,anon,authenticated;
create function public.operations_save(p_kind text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=public.workspace_organisation_id(); result jsonb; replay boolean; photo text;
begin
 if org is null then raise exception 'Active company Admin or Operations access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 replay:=exists(select 1 from public.workspace_mutations where organisation_id=org and request_id=p_request_id);
 if not replay and p_kind='staff' then
  if length(coalesce(p_data->>'address',''))>1500 then raise exception 'Address is too long'; end if;
  photo:=nullif(p_data->>'profile_photo','');
  if photo is not null and (split_part(photo,'/',1)<>org::text or split_part(photo,'/',2) is distinct from p_data->>'id'
    or not exists(select 1 from storage.objects where bucket_id='staff-profiles' and name=photo)) then raise exception 'Profile photo is unavailable or belongs to another staff record'; end if;
 end if;
 result:=c360_private.operations_save_v14(p_kind,p_data,p_request_id);
 if not replay and p_kind='staff' then
  update public.staff_members set address=case when p_data ? 'address' then coalesce(p_data->>'address','') else address end,
   profile_photo=case when p_data ? 'profile_photo' then photo else profile_photo end where organisation_id=org and id=(result->>'id')::uuid;
 end if;
 if not replay and p_kind='booking' and exists(select 1 from public.planner_bookings b join public.planner_assignments a on a.booking_id=b.id and a.organisation_id=b.organisation_id
  join public.staff_annual_leave l on l.staff_id=a.staff_id and l.organisation_id=a.organisation_id where b.id=(result->>'id')::uuid and b.organisation_id=org
  and l.cancelled_at is null and b.starts_at<(l.ends_on+1)::timestamp and b.ends_at>l.starts_on::timestamp) then
  raise exception 'A selected staff member is on annual leave during this task. Choose another date or crew';
 end if;
 return result;
end $$;
revoke all on function public.scaffold_snapshot(),public.operations_snapshot(),public.operations_save(text,jsonb,uuid),public.annual_leave_save(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.scaffold_snapshot(),public.operations_snapshot(),public.operations_save(text,jsonb,uuid),public.annual_leave_save(text,jsonb,uuid) to authenticated;
commit;

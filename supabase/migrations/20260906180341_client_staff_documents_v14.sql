-- Construct360 v14. Apply AFTER 006; no old migrations need to be rerun.
begin;
do $$ begin
  if to_regprocedure('public.operations_save(text,jsonb,uuid)') is null then raise exception 'Install v13 migration 006 first'; end if;
end $$;
alter table public.clients add column if not exists contact_role text not null default '' check(length(contact_role)<=120);
alter table public.staff_members add column if not exists position text;
update public.staff_members set position=employment_role where position is null;
alter table public.staff_members alter column position set not null;
alter table public.staff_members drop constraint if exists staff_members_position_check;
alter table public.staff_members add constraint staff_members_position_check check(position in ('Operative','Scaffold Supervisor','Operations'));
alter table public.staff_members add column if not exists hourly_rate numeric(5,2) check(hourly_rate>=0 and hourly_rate<=999.99);
alter table public.staff_members drop constraint if exists staff_members_employment_role_check;
alter table public.staff_members add constraint staff_members_employment_role_check check(employment_role in ('Operative','Scaffold Supervisor','Operations'));

-- Private, immutable images: browser downloads require current manager membership.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('staff-qualifications','staff-qualifications',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists qualification_images_read on storage.objects;
create policy qualification_images_read on storage.objects for select to authenticated
using(bucket_id='staff-qualifications' and split_part(name,'/',1)=(select public.workspace_organisation_id())::text);
drop policy if exists qualification_images_upload on storage.objects;
create policy qualification_images_upload on storage.objects for insert to authenticated
with check(bucket_id='staff-qualifications' and split_part(name,'/',1)=(select public.workspace_organisation_id())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
-- No UPDATE/DELETE policy: replacing or discarding a draft cannot erase a saved certificate.
-- Retention/cleanup is an explicit maintenance action, not a browser side effect.

create or replace function public.operations_staff_validate() returns trigger
language plpgsql set search_path='' as $$
declare q jsonb; expires date; img jsonb; qids text[]:='{}'; paths text[]:='{}';
begin
  if tg_op='INSERT' and new.position is null then new.position:=new.employment_role; end if;
  if tg_op='UPDATE' then new.version:=old.version+1; new.updated_at:=clock_timestamp(); end if;
  if jsonb_typeof(new.qualifications) is distinct from 'array' or jsonb_array_length(new.qualifications)>30 then raise exception 'Supply no more than 30 qualifications'; end if;
  for q in select value from jsonb_array_elements(new.qualifications) loop
    if jsonb_typeof(q) is distinct from 'object' or length(btrim(coalesce(q->>'name',''))) not between 1 and 160 or length(coalesce(q->>'reference',''))>120 then raise exception 'Enter a qualification name and valid reference'; end if;
    expires:=nullif(q->>'expires','')::date;
    if q ? 'id' then
      if (q->>'id') is null or (q->>'id') !~ '^[0-9a-f-]{36}$' or (q->>'id')=any(qids) then raise exception 'Invalid or duplicate qualification identifier'; end if;
      qids:=array_append(qids,q->>'id');
    end if;
    if q ? 'images' then
      if jsonb_typeof(q->'images') is distinct from 'array' or jsonb_array_length(q->'images')>5 then raise exception 'Use up to five images per qualification'; end if;
      for img in select value from jsonb_array_elements(q->'images') loop
        if jsonb_typeof(img) is distinct from 'object' or not(q ? 'id') or
          coalesce(img->>'path','') !~ ('^'||new.organisation_id::text||'/'||new.id::text||'/'||(q->>'id')||'/[0-9a-f-]{36}\.(jpg|png|webp)$')
          or coalesce(img->>'name','')='' or length(img->>'name')>180 or img->>'path'=any(paths) then raise exception 'Invalid qualification image'; end if;
        if not exists(select 1 from storage.objects where bucket_id='staff-qualifications' and name=img->>'path') then raise exception 'Upload the qualification image before saving'; end if;
        paths:=array_append(paths,img->>'path');
        if cardinality(paths)>30 then raise exception 'Use up to 30 images per staff profile'; end if;
      end loop;
    end if;
  end loop;
  return new;
end $$;

create or replace function public.workspace_save(p_kind text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid:=public.workspace_organisation_id(); v_id uuid; v_version integer;
  v_old_client public.clients; v_old_job public.jobs; v_client public.clients;
  v_code text; v_number integer; v_result jsonb; v_receipt public.workspace_mutations;
  v_fingerprint text:=md5(p_kind||coalesce(p_data::text,'')); v_contact jsonb;
  v_job_ids uuid[]; v_prior_jobs uuid[]; v_contact_id uuid; v_contact_ids uuid[]:='{}'; v_now timestamptz:=clock_timestamp();
begin
  if v_org is null then raise exception 'Active company Admin or Operations access required'; end if;
  if p_request_id is null or p_kind not in ('client','job') or p_kind is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid save request'; end if;
  if p_data ? 'organisation_id' then raise exception 'Company is assigned by the server'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text,12));
  select * into v_receipt from public.workspace_mutations where organisation_id=v_org and request_id=p_request_id;
  if found then
    if v_receipt.fingerprint<>v_fingerprint then raise exception 'Request changed. Please start a new save'; end if;
    return v_receipt.result;
  end if;
  v_id:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
  v_version:=coalesce((p_data->>'version')::integer,0);
  if p_kind='client' then
    select * into v_old_client from public.clients where id=v_id and organisation_id=v_org;
    if (v_version=0 and found) or (v_version<>0 and (not found or v_old_client.version<>v_version)) then
      raise exception 'This client changed or is unavailable. Close this form, refresh and try again';
    end if;
    if v_version=0 then
      select greatest(coalesce(max(code::integer),122)+1,123) into v_number from public.clients where organisation_id=v_org;
      v_code:=coalesce(nullif(p_data->>'code',''),lpad(v_number::text,greatest(3,length(v_number::text)),'0'));
      -- Canonical numeric codes prevent 0123 and 123 representing the same client.
      if v_code !~ '^[0-9]{3,7}$' or v_code<>lpad((v_code::integer)::text,greatest(3,length((v_code::integer)::text)),'0') then raise exception 'Invalid client code'; end if;
    else
      v_code:=v_old_client.code;
      if p_data ? 'code' and p_data->>'code'<>v_code then raise exception 'Client code cannot be changed'; end if;
    end if;
    if coalesce((p_data->>'archived')::boolean,false) and exists(select 1 from public.jobs where organisation_id=v_org and client_id=v_id and not archived) then
      raise exception 'Archive this client’s jobs first. No records have been changed';
    end if;
    if jsonb_typeof(p_data->'contacts') is distinct from 'array' or jsonb_array_length(p_data->'contacts')>100 then raise exception 'Supply up to 100 contacts'; end if;
    insert into public.clients(id,organisation_id,code,name,contact,contact_role,phone,email,address,notes,archived,version,updated_at)
    values(v_id,v_org,v_code,btrim(p_data->>'name'),btrim(coalesce(p_data->>'contact','')),btrim(coalesce(p_data->>'contact_role',v_old_client.contact_role,'')),btrim(coalesce(p_data->>'phone','')),btrim(coalesce(p_data->>'email','')),btrim(coalesce(p_data->>'address','')),btrim(coalesce(p_data->>'notes','')),coalesce((p_data->>'archived')::boolean,false),v_version+1,v_now)
    on conflict(id) do update set name=excluded.name,contact=excluded.contact,contact_role=excluded.contact_role,phone=excluded.phone,email=excluded.email,address=excluded.address,notes=excluded.notes,archived=excluded.archived,version=excluded.version,updated_at=excluded.updated_at
    where clients.organisation_id=v_org and clients.version=v_version;
    if not found then raise exception 'Client unavailable'; end if;
    for v_contact in select value from jsonb_array_elements(p_data->'contacts') loop
      v_contact_id:=coalesce(nullif(v_contact->>'id','')::uuid,gen_random_uuid());
      if v_contact_id=any(v_contact_ids) then raise exception 'Duplicate contact'; end if;
      v_contact_ids:=array_append(v_contact_ids,v_contact_id);
      insert into public.client_contacts(id,organisation_id,client_id,name,role,phone,email,notes)
      values(v_contact_id,v_org,v_id,btrim(v_contact->>'name'),btrim(coalesce(v_contact->>'role','')),btrim(coalesce(v_contact->>'phone','')),btrim(coalesce(v_contact->>'email','')),btrim(coalesce(v_contact->>'notes','')))
      on conflict(id) do update set name=excluded.name,role=excluded.role,phone=excluded.phone,email=excluded.email,notes=excluded.notes
      where client_contacts.organisation_id=v_org and client_contacts.client_id=v_id;
      if not found then raise exception 'Contact unavailable for this client'; end if;
      if v_contact ? 'job_ids' then
        if jsonb_typeof(v_contact->'job_ids') is distinct from 'array' or jsonb_array_length(v_contact->'job_ids')>100 then raise exception 'Choose up to 100 sites'; end if;
        select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into v_job_ids from jsonb_array_elements_text(v_contact->'job_ids');
        if exists(select 1 from unnest(v_job_ids) x(id) where id is null or not exists(select 1 from public.jobs where id=x.id and organisation_id=v_org and client_id=v_id)) then raise exception 'Site must be a job belonging to this client'; end if;
        select coalesce(array_agg(job_id order by job_id),'{}') into v_prior_jobs from public.job_contact_assignments where organisation_id=v_org and contact_id=v_contact_id;
        if v_job_ids is distinct from v_prior_jobs then
          delete from public.job_contact_assignments where organisation_id=v_org and contact_id=v_contact_id;
          insert into public.job_contact_assignments(organisation_id,job_id,client_id,contact_id) select v_org,unnest(v_job_ids),v_id,v_contact_id;
          update public.jobs set version=version+1,updated_at=v_now where organisation_id=v_org and id=any(v_job_ids||v_prior_jobs);
        end if;
      end if;
    end loop;
    if exists(select 1 from public.job_contact_assignments where organisation_id=v_org and client_id=v_id and not(contact_id=any(v_contact_ids))) then
      raise exception 'A removed contact is assigned to a job. Remove its job assignments first';
    end if;
    delete from public.client_contacts where organisation_id=v_org and client_id=v_id and not(id=any(v_contact_ids));
  else
    select * into v_old_job from public.jobs where id=v_id and organisation_id=v_org;
    if (v_version=0 and found) or (v_version<>0 and (not found or v_old_job.version<>v_version)) then
      raise exception 'This job changed or is unavailable. Close this form, refresh and try again';
    end if;
    select * into v_client from public.clients where organisation_id=v_org and id=(p_data->>'client_id')::uuid;
    if not found then raise exception 'Client unavailable'; end if;
    if v_version<>0 and v_old_job.client_id<>v_client.id then raise exception 'A job cannot be moved to another client'; end if;
    if v_client.archived and (v_version=0 or not coalesce((p_data->>'archived')::boolean,false)) then raise exception 'Restore the client before adding or restoring a job'; end if;
    if v_version=0 then
      if nullif(p_data->>'code','') is not null then
        v_code:=p_data->>'code';
        if left(v_code,length(v_client.code))<>v_client.code or substring(v_code from length(v_client.code)+1) !~ '^[0-9]{3,7}$' then raise exception 'Job code must start with its client code and a numeric job number'; end if;
        v_number:=substring(v_code from length(v_client.code)+1)::integer;
        if v_code<>v_client.code||lpad(v_number::text,greatest(3,length(v_number::text)),'0') then raise exception 'Invalid job number'; end if;
      else
        select coalesce(max(number),0)+1 into v_number from public.jobs where organisation_id=v_org and client_id=v_client.id;
        v_code:=v_client.code||lpad(v_number::text,greatest(3,length(v_number::text)),'0');
      end if;
    else
      v_code:=v_old_job.code; v_number:=v_old_job.number;
      if p_data ? 'code' and p_data->>'code'<>v_code then raise exception 'Job code cannot be changed'; end if;
    end if;
    if jsonb_typeof(p_data->'contact_ids') is distinct from 'array' or jsonb_array_length(p_data->'contact_ids')>100 then raise exception 'Supply up to 100 job contacts'; end if;
    select coalesce(array_agg(distinct value::uuid),'{}') into v_contact_ids from jsonb_array_elements_text(p_data->'contact_ids');
    if exists(select 1 from unnest(v_contact_ids) x(id) where id is null or not exists(select 1 from public.client_contacts c where c.id=x.id and c.organisation_id=v_org and c.client_id=v_client.id)) then raise exception 'A job contact does not belong to this client'; end if;
    insert into public.jobs(id,organisation_id,client_id,code,number,site,scaffold_type,start_date,end_date,team,status,notes,archived,version,updated_at)
    values(v_id,v_org,v_client.id,v_code,v_number,btrim(p_data->>'site'),btrim(coalesce(p_data->>'scaffold_type','')),nullif(p_data->>'start_date','')::date,nullif(p_data->>'end_date','')::date,btrim(coalesce(p_data->>'team','')),coalesce(p_data->>'status','Quotation'),btrim(coalesce(p_data->>'notes','')),coalesce((p_data->>'archived')::boolean,false),v_version+1,v_now)
    on conflict(id) do update set site=excluded.site,scaffold_type=excluded.scaffold_type,start_date=excluded.start_date,end_date=excluded.end_date,team=excluded.team,status=excluded.status,notes=excluded.notes,archived=excluded.archived,version=excluded.version,updated_at=excluded.updated_at
    where jobs.organisation_id=v_org and jobs.version=v_version;
    if not found then raise exception 'Job unavailable'; end if;
    -- Changing site contacts invalidates any open client form as well.
    if (select coalesce(array_agg(contact_id order by contact_id),'{}') from public.job_contact_assignments where organisation_id=v_org and job_id=v_id)
      is distinct from (select coalesce(array_agg(x order by x),'{}') from unnest(v_contact_ids) x) then
      update public.clients set version=version+1,updated_at=v_now where id=v_client.id and organisation_id=v_org;
    end if;
    delete from public.job_contact_assignments where organisation_id=v_org and job_id=v_id;
    insert into public.job_contact_assignments(organisation_id,job_id,client_id,contact_id) select v_org,v_id,v_client.id,id from unnest(v_contact_ids) x(id);
  end if;
  v_result:=jsonb_build_object('id',v_id,'code',v_code,'version',v_version+1);
  insert into public.workspace_mutations values(v_org,p_request_id,v_fingerprint,v_result,v_now);
  insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
    values(v_org,auth.uid(),'workspace_'||p_kind||'_saved','Saved '||p_kind||' '||v_code,jsonb_build_object('id',v_id,'version',v_version+1,'archived',coalesce((p_data->>'archived')::boolean,false)));
  return v_result;
end $$;

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
  if p_kind='staff' and p_data ? 'hourly_rate' and nullif(p_data->>'hourly_rate','') is not null and
    (p_data->>'hourly_rate') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then raise exception 'Hourly rate must be between £0.00 and £999.99, with up to two decimal places'; end if;
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
      insert into public.staff_members(id,organisation_id,full_name,email,employment_role,position,hourly_rate,phone,notes,is_active,availability,archived,qualifications,created_by)
      values(v_id,v_org,btrim(p_data->>'full_name'),btrim(coalesce(p_data->>'email','')),coalesce(p_data->>'employment_role','Operative'),coalesce(p_data->>'position',p_data->>'employment_role','Operative'),nullif(p_data->>'hourly_rate','')::numeric,
        btrim(coalesce(p_data->>'phone','')),btrim(coalesce(p_data->>'notes','')),coalesce((p_data->>'is_active')::boolean,true),
        coalesce(p_data->>'availability','Available'),coalesce((p_data->>'archived')::boolean,false),coalesce(p_data->'qualifications','[]'),auth.uid());
    else
      update public.staff_members set full_name=btrim(p_data->>'full_name'),email=btrim(coalesce(p_data->>'email','')),
        position=coalesce(p_data->>'position',position),
        hourly_rate=case when p_data ? 'hourly_rate' then nullif(p_data->>'hourly_rate','')::numeric else hourly_rate end,
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
    'staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'full_name',s.full_name,'employment_role',s.employment_role,'position',s.position)) from public.staff_members s
      where s.organisation_id=v_org and (s.id=v_staff or v_role='supervisor' and exists(select 1 from public.planner_assignments a where a.booking_id=any(v_bookings) and a.staff_id=s.id and a.organisation_id=v_org))),'[]'::jsonb),
    'crew',coalesce((select jsonb_agg(a) from public.planner_assignments a where a.organisation_id=v_org and a.booking_id=any(v_bookings) and (v_role='supervisor' or a.staff_id=v_staff)),'[]'::jsonb),
    'teams','[]'::jsonb,'team_members','[]'::jsonb) into result;
  return result;
end $$;

revoke all on function public.operations_staff_validate() from public,anon,authenticated;
revoke all on function public.workspace_save(text,jsonb,uuid),public.operations_save(text,jsonb,uuid),public.operations_snapshot() from public,anon;
grant execute on function public.workspace_save(text,jsonb,uuid),public.operations_save(text,jsonb,uuid),public.operations_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;

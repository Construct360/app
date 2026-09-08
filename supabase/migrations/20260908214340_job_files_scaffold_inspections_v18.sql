-- v18: company job files and shared scaffold inspection core.
-- Run in full AFTER v17. No existing records are rewritten.
begin;
do $$ begin
 if to_regprocedure('public.timesheet_save(text,jsonb,uuid)') is null then raise exception 'Install v16 and v17 first'; end if;
 if position('mod(hours,0.5)' in pg_get_functiondef('public.timesheet_save(text,jsonb,uuid)'::regprocedure))=0 then
  raise exception 'Install the v17 half-hour migration before v18';
 end if;
end $$;
create schema if not exists c360_private;
revoke all on schema c360_private from public,anon;
grant usage on schema c360_private to authenticated;

create table public.job_files(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,job_id uuid not null,
 category text not null check(category in ('images','rams','important','private')),
 name text not null check(length(name) between 1 and 180),mime_type text not null,
 byte_size bigint not null check(byte_size between 1 and 20971520),
 object_path text not null unique,caption text not null default '' check(length(caption)<=1000),
 uploaded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),ready boolean not null default false,
 archived boolean not null default false,
 foreign key(organisation_id,job_id) references public.jobs(organisation_id,id)
);
create index job_files_job on public.job_files(organisation_id,job_id,category,ready,archived);
create index job_files_uploader on public.job_files(uploaded_by);
alter table public.job_files enable row level security;
revoke all on public.job_files from public,anon,authenticated;
grant select on public.job_files to authenticated;
create policy job_files_read on public.job_files for select to authenticated using(
 organisation_id=(select public.operations_member_org()) and not archived and
 (ready or uploaded_by=(select auth.uid())) and
 (category<>'private' or organisation_id=(select public.workspace_organisation_id()))
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('job-files','job-files',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']);
create function c360_private.job_object_access(p_path text,p_upload boolean) returns boolean
 language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.job_files f
 where f.object_path=p_path and f.organisation_id=public.operations_member_org() and not f.archived
 and (f.category<>'private' or f.organisation_id=public.workspace_organisation_id())
 and case when p_upload then not f.ready and f.uploaded_by=auth.uid()
   and (f.category='images' or f.organisation_id=public.workspace_organisation_id())
   and exists(select 1 from public.jobs j where j.id=f.job_id and j.organisation_id=f.organisation_id and not j.archived)
 else f.ready or f.uploaded_by=auth.uid() end);
 $$;
revoke all on function c360_private.job_object_access(text,boolean) from public,anon,authenticated;
grant execute on function c360_private.job_object_access(text,boolean) to authenticated;
create policy job_objects_read on storage.objects for select to authenticated
 using(bucket_id='job-files' and c360_private.job_object_access(name,false));
create policy job_objects_upload on storage.objects for insert to authenticated
 with check(bucket_id='job-files' and c360_private.job_object_access(name,true));
-- Immutable object keys: no client UPDATE or DELETE policies for this bucket.

create function public.job_resources_snapshot(p_job_id uuid default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();manager boolean;
begin
 if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
 manager:=public.workspace_organisation_id() is not null;
 if p_job_id is not null and not exists(select 1 from public.jobs where id=p_job_id and organisation_id=org) then raise exception 'Job unavailable'; end if;
 return jsonb_build_object('organisation_id',org,'can_manage',manager,
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'site',site,'archived',archived) order by code) from public.jobs where organisation_id=org),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(to_jsonb(f) order by created_at desc,id) from public.job_files f
 where organisation_id=org and job_id=p_job_id and ready and not archived and (manager or category<>'private')),'[]'::jsonb));
end $$;

create function public.job_file_save(p_action text,p_data jsonb,p_request_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();manager boolean;f public.job_files;
 receipt public.workspace_mutations;fingerprint text;result jsonb;ext text;job uuid;cat text;mime text;size bigint;
begin
 if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
 manager:=public.workspace_organisation_id() is not null;
 if p_action is null or p_action not in ('reserve','finish','archive') or p_request_id is null or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>10000 then raise exception 'Invalid file request'; end if;
 if p_data ?| array['organisation_id','uploaded_by','object_path','ready','archived'] then raise exception 'File ownership is assigned by the server'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 fingerprint:=md5(auth.uid()::text||'job-file-v18:'||p_action||p_data::text);
 select * into receipt from public.workspace_mutations where organisation_id=org and request_id=p_request_id;
 if found then
  if receipt.fingerprint<>fingerprint then raise exception 'Request changed. Start a new upload'; end if;
  return receipt.result;
 end if;
 if p_action='reserve' then
  job:=(p_data->>'job_id')::uuid;cat:=p_data->>'category';mime:=p_data->>'mime_type';size:=(p_data->>'byte_size')::bigint;
  if not exists(select 1 from public.jobs where id=job and organisation_id=org and not archived) then raise exception 'Active job required'; end if;
  if cat is null or cat not in ('images','rams','important','private') or (not manager and cat<>'images') then raise exception 'Office access required for documents; workers can upload progress images'; end if;
  ext:=case mime when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp'
   when 'application/pdf' then '.pdf' when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then '.docx'
   when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then '.xlsx' when 'text/plain' then '.txt' end;
  if ext is null or (cat='images' and mime not in ('image/jpeg','image/png','image/webp')) or size is null or size not between 1 and 20971520 then raise exception 'Use supported images, PDF, DOCX, XLSX or TXT files up to 20 MB'; end if;
  f.id:=gen_random_uuid();f.object_path:=org::text||'/'||job::text||'/'||f.id::text||ext;
  insert into public.job_files(id,organisation_id,job_id,category,name,mime_type,byte_size,object_path,caption,uploaded_by)
   values(f.id,org,job,cat,btrim(p_data->>'name'),mime,size,f.object_path,btrim(coalesce(p_data->>'caption','')),auth.uid()) returning * into f;
 else
  select * into f from public.job_files where id=(p_data->>'id')::uuid and organisation_id=org and not archived for update;
  if not found or (f.category='private' and not manager) then raise exception 'File unavailable'; end if;
  if p_action='finish' then
   if f.uploaded_by is distinct from auth.uid() or (f.category<>'images' and not manager) then raise exception 'Upload ownership required'; end if;
   if not exists(select 1 from storage.objects where bucket_id='job-files' and name=f.object_path) then raise exception 'Upload the file before finishing'; end if;
   update public.job_files set ready=true where id=f.id;
  else
   if not manager then raise exception 'Office access required'; end if;
   update public.job_files set archived=true where id=f.id;
  end if;
 end if;
 result:=jsonb_build_object('id',f.id,'object_path',f.object_path);
 insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(org,p_request_id,fingerprint,result);
 insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
 values(org,auth.uid(),'job_file_'||p_action,'Job file '||p_action,jsonb_build_object('id',f.id,'job_id',f.job_id));
 return result;
end $$;

create table public.job_scaffolds(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,job_id uuid not null,
 reference text not null check(length(reference) between 1 and 100),
 location text not null check(length(location) between 1 and 1000),description text not null check(length(description) between 1 and 3000),
 erected_on date not null check(erected_on between date '2000-01-01' and date '2199-12-31'),
 dismantled boolean not null default false,inspection_required boolean not null default true,
 required_reason text not null default 'Initial inspection before first use',required_at timestamptz,
 version integer not null default 1,created_at timestamptz not null default now(),
 unique(organisation_id,id),unique(organisation_id,job_id,reference),
 foreign key(organisation_id,job_id) references public.jobs(organisation_id,id)
);
create index job_scaffolds_job on public.job_scaffolds(organisation_id,job_id,dismantled);
create table public.scaffold_inspection_reports(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,scaffold_id uuid not null,
 inspector_id uuid references auth.users(id) on delete set null,inspector_name text not null,inspector_position text not null,
 inspector_scope text not null,qualification_status text not null default 'not_verified' check(qualification_status='not_verified'),inspection_for text not null check(length(inspection_for) between 1 and 2000),
 inspected_at timestamptz not null,recorded_at timestamptz not null default now(),
 reason text not null check(reason in ('initial','weekly','alteration','weather','other')),
 outcome text not null check(outcome in ('safe','unsafe')),checks jsonb not null,
 findings text not null check(length(findings) between 1 and 5000),
 action_taken text not null check(length(action_taken) between 1 and 5000),
 further_action text not null check(length(further_action) between 1 and 5000),
 scaffold_snapshot jsonb not null,scaffold_version integer not null,
 foreign key(organisation_id,scaffold_id) references public.job_scaffolds(organisation_id,id)
);
create index scaffold_reports_history on public.scaffold_inspection_reports(organisation_id,scaffold_id,inspected_at desc,recorded_at desc);
create index scaffold_reports_inspector on public.scaffold_inspection_reports(inspector_id);
create table public.scaffold_events(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,scaffold_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,action text not null,note text not null,
 created_at timestamptz not null default now(),
 foreign key(organisation_id,scaffold_id) references public.job_scaffolds(organisation_id,id)
);
create index scaffold_events_history on public.scaffold_events(organisation_id,scaffold_id,created_at);
create index scaffold_events_actor on public.scaffold_events(actor_id);
alter table public.job_scaffolds enable row level security;
alter table public.scaffold_inspection_reports enable row level security;
alter table public.scaffold_events enable row level security;
revoke all on public.job_scaffolds,public.scaffold_inspection_reports,public.scaffold_events from public,anon,authenticated;
grant select on public.job_scaffolds,public.scaffold_inspection_reports,public.scaffold_events to authenticated;
create policy scaffold_read on public.job_scaffolds for select to authenticated using(organisation_id=(select public.operations_member_org()));
create policy scaffold_report_read on public.scaffold_inspection_reports for select to authenticated using(organisation_id=(select public.operations_member_org()));
create policy scaffold_event_read on public.scaffold_events for select to authenticated using(organisation_id=(select public.operations_member_org()));
create function public.scaffold_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();manager boolean;
begin
 if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
 manager:=public.workspace_organisation_id() is not null;
 return jsonb_build_object('organisation_id',org,'server_now',now(),'can_manage',manager,'can_inspect',true,
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'site',site,'archived',archived) order by code) from public.jobs where organisation_id=org),'[]'::jsonb),
 'scaffolds',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('latest_report',r.report,'next_due',r.inspected_at+interval '168 hours') order by s.reference)
 from public.job_scaffolds s left join lateral(select to_jsonb(x) report,x.inspected_at from public.scaffold_inspection_reports x
 where x.organisation_id=org and x.scaffold_id=s.id order by x.inspected_at desc,x.recorded_at desc limit 1) r on true where s.organisation_id=org),'[]'::jsonb));
end $$;
create function public.scaffold_review_alerts() returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=public.workspace_organisation_id();
begin
 if auth.uid() is null or org is null then raise exception 'Office access required'; end if;
 return jsonb_build_object('organisation_id',org,'unverified',(
 select count(*) from public.scaffold_inspection_reports where organisation_id=org and qualification_status='not_verified'));
end $$;
create function public.scaffold_history(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();
begin
 if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
 if not exists(select 1 from public.job_scaffolds where organisation_id=org and id=p_id) then raise exception 'Scaffold unavailable'; end if;
 return jsonb_build_object('organisation_id',org,'reports',coalesce((select jsonb_agg(to_jsonb(r) order by inspected_at desc,recorded_at desc) from public.scaffold_inspection_reports r where organisation_id=org and scaffold_id=p_id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('action',action,'note',note,'created_at',created_at) order by created_at desc) from public.scaffold_events where organisation_id=org and scaffold_id=p_id),'[]'::jsonb));
end $$;

create function public.scaffold_save(p_action text,p_data jsonb,p_request_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();manager boolean;s public.job_scaffolds;r public.scaffold_inspection_reports;
 receipt public.workspace_mutations;fingerprint text;result jsonb;person uuid;scope text;key text;checks jsonb;inspected timestamptz;latest timestamptz;outcome text;note text;
begin
 if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
 manager:=public.workspace_organisation_id() is not null;
 if p_action is null or p_action not in ('scaffold','dismantle','flag','inspect') or p_request_id is null or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>40000 then raise exception 'Invalid scaffold request'; end if;
 if p_data ?| array['organisation_id','inspector_id','inspector_name','next_due','recorded_at','scaffold_snapshot'] then raise exception 'Ownership and report identity are assigned by the server'; end if;
 if p_action in ('scaffold','dismantle') and not manager then raise exception 'Office access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 fingerprint:=md5(auth.uid()::text||'scaffold-v18:'||p_action||p_data::text);
 select * into receipt from public.workspace_mutations where organisation_id=org and request_id=p_request_id;
 if found then
  if receipt.fingerprint<>fingerprint then raise exception 'Request changed. Start a new save'; end if;
  return receipt.result;
 end if;
  if nullif(p_data->>'id','') is not null then
   select * into s from public.job_scaffolds where id=(p_data->>'id')::uuid and organisation_id=org for update;
   if not found or s.version is distinct from (p_data->>'version')::integer then raise exception 'Scaffold changed or unavailable. Refresh and try again'; end if;
  elsif p_action<>'scaffold' then raise exception 'Scaffold required';
  end if;
  if p_action='scaffold' then
   if s.id is not null then raise exception 'Existing scaffold identities are retained. Register a new scaffold after dismantling'; end if;
   if not exists(select 1 from public.jobs where id=(p_data->>'job_id')::uuid and organisation_id=org and not archived) then raise exception 'Active company job required'; end if;
   if (p_data->>'erected_on')::date>(now() at time zone 'Europe/London')::date then raise exception 'Register erected scaffolds only'; end if;
   insert into public.job_scaffolds(organisation_id,job_id,reference,location,description,erected_on)
   values(org,(p_data->>'job_id')::uuid,btrim(p_data->>'reference'),btrim(p_data->>'location'),btrim(p_data->>'description'),(p_data->>'erected_on')::date) returning * into s;
  elsif p_action='dismantle' then
   if (p_data->>'confirmed')::boolean is distinct from true then raise exception 'Confirm the scaffold has been physically dismantled'; end if;
   if s.dismantled then raise exception 'Already dismantled'; end if;
   update public.job_scaffolds set dismantled=true,version=version+1 where id=s.id;
  elsif p_action='flag' then
   if s.dismantled then raise exception 'Scaffold is dismantled'; end if;
   note:=btrim(coalesce(p_data->>'reason',''));
   if length(note) not between 1 and 2000 then raise exception 'Describe why another inspection is required'; end if;
   update public.job_scaffolds set inspection_required=true,required_reason=note,required_at=now(),version=version+1 where id=s.id;
  elsif p_action='inspect' then
   if s.dismantled then raise exception 'Scaffold is dismantled'; end if;
   if (p_data->>'confirmed')::boolean is distinct from true then raise exception 'Confirm you are competent for this scaffold and the report is accurate'; end if;
   inspected:=(p_data->>'inspected_at')::timestamptz;
   select max(inspected_at) into latest from public.scaffold_inspection_reports where organisation_id=org and scaffold_id=s.id;
   if inspected is null or not isfinite(inspected) or inspected>now() or (inspected at time zone 'Europe/London')::date<s.erected_on
    or (latest is not null and inspected<=latest) then raise exception 'Choose an inspection time after erection and the previous report, not in the future'; end if;
   if s.required_at is not null and inspected<s.required_at then raise exception 'Inspection must take place after the latest reported event'; end if;
   checks:=p_data->'checks';outcome:=p_data->>'outcome';
   if jsonb_typeof(checks) is distinct from 'object' or outcome is null or outcome not in ('safe','unsafe') then raise exception 'Complete the inspection checklist and outcome'; end if;
   if (select count(*) from jsonb_object_keys(checks))<>10 then raise exception 'Complete exactly the ten checklist items'; end if;
   foreach key in array array['foundations','standards','bracing','ties','platforms','edge_protection','access','loading','design','surroundings'] loop
    if coalesce(checks->>key,'') not in ('pass','fail','na') then raise exception 'Complete every checklist item'; end if;
   end loop;
   if outcome='safe' and (exists(select 1 from jsonb_each_text(checks) where value='fail') or not exists(select 1 from jsonb_each_text(checks) where value='pass')) then raise exception 'A failed check requires Do not use; a satisfactory report must include applicable checks'; end if;
   if btrim(coalesce(p_data->>'inspector_position',''))='' or length(p_data->>'inspector_position')>160 then raise exception 'Enter your position'; end if;
   scope:='Qualifications not verified - office review required. Qualification rules are not configured.';
   insert into public.scaffold_inspection_reports(organisation_id,scaffold_id,inspector_id,inspector_name,inspector_position,inspector_scope,inspection_for,inspected_at,reason,outcome,checks,findings,action_taken,further_action,scaffold_snapshot,scaffold_version)
   select org,s.id,auth.uid(),coalesce(nullif(p.full_name,''),u.email),btrim(p_data->>'inspector_position'),scope,
    btrim(p_data->>'inspection_for'),inspected,p_data->>'reason',outcome,checks,
    btrim(p_data->>'findings'),btrim(p_data->>'action_taken'),btrim(p_data->>'further_action'),
    to_jsonb(s)||jsonb_build_object('job_code',j.code,'job_site',j.site),s.version
   from public.profiles p join auth.users u on u.id=p.id join public.jobs j on j.id=s.job_id and j.organisation_id=org where p.id=auth.uid() returning * into r;
   if r.id is null then raise exception 'Inspector profile unavailable'; end if;
   update public.job_scaffolds set inspection_required=outcome='unsafe',required_reason=case when outcome='unsafe' then 'Unsafe inspection - do not use' else '' end,
    required_at=case when outcome='unsafe' then inspected else null end,version=version+1 where id=s.id;
  end if;
  insert into public.scaffold_events(organisation_id,scaffold_id,actor_id,action,note)
   values(org,s.id,auth.uid(),p_action,coalesce(note,case when p_action='inspect' then outcome else p_action end));
  result:=jsonb_build_object('id',s.id,'report_id',r.id);
 insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(org,p_request_id,fingerprint,result);
 insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
  values(org,auth.uid(),'scaffold_'||p_action,'Scaffold '||p_action,result);
 return result;
end $$;
revoke all on function public.job_resources_snapshot(uuid),public.job_file_save(text,jsonb,uuid),public.scaffold_snapshot(),public.scaffold_history(uuid),public.scaffold_save(text,jsonb,uuid),public.scaffold_review_alerts() from public,anon,authenticated;
grant execute on function public.job_resources_snapshot(uuid),public.job_file_save(text,jsonb,uuid),public.scaffold_snapshot(),public.scaffold_history(uuid),public.scaffold_save(text,jsonb,uuid),public.scaffold_review_alerts() to authenticated;
commit;

-- v21: checked permanent deletion. Apply once AFTER v20, in one transaction.
begin;
do $$ begin
 if to_regprocedure('public.notifications_snapshot(bigint,integer)') is null then raise exception 'Install v20 before v21';end if;
end $$;
alter table public.job_files add column deletion_pending boolean not null default false;
create index job_files_pending_deletion on public.job_files(organisation_id,job_id) where deletion_pending;

-- Actual bytes MUST be deleted through Storage API, never by deleting storage metadata in SQL.
-- A checked begin call hides the file and authorises its exact object key for deletion.
create function c360_private.job_file_delete_access(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.job_files f where f.object_path=p_path
 and f.organisation_id=public.workspace_organisation_id() and f.deletion_pending)
$$;
revoke all on function c360_private.job_file_delete_access(text) from public,anon,authenticated;
grant execute on function c360_private.job_file_delete_access(text) to authenticated;
create policy job_objects_pending_delete_read on storage.objects for select to authenticated
 using(bucket_id='job-files' and c360_private.job_file_delete_access(name));
create policy job_objects_permanent_delete on storage.objects for delete to authenticated
 using(bucket_id='job-files' and c360_private.job_file_delete_access(name));

create function public.job_file_delete(p_action text,p_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=public.workspace_organisation_id();f public.job_files;receipt public.workspace_mutations;fingerprint text;result jsonb;
begin
 if org is null then raise exception 'Active company Admin or Operations access required';end if;
 if p_action is null or p_action not in ('begin','finish') or p_id is null or p_request_id is null then raise exception 'Invalid deletion request';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 fingerprint:=md5(auth.uid()::text||'job-file-delete-v21:'||p_action||p_id::text);
 select * into receipt from public.workspace_mutations where organisation_id=org and request_id=p_request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'Request changed';end if;return receipt.result;end if;
 select * into f from public.job_files where organisation_id=org and id=p_id for update;
 if not found then raise exception 'File unavailable';end if;
 if not f.ready then raise exception 'Wait until the upload completes before deleting this file';end if;
 if p_action='begin' then
  update public.job_files set deletion_pending=true,archived=true where organisation_id=org and id=p_id;
  result:=jsonb_build_object('id',f.id,'object_path',f.object_path,'job_id',f.job_id);
 else
  if not f.deletion_pending then raise exception 'Confirm deletion first';end if;
  if exists(select 1 from storage.objects where bucket_id='job-files' and name=f.object_path) then raise exception 'Storage deletion is not complete. Retry Delete to finish';end if;
  delete from public.job_files where organisation_id=org and id=p_id;
  result:=jsonb_build_object('id',f.id,'deleted',true,'job_id',f.job_id);
  insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
   values(org,auth.uid(),'job_file_deleted','Permanently deleted job file',jsonb_build_object('id',f.id,'job_id',f.job_id));
 end if;
 insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(org,p_request_id,fingerprint,result);
 return result;
end $$;

alter function public.job_resources_snapshot(uuid) set schema c360_private;
alter function c360_private.job_resources_snapshot(uuid) rename to job_resources_snapshot_v20;
revoke all on function c360_private.job_resources_snapshot_v20(uuid) from public,anon,authenticated;
create function public.job_resources_snapshot(p_job_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;org uuid:=public.operations_member_org();begin
 result:=c360_private.job_resources_snapshot_v20(p_job_id);
 if org=public.workspace_organisation_id() then
  result:=result||jsonb_build_object('files',(result->'files')||coalesce((select jsonb_agg(to_jsonb(f) order by created_at desc,id) from public.job_files f
   where f.organisation_id=org and f.job_id=p_job_id and f.deletion_pending),'[]'));
 end if;
 return result;
end $$;

-- Retain a minimal deletion marker (not the task) to prevent an old draft recreating its ID.
create table c360_private.deleted_planner_bookings(
 organisation_id uuid not null references public.organisations(id),booking_id uuid not null,
 deleted_at timestamptz not null default now(),primary key(organisation_id,booking_id)
);
alter table c360_private.deleted_planner_bookings enable row level security;
revoke all on c360_private.deleted_planner_bookings from public,anon,authenticated;
create function public.planner_delete(p_id uuid,p_version integer,p_confirmed boolean,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=public.workspace_organisation_id();b public.planner_bookings;receipt public.workspace_mutations;fingerprint text;result jsonb;audience uuid[];job_label text;
begin
 if org is null then raise exception 'Active company Admin or Operations access required';end if;
 if p_id is null or p_version is null or p_confirmed is distinct from true or p_request_id is null then raise exception 'Confirm permanent task deletion';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 fingerprint:=md5(auth.uid()::text||'planner-delete-v21:'||p_id::text||':'||p_version::text);
 select * into receipt from public.workspace_mutations where organisation_id=org and request_id=p_request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'Request changed';end if;return receipt.result;end if;
 select * into b from public.planner_bookings where organisation_id=org and id=p_id for update;
 if not found or b.version is distinct from p_version then raise exception 'Task changed or unavailable. Refresh and try again';end if;
 select coalesce(array_agg(s.user_id) filter(where s.user_id is not null),'{}') into audience from public.planner_assignments a
 join public.staff_members s on s.organisation_id=a.organisation_id and s.id=a.staff_id where a.organisation_id=org and a.booking_id=p_id and s.is_active and not s.archived;
 audience:=audience||c360_private.job_recipients(org,b.job_id);
 select code||' · '||site into job_label from public.jobs where organisation_id=org and id=b.job_id;
 delete from public.planner_assignments where organisation_id=org and booking_id=p_id;
 delete from public.planner_bookings where organisation_id=org and id=p_id;
 insert into c360_private.deleted_planner_bookings(organisation_id,booking_id) values(org,p_id);
 perform c360_private.notify(org,'Task permanently deleted',job_label,'planner',p_id,audience);
 insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
 values(org,auth.uid(),'planner_task_deleted','Permanently deleted Planner task',jsonb_build_object('id',p_id,'job_id',b.job_id));
 result:=jsonb_build_object('id',p_id,'deleted',true);
 insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(org,p_request_id,fingerprint,result);
 return result;
end $$;
alter function public.operations_save(text,jsonb,uuid) set schema c360_private;
alter function c360_private.operations_save(text,jsonb,uuid) rename to operations_save_v19;
revoke all on function c360_private.operations_save_v19(text,jsonb,uuid) from public,anon,authenticated;
create function public.operations_save(p_kind text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=public.workspace_organisation_id();begin
 if org is null then raise exception 'Active company Admin or Operations access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 if p_kind in ('booking','cancel_booking') and exists(select 1 from c360_private.deleted_planner_bookings where organisation_id=org and booking_id=nullif(p_data->>'id','')::uuid) then
  raise exception 'This task was permanently deleted. Create a new task instead';end if;
 return c360_private.operations_save_v19(p_kind,p_data,p_request_id);
end $$;
revoke all on function public.job_file_delete(text,uuid,uuid),public.planner_delete(uuid,integer,boolean,uuid),public.job_resources_snapshot(uuid),public.operations_save(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.job_file_delete(text,uuid,uuid),public.planner_delete(uuid,integer,boolean,uuid),public.job_resources_snapshot(uuid),public.operations_save(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

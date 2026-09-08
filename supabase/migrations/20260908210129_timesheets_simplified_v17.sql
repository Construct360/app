-- v17: validate new saves in whole/half hours; retain historical records and pay.
-- Requires v16. Run this entire file before uploading v17 application files.
begin;
do $$ begin
 if to_regprocedure('public.timesheet_save(text,jsonb,uuid)') is null then raise exception 'Install v16 before v17'; end if;
end $$;
create or replace function public.timesheet_save(p_action text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 org uuid:=public.operations_member_org(); manager boolean; t public.timesheets; s public.staff_members;
 receipt public.workspace_mutations; fingerprint text; result jsonb; week date; version integer; clean jsonb:='[]';
 entry jsonb; day date; hours numeric; total numeric:=0; job uuid; job_label text; notes text; reason text; new_status text;
begin
 if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
 manager:=public.workspace_organisation_id() is not null;
 if p_action is null or p_action not in ('save','submit','return','approve') or p_request_id is null or jsonb_typeof(p_data) is distinct from 'object'
   or length(p_data::text)>100000 then raise exception 'Invalid timesheet request'; end if;
 if p_data ?| array['organisation_id','staff_id','owner_user_id','staff_name','hourly_rate','gross_estimate','status','total_hours','approved_at','submitted_at'] then raise exception 'Identity, status, totals and pay are assigned by the server'; end if;
 if p_action in ('return','approve') and not manager then raise exception 'Company Admin or Operations access required'; end if;
 fingerprint:=md5(auth.uid()::text||'timesheet-v16:'||p_action||p_data::text);
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 select * into receipt from public.workspace_mutations where organisation_id=org and request_id=p_request_id;
 if found then
  if receipt.fingerprint<>fingerprint then raise exception 'Request changed. Start a new save'; end if;
  return receipt.result;
 end if;
 version:=coalesce((p_data->>'version')::integer,0);
 if p_action in ('save','submit') then
  select * into s from public.staff_members where organisation_id=org and user_id=auth.uid() and is_active and not archived;
  if not found then raise exception 'An active linked staff profile is required to enter your own timesheet'; end if;
  week:=(p_data->>'week_start')::date;
  if week is null or not isfinite(week) or extract(isodow from week)<>1 or week not between date '2000-01-03' and date '2199-12-23' then raise exception 'Choose a valid Monday'; end if;
  select * into t from public.timesheets where organisation_id=org and staff_id=s.id and week_start=week for update;
  if not found then
   if version<>0 or nullif(p_data->>'id','') is not null then raise exception 'Timesheet changed or unavailable. Close, refresh and try again'; end if;
   t.id:=gen_random_uuid();t.version:=0;t.status:='draft';t.entries:='[]';
  elsif t.owner_user_id is distinct from auth.uid() or t.id is distinct from nullif(p_data->>'id','')::uuid or t.version<>version then
   raise exception 'Timesheet changed or unavailable. Close, refresh and try again';
  end if;
  if t.status not in ('draft','returned') then raise exception 'Submitted and approved timesheets are locked. Ask the office to return a submitted week for correction'; end if;
  if jsonb_typeof(p_data->'entries') is distinct from 'array' or jsonb_array_length(p_data->'entries')>70 then raise exception 'Supply no more than 70 daily entries'; end if;
  for entry in select value from jsonb_array_elements(p_data->'entries') loop
   if jsonb_typeof(entry) is distinct from 'object' then raise exception 'Invalid daily entry'; end if;
   day:=(entry->>'date')::date;hours:=(entry->>'hours')::numeric;notes:=btrim(coalesce(entry->>'notes',''));
   if day is null or day<week or day>week+6 or not isfinite(day) or hours is null or hours<0 or hours>24 or mod(hours,0.5)<>0 or hours::text in ('NaN','Infinity','-Infinity')
    or length(notes)>1000 then raise exception 'Enter daily hours from 0 to 24 (whole or half hours only), within the selected week'; end if;
   if hours>0 and day>(now() at time zone 'Europe/London')::date then raise exception 'Future hours cannot be recorded as work already completed'; end if;
   job:=nullif(entry->>'job_id','')::uuid;job_label:='';
   if job is not null then
    select j.code||' - '||j.site into job_label from public.jobs j where j.organisation_id=org and j.id=job and
     ((not j.archived and (manager or exists(select 1 from public.planner_bookings b join public.planner_assignments a on a.booking_id=b.id and a.organisation_id=org
       where b.organisation_id=org and b.job_id=j.id and b.status='scheduled' and a.staff_id=s.id and b.starts_at<(week+7)::timestamp and b.ends_at>=week::timestamp)))
      or exists(select 1 from jsonb_array_elements(t.entries) old where old->>'job_id'=job::text));
    if not found then raise exception 'Choose an available job assigned to you for this week, or leave Job blank'; end if;
   end if;
   clean:=clean||jsonb_build_array(jsonb_build_object('date',day,'hours',hours,'job_id',job,'job_label',job_label,'notes',notes));total:=total+hours;
  end loop;
  if exists(select 1 from jsonb_array_elements(clean) e group by e->>'date' having sum((e->>'hours')::numeric)>24 or count(*)>10) then raise exception 'A day can contain at most 24 total hours and 10 entries'; end if;
  if p_action='submit' and (total<=0 or (p_data->>'confirmed')::boolean is distinct from true) then raise exception 'Enter some worked hours and confirm the week is complete before submitting'; end if;
  new_status:=case when p_action='submit' then 'submitted' else 'draft' end;
  insert into public.timesheets(id,organisation_id,staff_id,owner_user_id,staff_name,week_start,status,entries,total_hours,submitted_at)
   values(t.id,org,s.id,auth.uid(),s.full_name,week,new_status,clean,total,case when p_action='submit' then now() else null end)
   on conflict(id) do update set staff_name=excluded.staff_name,status=excluded.status,entries=excluded.entries,total_hours=excluded.total_hours,
    submitted_at=case when p_action='submit' then now() else timesheets.submitted_at end,
    review_note=case when p_action='submit' then '' else timesheets.review_note end,updated_at=now(),version=timesheets.version+1;
 else
  select * into t from public.timesheets where organisation_id=org and id=nullif(p_data->>'id','')::uuid for update;
  if not found or t.version<>version then raise exception 'Timesheet changed or unavailable. Close, refresh and try again'; end if;
  if t.status<>'submitted' then raise exception 'Only submitted timesheets can be approved or returned'; end if;
  reason:=btrim(coalesce(p_data->>'reason',''));
  if length(reason)>2000 or (p_action='return' and reason='') then raise exception 'Enter a reason for returning the week (maximum 2000 characters)'; end if;
  if p_action='approve' then
   if (p_data->>'confirmed')::boolean is distinct from true then raise exception 'Confirm you reviewed the hours and hourly rate'; end if;
   select * into s from public.staff_members where organisation_id=org and id=t.staff_id;
   if s.hourly_rate is null then raise exception 'Set this staff member''s hourly rate in Staff before approving'; end if;
   -- Check the rate the reviewer actually saw; a changed rate requires refresh.
   if nullif(p_data->>'expected_rate','')::numeric is distinct from s.hourly_rate then raise exception 'The hourly rate changed. Close, refresh and review again'; end if;
   insert into public.timesheet_pay(organisation_id,timesheet_id,hourly_rate,gross_estimate) values(org,t.id,s.hourly_rate,round(t.total_hours*s.hourly_rate,2));
  end if;
  new_status:=case when p_action='approve' then 'approved' else 'returned' end;
  update public.timesheets set status=new_status,review_note=reason,approved_at=case when p_action='approve' then now() else null end,updated_at=now(),version=timesheets.version+1 where id=t.id;
 end if;
 select * into t from public.timesheets where id=t.id;
 insert into public.timesheet_events(organisation_id,timesheet_id,actor_id,action,note,version,entries)
  values(org,t.id,auth.uid(),p_action,coalesce(reason,''),t.version,t.entries);
 result:=jsonb_build_object('id',t.id,'status',t.status,'version',t.version);
 insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(org,p_request_id,fingerprint,result);
 insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
  values(org,auth.uid(),'timesheet_'||p_action,'Timesheet '||p_action,result);
 return result;
end $$;

revoke all on function public.timesheet_save(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.timesheet_save(text,jsonb,uuid) to authenticated;
commit;

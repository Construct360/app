-- v16: saved daily hours, weekly submission, office approval and private pay.
-- Apply once, in full, after v15. No existing data or account changes.
begin;
do $$ begin
 if to_regprocedure('public.vehicles_snapshot()') is null then raise exception 'Install v15 before v16'; end if;
end $$;
create table public.timesheets (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null,
 staff_id uuid not null, owner_user_id uuid references auth.users(id) on delete set null,
 staff_name text not null, week_start date not null check(extract(isodow from week_start)=1 and week_start between date '2000-01-03' and date '2199-12-23'),
 status text not null default 'draft' check(status in ('draft','submitted','returned','approved')),
 entries jsonb not null default '[]'::jsonb check(jsonb_typeof(entries)='array'),
 total_hours numeric(5,2) not null default 0 check(total_hours between 0 and 168),
 review_note text not null default '' check(length(review_note)<=2000),
 submitted_at timestamptz, approved_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organisation_id,id), unique(organisation_id,staff_id,week_start),
 foreign key(organisation_id,staff_id) references public.staff_members(organisation_id,id)
);
create index timesheets_week on public.timesheets(organisation_id,week_start,status);
create index timesheets_owner on public.timesheets(owner_user_id,organisation_id,week_start);
create table public.timesheet_pay (
 organisation_id uuid not null, timesheet_id uuid primary key,
 hourly_rate numeric(5,2) not null check(hourly_rate between 0 and 999.99),
 gross_estimate numeric(10,2) not null check(gross_estimate>=0),
 captured_at timestamptz not null default now(),
 foreign key(organisation_id,timesheet_id) references public.timesheets(organisation_id,id)
);
create index timesheet_pay_company on public.timesheet_pay(organisation_id,timesheet_id);
create table public.timesheet_events (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, timesheet_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null check(action in ('save','submit','return','approve')),
 note text not null default '' check(length(note)<=2000),
 version integer not null, entries jsonb not null, created_at timestamptz not null default now(),
 foreign key(organisation_id,timesheet_id) references public.timesheets(organisation_id,id)
);
create index timesheet_events_history on public.timesheet_events(organisation_id,timesheet_id,version);
create index timesheet_events_actor on public.timesheet_events(actor_id);
alter table public.timesheets enable row level security;
alter table public.timesheet_pay enable row level security;
alter table public.timesheet_events enable row level security;
revoke all on public.timesheets,public.timesheet_pay,public.timesheet_events from public,anon,authenticated;
grant select on public.timesheets,public.timesheet_pay,public.timesheet_events to authenticated;
create policy timesheets_read on public.timesheets for select to authenticated using
 (organisation_id=(select public.operations_member_org()) and (owner_user_id=(select auth.uid()) or organisation_id=(select public.workspace_organisation_id())));
-- Pay and internal audit snapshots are never readable by field roles, even for
-- their own sheet. The member RPC exposes only sanitised status history.
create policy timesheet_pay_office on public.timesheet_pay for select to authenticated using(organisation_id=(select public.workspace_organisation_id()));
create policy timesheet_events_office on public.timesheet_events for select to authenticated using(organisation_id=(select public.workspace_organisation_id()));

create function public.timesheets_snapshot(p_week date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org(); manager boolean; self public.staff_members;
begin
 if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
 if p_week is null or not isfinite(p_week) or extract(isodow from p_week)<>1 or p_week not between date '2000-01-03' and date '2199-12-23' then raise exception 'Choose a valid Monday'; end if;
 manager:=public.workspace_organisation_id() is not null;
 select * into self from public.staff_members where organisation_id=org and user_id=auth.uid() and is_active and not archived;
 return jsonb_build_object('organisation_id',org,'week_start',p_week,'can_review',manager,
  'self_staff',case when self.id is not null then jsonb_build_object('id',self.id,'full_name',self.full_name) else null end,
  'sheets',coalesce((select jsonb_agg(to_jsonb(t)||case when manager then jsonb_build_object(
    'hourly_rate',case when t.status='approved' then pay.hourly_rate else s.hourly_rate end,
    'gross_estimate',case when t.status='approved' then pay.gross_estimate else round(t.total_hours*s.hourly_rate,2) end,
    'rate_captured_at',pay.captured_at) else '{}'::jsonb end order by t.staff_name,t.id)
    from public.timesheets t join public.staff_members s on s.organisation_id=org and s.id=t.staff_id
    left join public.timesheet_pay pay on pay.organisation_id=org and pay.timesheet_id=t.id
    where t.organisation_id=org and t.week_start=p_week and (manager or t.owner_user_id=auth.uid())),'[]'::jsonb),
  'staff',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'full_name',s.full_name,'hourly_rate',s.hourly_rate,'can_submit',s.user_id is not null and exists
    (select 1 from public.organisation_memberships m where m.user_id=s.user_id and m.organisation_id=org and m.is_active)) order by s.full_name)
    from public.staff_members s where organisation_id=org and is_active and not archived),'[]'::jsonb) else '[]'::jsonb end,
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'label',j.code||' - '||j.site) order by j.code)
    from public.jobs j where j.organisation_id=org and not j.archived and (manager or exists
    (select 1 from public.planner_bookings b join public.planner_assignments a on a.organisation_id=org and a.booking_id=b.id
     where b.organisation_id=org and b.job_id=j.id and b.status='scheduled' and a.staff_id=self.id
       and b.starts_at<(p_week+7)::timestamp and b.ends_at>=p_week::timestamp))),'[]'::jsonb));
end $$;

create function public.timesheet_history(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org(); manager boolean; t public.timesheets;
begin
 if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
 manager:=public.workspace_organisation_id() is not null;
 select * into t from public.timesheets where id=p_id and organisation_id=org and (manager or owner_user_id=auth.uid());
 if not found then raise exception 'Timesheet unavailable'; end if;
 return jsonb_build_object('organisation_id',org,'timesheet_id',t.id,'events',coalesce((select jsonb_agg(jsonb_build_object(
  'action',e.action,'note',e.note,'version',e.version,'created_at',e.created_at) order by e.version desc)
  from public.timesheet_events e where organisation_id=org and timesheet_id=t.id and action<>'save'),'[]'::jsonb));
end $$;

create function public.timesheet_save(p_action text,p_data jsonb,p_request_id uuid) returns jsonb
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
   if day is null or day<week or day>week+6 or not isfinite(day) or hours is null or hours<0 or hours>24 or hours<>round(hours,2) or hours::text in ('NaN','Infinity','-Infinity')
    or length(notes)>1000 then raise exception 'Enter daily hours from 0 to 24 (up to two decimal places), within the selected week'; end if;
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
revoke all on function public.timesheets_snapshot(date),public.timesheet_history(uuid),public.timesheet_save(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.timesheets_snapshot(date),public.timesheet_history(uuid),public.timesheet_save(text,jsonb,uuid) to authenticated;
commit;

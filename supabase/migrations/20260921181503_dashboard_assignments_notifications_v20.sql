-- v20. Apply once, in full, AFTER v19. No historic notifications are backfilled.
begin;
do $$ begin
 if to_regprocedure('public.annual_leave_save(text,jsonb,uuid)') is null then raise exception 'Install v19 before v20'; end if;
end $$;
alter table public.jobs add column site_address text not null default '' check(length(site_address)<=1500),
 add column supervisor_staff_id uuid,
 add foreign key(organisation_id,supervisor_staff_id) references public.staff_members(organisation_id,id);
create index jobs_supervisor on public.jobs(organisation_id,supervisor_staff_id);
create table public.job_staff_assignments(
 organisation_id uuid not null,job_id uuid not null,staff_id uuid not null,
 primary key(organisation_id,job_id,staff_id),
 foreign key(organisation_id,job_id) references public.jobs(organisation_id,id),
 foreign key(organisation_id,staff_id) references public.staff_members(organisation_id,id)
);
create index job_staff_person on public.job_staff_assignments(organisation_id,staff_id,job_id);
alter table public.job_staff_assignments enable row level security;
revoke all on public.job_staff_assignments from public,anon,authenticated;
grant select on public.job_staff_assignments to authenticated;
create policy job_staff_office on public.job_staff_assignments for select to authenticated
 using(organisation_id=(select public.workspace_organisation_id()));

-- Server-authored event content; no user-supplied HTML, private notes or pay copied.
create table public.workspace_notifications(
 id bigint generated always as identity primary key,organisation_id uuid not null references public.organisations(id),
 created_at timestamptz not null default now(),title text not null,body text not null,
 entity_kind text not null check(entity_kind in ('job','vehicle','timesheets','planner','staff')),
 entity_id uuid,office_only boolean not null default false,recipients uuid[] not null default '{}',
 unique(organisation_id,id)
);
create index notifications_company on public.workspace_notifications(organisation_id,id desc);
create index notifications_recipients on public.workspace_notifications using gin(recipients);
create table public.workspace_notification_reads(
 organisation_id uuid not null,notification_id bigint not null,user_id uuid not null references auth.users(id) on delete cascade,
 read_at timestamptz not null default now(),primary key(user_id,notification_id),
 foreign key(organisation_id,notification_id) references public.workspace_notifications(organisation_id,id)
);
create index notification_reads_event on public.workspace_notification_reads(organisation_id,notification_id);
alter table public.workspace_notifications enable row level security;
alter table public.workspace_notification_reads enable row level security;
revoke all on public.workspace_notifications,public.workspace_notification_reads from public,anon,authenticated;
-- Recipient identities are deliberately not exposed through the public API.
grant select(id,organisation_id,created_at,title,body,entity_kind,entity_id,office_only) on public.workspace_notifications to authenticated;
grant select on public.workspace_notification_reads to authenticated;
create policy notifications_read on public.workspace_notifications for select to authenticated using(
 organisation_id=(select public.operations_member_org()) and
 (organisation_id=(select public.workspace_organisation_id()) or (not office_only and recipients @> array[(select auth.uid())]))
);
create policy notification_reads_own on public.workspace_notification_reads for select to authenticated using(
 organisation_id=(select public.operations_member_org()) and user_id=(select auth.uid())
);

-- Private helpers are callable only by checked RPCs / triggers, never clients.
create function c360_private.job_recipients(p_org uuid,p_job uuid) returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct s.user_id),'{}'::uuid[]) from public.staff_members s
 join public.organisation_memberships m on m.user_id=s.user_id and m.organisation_id=s.organisation_id and m.is_active
 where s.organisation_id=p_org and s.is_active and not s.archived and (
 exists(select 1 from public.jobs j where j.organisation_id=p_org and j.id=p_job and j.supervisor_staff_id=s.id) or
 exists(select 1 from public.job_staff_assignments a where a.organisation_id=p_org and a.job_id=p_job and a.staff_id=s.id) or
 exists(select 1 from public.planner_assignments a join public.planner_bookings b on b.id=a.booking_id and b.organisation_id=a.organisation_id
 where a.organisation_id=p_org and a.staff_id=s.id and b.job_id=p_job and b.status='scheduled' and b.ends_at>=now()))
$$;
create function c360_private.staff_recipient(p_org uuid,p_staff uuid) returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.user_id),'{}'::uuid[]) from public.staff_members s
 join public.organisation_memberships m on m.user_id=s.user_id and m.organisation_id=s.organisation_id and m.is_active
 where s.organisation_id=p_org and s.id=p_staff and s.is_active and not s.archived
$$;
create function c360_private.notify(p_org uuid,p_title text,p_body text,p_kind text,p_id uuid,p_recipients uuid[],p_office boolean default false)
 returns void language sql security definer set search_path='' as $$
 insert into public.workspace_notifications(organisation_id,title,body,entity_kind,entity_id,recipients,office_only)
 values(p_org,p_title,p_body,p_kind,p_id,coalesce(p_recipients,'{}'),p_office)
$$;
revoke all on function c360_private.job_recipients(uuid,uuid),c360_private.staff_recipient(uuid,uuid),c360_private.notify(uuid,text,text,text,uuid,uuid[],boolean) from public,anon,authenticated;

-- Preserve validation, optimistic locking and idempotency of the v14 save engine.
-- Additional fields and notifications commit atomically with that save.
alter function public.workspace_save(text,jsonb,uuid) set schema c360_private;
alter function c360_private.workspace_save(text,jsonb,uuid) rename to workspace_save_v14;
revoke all on function c360_private.workspace_save_v14(text,jsonb,uuid) from public,anon,authenticated;
create function public.workspace_save(p_kind text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=public.workspace_organisation_id();result jsonb;replay boolean;before_job public.jobs;after_job public.jobs;
 old_staff uuid[];new_staff uuid[];supervisor uuid;person uuid;audience uuid[];public_changed boolean;
begin
 if org is null then raise exception 'Active company Admin or Operations access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,12));
 replay:=exists(select 1 from public.workspace_mutations where organisation_id=org and request_id=p_request_id);
 if not replay and p_kind='job' then
  select * into before_job from public.jobs where organisation_id=org and id=nullif(p_data->>'id','')::uuid;
  select coalesce(array_agg(staff_id order by staff_id),'{}') into old_staff from public.job_staff_assignments where organisation_id=org and job_id=before_job.id;
  audience:=c360_private.job_recipients(org,before_job.id);
  if length(coalesce(p_data->>'site_address',''))>1500 then raise exception 'Site address is too long'; end if;
  supervisor:=case when p_data ? 'supervisor_staff_id' then nullif(p_data->>'supervisor_staff_id','')::uuid else before_job.supervisor_staff_id end;
  if p_data ? 'staff_ids' then
   if jsonb_typeof(p_data->'staff_ids') is distinct from 'array' or jsonb_array_length(p_data->'staff_ids')>200 then raise exception 'Select up to 200 staff'; end if;
   select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}') into new_staff from jsonb_array_elements_text(p_data->'staff_ids') x;
  else new_staff:=old_staff;end if;
  -- Retained archived assignments may be cleared; newly selected staff must be active.
  foreach person in array new_staff||array[supervisor] loop
   if person is not null and not exists(select 1 from public.staff_members s where s.organisation_id=org and s.id=person
    and (s.is_active and not s.archived or person=any(old_staff) or person=before_job.supervisor_staff_id)) then raise exception 'Choose active staff from this company'; end if;
  end loop;
 end if;
 result:=c360_private.workspace_save_v14(p_kind,p_data,p_request_id);
 if replay or p_kind<>'job' then return result;end if;
 update public.jobs set site_address=case when p_data ? 'site_address' then btrim(coalesce(p_data->>'site_address','')) else site_address end,
  supervisor_staff_id=supervisor where organisation_id=org and id=(result->>'id')::uuid returning * into after_job;
 delete from public.job_staff_assignments where organisation_id=org and job_id=after_job.id and not(staff_id=any(new_staff));
 insert into public.job_staff_assignments(organisation_id,job_id,staff_id) select org,after_job.id,unnest(new_staff) on conflict do nothing;
 audience:=audience||c360_private.job_recipients(org,after_job.id);
 public_changed:=before_job.id is null or row(before_job.site,before_job.site_address,before_job.status,before_job.start_date,before_job.end_date,before_job.scaffold_type,before_job.archived,before_job.supervisor_staff_id,old_staff)
  is distinct from row(after_job.site,after_job.site_address,after_job.status,after_job.start_date,after_job.end_date,after_job.scaffold_type,after_job.archived,after_job.supervisor_staff_id,new_staff);
 if public_changed then
  perform c360_private.notify(org,case when before_job.id is null then 'Job created' when old_staff is distinct from new_staff or before_job.supervisor_staff_id is distinct from supervisor then 'Job assignments updated' else 'Job updated' end,
   after_job.code||' · '||after_job.site||' — '||after_job.status,'job',after_job.id,audience);
 elsif before_job.notes is distinct from after_job.notes or before_job.team is distinct from after_job.team or before_job.version is distinct from after_job.version then
  perform c360_private.notify(org,'Office job record updated',after_job.code||' · '||after_job.site,'job',after_job.id,'{}',true);
 end if;
 return result;
end $$;

-- Same basic job information is available company-wide, preserving shared files.
create function c360_private.job_summary(p_org uuid,p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'code',j.code,'site',j.site,'site_address',j.site_address,'status',j.status,'archived',j.archived,
 'start_date',j.start_date,'end_date',j.end_date,'scaffold_type',j.scaffold_type,
 'is_live',not j.archived and j.status in ('Delivery & Erection','Handover','Dismantling & Removal'),
 'supervisor_name',(select s.full_name from public.staff_members s where s.organisation_id=p_org and s.id=j.supervisor_staff_id),
 'assigned_to_me',exists(select 1 from public.staff_members s where s.organisation_id=p_org and s.user_id=auth.uid() and s.is_active and not s.archived and
 (s.id=j.supervisor_staff_id or exists(select 1 from public.job_staff_assignments a where a.organisation_id=p_org and a.job_id=j.id and a.staff_id=s.id))))
 from public.jobs j where j.organisation_id=p_org and j.id=p_job
$$;
revoke all on function c360_private.job_summary(uuid,uuid) from public,anon,authenticated;
alter function public.operations_snapshot() set schema c360_private;
alter function c360_private.operations_snapshot() rename to operations_snapshot_v19;
revoke all on function c360_private.operations_snapshot_v19() from public,anon,authenticated;
create function public.operations_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();result jsonb;office boolean;
begin
 if org is null then raise exception 'Active company access required';end if;
 office:=public.workspace_organisation_id() is not null;result:=c360_private.operations_snapshot_v19();
 return result||jsonb_build_object('jobs',coalesce((select jsonb_agg(
  (case when office then to_jsonb(j)||jsonb_build_object('staff_ids',coalesce((select jsonb_agg(a.staff_id order by a.staff_id) from public.job_staff_assignments a where a.organisation_id=org and a.job_id=j.id),'[]')) else '{}' end)
  ||c360_private.job_summary(org,j.id) order by j.code) from public.jobs j where j.organisation_id=org),'[]'));
end $$;
alter function public.job_resources_snapshot(uuid) set schema c360_private;
alter function c360_private.job_resources_snapshot(uuid) rename to job_resources_snapshot_v18;
revoke all on function c360_private.job_resources_snapshot_v18(uuid) from public,anon,authenticated;
create function public.job_resources_snapshot(p_job_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;org uuid:=public.operations_member_org();begin
 result:=c360_private.job_resources_snapshot_v18(p_job_id);
 return result||jsonb_build_object('jobs',coalesce((select jsonb_agg(c360_private.job_summary(org,j.id) order by j.code) from public.jobs j where j.organisation_id=org),'[]'));
end $$;
alter function public.vehicles_snapshot() set schema c360_private;
alter function c360_private.vehicles_snapshot() rename to vehicles_snapshot_v15;
revoke all on function c360_private.vehicles_snapshot_v15() from public,anon,authenticated;
create function public.vehicles_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;org uuid:=public.operations_member_org();begin
 result:=c360_private.vehicles_snapshot_v15();
 return result||jsonb_build_object('vehicles',coalesce((select jsonb_agg(v||jsonb_build_object('assigned_to_me',exists(
 select 1 from public.staff_members s where s.organisation_id=org and s.id=nullif(v->>'assigned_staff_id','')::uuid and s.user_id=auth.uid() and s.is_active and not s.archived)))
 from jsonb_array_elements(result->'vehicles') v),'[]'));
end $$;

create function public.notifications_snapshot(p_before bigint default null,p_limit integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();office boolean;result jsonb;
begin
 if org is null then raise exception 'Active company access required';end if;
 office:=public.workspace_organisation_id() is not null;
 with visible as (select n.*,r.read_at from public.workspace_notifications n left join public.workspace_notification_reads r
  on r.notification_id=n.id and r.user_id=auth.uid() and r.organisation_id=org where n.organisation_id=org and
  (office or not n.office_only and n.recipients @> array[auth.uid()])),
 page as (select * from visible where p_before is null or id<p_before order by id desc limit greatest(1,least(coalesce(p_limit,25),50)))
 select jsonb_build_object('organisation_id',org,'unread_count',(select count(*) from visible where read_at is null),
 'latest_id',(select max(id)::text from visible),'has_more',exists(select 1 from visible where id<(select min(id) from page)),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id::text,'created_at',created_at,'title',title,'body',body,'entity_kind',entity_kind,'entity_id',entity_id,'office_only',office_only,'read_at',read_at) order by id desc) from page),'[]')) into result;
 return result;
end $$;
create function public.notifications_mark_read(p_id bigint,p_all boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();office boolean;
begin
 if org is null then raise exception 'Active company access required';end if;
 office:=public.workspace_organisation_id() is not null;
 if p_id is null or not exists(select 1 from public.workspace_notifications n where n.organisation_id=org and n.id=p_id
  and (office or not n.office_only and n.recipients @> array[auth.uid()])) then raise exception 'Notification unavailable';end if;
 insert into public.workspace_notification_reads(organisation_id,notification_id,user_id)
 select org,n.id,auth.uid() from public.workspace_notifications n where n.organisation_id=org and
 (case when p_all then n.id<=p_id else n.id=p_id end) and (office or not n.office_only and n.recipients @> array[auth.uid()]) on conflict do nothing;
end $$;

-- Publish only completed file uploads, not reservations or failed uploads.
create function c360_private.notify_job_file() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs;begin
 if not new.ready or (tg_op='UPDATE' and row(new.ready,new.archived) is not distinct from row(old.ready,old.archived)) then return new;end if;
 select * into j from public.jobs where organisation_id=new.organisation_id and id=new.job_id;
 perform c360_private.notify(new.organisation_id,case when new.category='private' then 'Office-only job document updated' when new.archived then 'Shared job file removed' else 'New '||case new.category when 'rams' then 'RAMS' when 'images' then 'job photo' else 'important job document' end end,
  j.code||' · '||j.site,'job',j.id,case when new.category='private' then '{}'::uuid[] else c360_private.job_recipients(new.organisation_id,j.id) end,new.category='private');
 return new;
end $$;
create trigger notify_job_file after insert or update on public.job_files for each row execute function c360_private.notify_job_file();
create function c360_private.notify_vehicle() returns trigger language plpgsql security definer set search_path='' as $$
declare audience uuid[];begin
 if tg_op='UPDATE' and row(new.assigned_staff_id,new.registration,new.name,new.availability,new.archived,new.mot_date,new.tax_date,new.insurance_date,new.service_date,new.notes,new.make_model,new.vehicle_type)
  is not distinct from row(old.assigned_staff_id,old.registration,old.name,old.availability,old.archived,old.mot_date,old.tax_date,old.insurance_date,old.service_date,old.notes,old.make_model,old.vehicle_type) then return new;end if;
 audience:=c360_private.staff_recipient(new.organisation_id,new.assigned_staff_id);
 if tg_op='UPDATE' then audience:=audience||c360_private.staff_recipient(new.organisation_id,old.assigned_staff_id);end if;
 perform c360_private.notify(new.organisation_id,case when tg_op='INSERT' then 'Vehicle added' when new.assigned_staff_id is distinct from old.assigned_staff_id then 'Vehicle assignment updated' else 'Vehicle updated' end,new.registration||' · '||new.name,'vehicle',new.id,audience);
 return new;
end $$;
create trigger notify_vehicle after insert or update on public.vehicles for each row execute function c360_private.notify_vehicle();
create function c360_private.notify_vehicle_inspection() returns trigger language plpgsql security definer set search_path='' as $$
declare person uuid;begin
 select assigned_staff_id into person from public.vehicles where organisation_id=new.organisation_id and id=new.vehicle_id;
 perform c360_private.notify(new.organisation_id,case when new.has_defects then 'Vehicle defects reported' else 'Vehicle inspection submitted' end,new.registration,'vehicle',new.vehicle_id,
 c360_private.staff_recipient(new.organisation_id,person)||array[new.inspector_id]);return new;
end $$;
create trigger notify_vehicle_inspection after insert on public.vehicle_inspections for each row execute function c360_private.notify_vehicle_inspection();
create function c360_private.notify_vehicle_resolution() returns trigger language plpgsql security definer set search_path='' as $$
declare v public.vehicles;inspector uuid;begin
 if new.resolved_at is null or old.resolved_at is not null then return new;end if;
 select * into v from public.vehicles where organisation_id=new.organisation_id and id=new.vehicle_id;
 select inspector_id into inspector from public.vehicle_inspections where organisation_id=new.organisation_id and id=new.inspection_id;
 perform c360_private.notify(new.organisation_id,'Vehicle defect resolved',v.registration||' — review current vehicle status before use','vehicle',v.id,c360_private.staff_recipient(new.organisation_id,v.assigned_staff_id)||array[inspector]);return new;
end $$;
create trigger notify_vehicle_resolution after update on public.vehicle_defects for each row execute function c360_private.notify_vehicle_resolution();
create function c360_private.notify_scaffold_event() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs;begin
 select j0.* into j from public.jobs j0 join public.job_scaffolds s on s.job_id=j0.id and s.organisation_id=j0.organisation_id where s.organisation_id=new.organisation_id and s.id=new.scaffold_id;
 perform c360_private.notify(new.organisation_id,'Scaffold inspection update',j.code||' · '||j.site||' — '||new.action,'job',j.id,c360_private.job_recipients(new.organisation_id,j.id));return new;
end $$;
create trigger notify_scaffold_event after insert on public.scaffold_events for each row execute function c360_private.notify_scaffold_event();
create function c360_private.notify_timesheet_event() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.timesheets;begin
 if new.action='save' then return new;end if;
 select * into t from public.timesheets where organisation_id=new.organisation_id and id=new.timesheet_id;
 perform c360_private.notify(new.organisation_id,'Timesheet '||case new.action when 'submit' then 'submitted' when 'approve' then 'approved' else 'returned' end,
 'Week beginning '||to_char(t.week_start,'DD Mon YYYY'),'timesheets',t.id,array[t.owner_user_id]);return new;
end $$;
create trigger notify_timesheet_event after insert on public.timesheet_events for each row execute function c360_private.notify_timesheet_event();
create function c360_private.notify_leave() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform c360_private.notify(new.organisation_id,case when new.cancelled_at is null then 'Annual leave added' else 'Annual leave cancelled' end,
 to_char(new.starts_on,'DD Mon YYYY')||' — '||to_char(new.ends_on,'DD Mon YYYY'),'staff',new.staff_id,c360_private.staff_recipient(new.organisation_id,new.staff_id));return new;
end $$;
create trigger notify_leave after insert or update on public.staff_annual_leave for each row execute function c360_private.notify_leave();
-- The activity row is emitted AFTER the complete Planner crew has been saved.
create function c360_private.notify_planner() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.planner_bookings;j public.jobs;audience uuid[];
begin
 if new.event_type<>'operations_saved' then return new;end if;
 select * into b from public.planner_bookings where organisation_id=new.organisation_id and id=nullif(new.metadata->>'record_id','')::uuid;
 if not found then return new;end if;
 select * into j from public.jobs where organisation_id=new.organisation_id and id=b.job_id;
 select coalesce(array_agg(s.user_id) filter(where s.user_id is not null),'{}') into audience from public.planner_assignments a join public.staff_members s on s.id=a.staff_id and s.organisation_id=a.organisation_id where a.organisation_id=new.organisation_id and a.booking_id=b.id and s.is_active and not s.archived;
 perform c360_private.notify(new.organisation_id,case when b.status='cancelled' then 'Task cancelled' else 'Task updated' end,j.code||' · '||j.site,'planner',b.id,audience||c360_private.job_recipients(new.organisation_id,j.id));return new;
end $$;
create trigger notify_planner after insert on public.user_activity_log for each row execute function c360_private.notify_planner();
revoke all on function c360_private.notify_job_file(),c360_private.notify_vehicle(),c360_private.notify_vehicle_inspection(),c360_private.notify_vehicle_resolution(),c360_private.notify_scaffold_event(),c360_private.notify_timesheet_event(),c360_private.notify_leave(),c360_private.notify_planner() from public,anon,authenticated;
revoke all on function public.workspace_save(text,jsonb,uuid),public.operations_snapshot(),public.job_resources_snapshot(uuid),public.vehicles_snapshot(),public.notifications_snapshot(bigint,integer),public.notifications_mark_read(bigint,boolean) from public,anon,authenticated;
grant execute on function public.workspace_save(text,jsonb,uuid),public.operations_snapshot(),public.job_resources_snapshot(uuid),public.vehicles_snapshot(),public.notifications_snapshot(bigint,integer),public.notifications_mark_read(bigint,boolean) to authenticated;
notify pgrst,'reload schema';
commit;

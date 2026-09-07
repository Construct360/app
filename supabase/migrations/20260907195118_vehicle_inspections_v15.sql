-- v15: company vehicles and immutable daily inspections. Requires v14.
-- Apply once as postgres. No demonstration data or changes to existing accounts.
begin;
do $$ begin
  if to_regprocedure('public.operations_member_org()') is null or not exists
    (select 1 from information_schema.columns where table_schema='public' and table_name='staff_members' and column_name='hourly_rate') then
    raise exception 'Install the v14 workspace migration first';
  end if;
end $$;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  registration text not null check(length(registration) between 1 and 20),
  name text not null check(length(btrim(name)) between 1 and 160),
  vehicle_type text not null default 'Van' check(vehicle_type in ('Van','Lorry','Car','Other')),
  make_model text not null default '' check(length(make_model)<=160),
  mileage integer not null default 0 check(mileage between 0 and 9999999),
  assigned_staff_id uuid,
  availability text not null default 'Available' check(availability in ('Available','Unavailable')),
  mot_date date check(mot_date between date '1900-01-01' and date '2199-12-31'),
  tax_date date check(tax_date between date '1900-01-01' and date '2199-12-31'),
  insurance_date date check(insurance_date between date '1900-01-01' and date '2199-12-31'),
  service_date date check(service_date between date '1900-01-01' and date '2199-12-31'),
  notes text not null default '' check(length(notes)<=5000),
  archived boolean not null default false, version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,id),
  foreign key(organisation_id,assigned_staff_id) references public.staff_members(organisation_id,id)
);
create unique index vehicles_registration on public.vehicles(organisation_id,upper(regexp_replace(registration,'[^A-Za-z0-9]','','g')));
create index vehicles_staff on public.vehicles(organisation_id,assigned_staff_id);

create table public.vehicle_inspections (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, vehicle_id uuid not null,
  inspector_id uuid references auth.users(id) on delete set null,
  inspector_name text not null, registration text not null,
  submitted_at timestamptz not null default now(),
  mileage integer not null check(mileage between 0 and 9999999),
  checklist_version integer not null default 1 check(checklist_version=1),
  checks jsonb not null check(jsonb_typeof(checks)='object'),
  notes text not null default '' check(length(notes)<=5000),
  has_defects boolean not null,
  unique(organisation_id,vehicle_id,id),
  foreign key(organisation_id,vehicle_id) references public.vehicles(organisation_id,id)
);
create index vehicle_inspection_history on public.vehicle_inspections(organisation_id,vehicle_id,submitted_at desc,id desc);
create index vehicle_inspection_actor on public.vehicle_inspections(inspector_id);
create table public.vehicle_defects (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, vehicle_id uuid not null, inspection_id uuid not null,
  description text not null check(length(btrim(description)) between 1 and 5000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid references auth.users(id) on delete set null,
  resolved_by_name text, resolution text,
  check ((resolved_at is null and resolution is null) or (resolved_at is not null and length(btrim(resolution)) between 1 and 5000)),
  foreign key(organisation_id,vehicle_id,inspection_id) references public.vehicle_inspections(organisation_id,vehicle_id,id)
);
create index vehicle_defect_history on public.vehicle_defects(organisation_id,vehicle_id,inspection_id);
create index vehicle_defect_open on public.vehicle_defects(organisation_id,vehicle_id) where resolved_at is null;
create index vehicle_defect_actor on public.vehicle_defects(resolved_by);

-- Browser clients only read own-company rows. All writes go through checked,
-- atomic RPCs so clients cannot rewrite inspection history or spoof inspectors.
alter table public.vehicles enable row level security;
alter table public.vehicle_inspections enable row level security;
alter table public.vehicle_defects enable row level security;
revoke all on public.vehicles,public.vehicle_inspections,public.vehicle_defects from public,anon,authenticated;
grant select on public.vehicles,public.vehicle_inspections,public.vehicle_defects to authenticated;
create policy vehicles_company_read on public.vehicles for select to authenticated
  using(organisation_id=(select public.operations_member_org()));
create policy inspections_company_read on public.vehicle_inspections for select to authenticated
  using(organisation_id=(select public.operations_member_org()));
create policy defects_company_read on public.vehicle_defects for select to authenticated
  using(organisation_id=(select public.operations_member_org()));

create function public.vehicles_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org(); result jsonb;
begin
  if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
  select jsonb_build_object('organisation_id',org,
    'vehicles',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object(
      'assigned_staff_name',s.full_name,
      'open_defects',(select count(*) from public.vehicle_defects d where d.organisation_id=org and d.vehicle_id=v.id and d.resolved_at is null),
      'last_inspection_at',(select max(i.submitted_at) from public.vehicle_inspections i where i.organisation_id=org and i.vehicle_id=v.id)
    ) order by v.registration) from public.vehicles v left join public.staff_members s on s.organisation_id=org and s.id=v.assigned_staff_id where v.organisation_id=org),'[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Bounded, paginated inspection history; open defects are always returned in full.
create function public.vehicle_history(p_vehicle_id uuid,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=public.operations_member_org();
begin
  if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
  if p_offset is null or p_offset<0 or not exists(select 1 from public.vehicles where organisation_id=org and id=p_vehicle_id) then raise exception 'Vehicle unavailable'; end if;
  return jsonb_build_object('organisation_id',org,'vehicle_id',p_vehicle_id,
    'inspections',coalesce((select jsonb_agg(to_jsonb(q)) from
      (select * from public.vehicle_inspections where organisation_id=org and vehicle_id=p_vehicle_id order by submitted_at desc,id desc limit 25 offset p_offset) q),'[]'::jsonb),
    'total',(select count(*) from public.vehicle_inspections where organisation_id=org and vehicle_id=p_vehicle_id),
    'defects',coalesce((select jsonb_agg(to_jsonb(d) order by created_at desc,id desc) from public.vehicle_defects d
      where organisation_id=org and vehicle_id=p_vehicle_id and (resolved_at is null or inspection_id in
        (select id from public.vehicle_inspections where organisation_id=org and vehicle_id=p_vehicle_id order by submitted_at desc,id desc limit 25 offset p_offset))),'[]'::jsonb));
end $$;

create function public.vehicle_save(p_kind text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  org uuid:=public.operations_member_org(); manager boolean; v public.vehicles; d public.vehicle_defects;
  receipt public.workspace_mutations; fingerprint text; result jsonb; rid uuid; inspector text;
  checks jsonb; key text; has_failure boolean:=false; miles integer; staff uuid; detail text; reg text;
  check_keys text[]:=array['tyres','lights','brakes','steering','mirrors','wipers','horn','fluids','body_load','seatbelts','other'];
begin
  if auth.uid() is null or org is null then raise exception 'Active company member access required'; end if;
  manager:=public.workspace_organisation_id() is not null;
  if p_kind is null or p_kind not in ('vehicle','archive','inspection','resolve') or p_request_id is null
    or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>20000 then raise exception 'Invalid vehicle request'; end if;
  if p_kind<>'inspection' and not manager then raise exception 'Company Admin or Operations access required'; end if;
  if p_data ?| array['organisation_id','inspector_id','inspector_name','submitted_at','resolved_by','has_defects'] then raise exception 'Company, inspector and result are assigned by the server'; end if;
  fingerprint:=md5(auth.uid()::text||'vehicle-v15:'||p_kind||p_data::text);
  perform pg_advisory_xact_lock(hashtextextended(org::text,12));
  select * into receipt from public.workspace_mutations where organisation_id=org and request_id=p_request_id;
  if found then
    if receipt.fingerprint<>fingerprint then raise exception 'Request changed. Start a new save'; end if;
    return receipt.result;
  end if;
  select coalesce(nullif(btrim(full_name),''),'Company member') into inspector from public.profiles where id=auth.uid();
  inspector:=coalesce(inspector,'Company member');
  rid:=nullif(p_data->>'id','')::uuid;
  if p_kind='resolve' then
    select * into d from public.vehicle_defects where organisation_id=org and id=rid for update;
    if not found or d.resolved_at is not null then raise exception 'Defect already resolved or unavailable. Refresh and try again'; end if;
    detail:=btrim(coalesce(p_data->>'resolution',''));
    if length(detail) not between 1 and 5000 or (p_data->>'confirmed')::boolean is distinct from true then raise exception 'Record the action taken and confirm the defect has been addressed'; end if;
    update public.vehicle_defects set resolved_at=now(),resolved_by=auth.uid(),resolved_by_name=inspector,resolution=detail where id=d.id;
    update public.vehicles set version=version+1,updated_at=now() where id=d.vehicle_id and organisation_id=org;
    result:=jsonb_build_object('id',d.id,'vehicle_id',d.vehicle_id);
  else
    select * into v from public.vehicles where organisation_id=org and id=rid for update;
    if p_kind='vehicle' and rid is null then
      v.id:=gen_random_uuid(); v.version:=0;
    elsif not found then raise exception 'Vehicle unavailable';
    end if;
    if p_kind in ('vehicle','archive') and coalesce((p_data->>'version')::integer,-1)<>v.version then raise exception 'This vehicle changed. Close, refresh and try again'; end if;
    if p_kind='vehicle' then
      reg:=upper(btrim(coalesce(p_data->>'registration','')));
      if reg !~ '^[A-Z0-9][A-Z0-9 -]{0,19}$' then raise exception 'Enter a registration using letters, numbers, spaces or hyphens (max 20 characters)'; end if;
      staff:=nullif(p_data->>'assigned_staff_id','')::uuid;
      if staff is not null and staff is distinct from v.assigned_staff_id and not exists
        (select 1 from public.staff_members where organisation_id=org and id=staff and is_active and not archived) then raise exception 'Choose an active staff member from this company'; end if;
      miles:=(p_data->>'mileage')::integer;
      if v.version>0 and miles<v.mileage then raise exception 'Mileage cannot decrease. Keep the saved reading or contact your administrator to correct an erroneous historical reading'; end if;
      insert into public.vehicles(id,organisation_id,registration,name,vehicle_type,make_model,mileage,assigned_staff_id,availability,mot_date,tax_date,insurance_date,service_date,notes)
      values(v.id,org,reg,btrim(p_data->>'name'),coalesce(p_data->>'vehicle_type','Van'),coalesce(p_data->>'make_model',''),miles,staff,coalesce(p_data->>'availability','Available'),
        nullif(p_data->>'mot_date','')::date,nullif(p_data->>'tax_date','')::date,nullif(p_data->>'insurance_date','')::date,nullif(p_data->>'service_date','')::date,coalesce(p_data->>'notes',''))
      on conflict(id) do update set registration=excluded.registration,name=excluded.name,vehicle_type=excluded.vehicle_type,make_model=excluded.make_model,
        mileage=excluded.mileage,assigned_staff_id=excluded.assigned_staff_id,availability=excluded.availability,mot_date=excluded.mot_date,tax_date=excluded.tax_date,
        insurance_date=excluded.insurance_date,service_date=excluded.service_date,notes=excluded.notes,version=vehicles.version+1,updated_at=now();
      result:=jsonb_build_object('id',v.id);
    elsif p_kind='archive' then
      if (p_data->>'archived')::boolean is null then raise exception 'Choose archive or restore'; end if;
      update public.vehicles set archived=(p_data->>'archived')::boolean,version=version+1,updated_at=now() where organisation_id=org and id=v.id;
      result:=jsonb_build_object('id',v.id);
    else
      if v.archived then raise exception 'Archived vehicles cannot be inspected. Ask the office to restore this record'; end if;
      miles:=(p_data->>'mileage')::integer;
      if miles is null or miles<v.mileage or miles>9999999 then raise exception 'Enter mileage at least equal to the saved reading (maximum 9999999)'; end if;
      checks:=p_data->'checks';
      if jsonb_typeof(checks) is distinct from 'object' then raise exception 'Complete every inspection check'; end if;
      if (select count(*) from jsonb_object_keys(checks))<>cardinality(check_keys) then raise exception 'Complete every inspection check'; end if;
      foreach key in array check_keys loop
        if coalesce(checks->>key,'') not in ('pass','fail','na') then raise exception 'Complete every inspection check'; end if;
        if checks->>key='fail' then has_failure:=true; end if;
      end loop;
      if not exists(select 1 from jsonb_each_text(checks) where value in ('pass','fail')) then raise exception 'At least one check must be assessed'; end if;
      detail:=btrim(coalesce(p_data->>'defect_details',''));
      if has_failure and length(detail) not between 1 and 5000 then raise exception 'Describe every failed check in defect details'; end if;
      if not has_failure and detail<>'' then raise exception 'Mark a check as failed when reporting a defect'; end if;
      if (p_data->>'confirmed')::boolean is distinct from true then raise exception 'Confirm you personally carried out these checks'; end if;
      rid:=gen_random_uuid();
      insert into public.vehicle_inspections(id,organisation_id,vehicle_id,inspector_id,inspector_name,registration,mileage,checks,notes,has_defects)
        values(rid,org,v.id,auth.uid(),inspector,v.registration,miles,checks,coalesce(p_data->>'notes',''),has_failure);
      if has_failure then
        insert into public.vehicle_defects(organisation_id,vehicle_id,inspection_id,description) values(org,v.id,rid,detail);
      end if;
      -- A clear inspection never closes previous defects or changes availability.
      update public.vehicles set mileage=miles,version=version+1,updated_at=now() where organisation_id=org and id=v.id;
      result:=jsonb_build_object('id',rid,'vehicle_id',v.id,'has_defects',has_failure);
    end if;
  end if;
  insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(org,p_request_id,fingerprint,result);
  insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
    values(org,auth.uid(),'vehicle_'||p_kind,'Saved vehicle '||p_kind,result);
  return result;
end $$;
revoke all on function public.vehicles_snapshot(),public.vehicle_history(uuid,integer),public.vehicle_save(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.vehicles_snapshot(),public.vehicle_history(uuid,integer),public.vehicle_save(text,jsonb,uuid) to authenticated;
commit;

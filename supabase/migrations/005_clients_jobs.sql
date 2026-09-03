-- Construct360 v12: organisation-owned Clients and Jobs.
-- Prerequisites: 001, 002, 003. Run this entire file as postgres in SQL Editor.
-- Additive and rerunnable. Does not import or delete any prototype data.
begin;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  code text not null check (code ~ '^[0-9]{3,7}$' and code::integer > 0),
  name text not null check (length(btrim(name)) between 1 and 160),
  contact text not null default '' check (length(contact)<=120),
  phone text not null default '' check (length(phone)<=60),
  email text not null default '' check (length(email)<=254),
  address text not null default '' check (length(address)<=1000),
  notes text not null default '' check (length(notes)<=5000),
  archived boolean not null default false,
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organisation_id, id), unique (organisation_id, code)
);
create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null, client_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  role text not null default '' check (length(role)<=120),
  phone text not null default '' check (length(phone)<=60),
  email text not null default '' check (length(email)<=254),
  notes text not null default '' check (length(notes)<=3000),
  foreign key (organisation_id,client_id) references public.clients(organisation_id,id),
  unique (organisation_id,client_id,id)
);
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null, client_id uuid not null,
  code text not null check (code ~ '^[0-9]{6,14}$'),
  number integer not null check (number between 1 and 9999999),
  site text not null check (length(btrim(site)) between 1 and 180),
  scaffold_type text not null default '' check (length(scaffold_type)<=180),
  start_date date, end_date date,
  team text not null default '' check (length(team)<=120),
  status text not null default 'Quotation' check (status in ('Quotation','Acceptance & Planning','Delivery & Erection','Handover & Initial Inspection','Dismantling & Removal','Completion/Closed','Cancelled','Completed')),
  notes text not null default '' check (length(notes)<=5000),
  archived boolean not null default false,
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (organisation_id,client_id) references public.clients(organisation_id,id),
  unique (organisation_id,id,client_id), unique (organisation_id,code), unique (organisation_id,client_id,number)
);
create table if not exists public.job_contact_assignments (
  organisation_id uuid not null, job_id uuid not null, client_id uuid not null, contact_id uuid not null,
  primary key (job_id,contact_id),
  foreign key (organisation_id,job_id,client_id) references public.jobs(organisation_id,id,client_id),
  foreign key (organisation_id,client_id,contact_id) references public.client_contacts(organisation_id,client_id,id)
);
-- Private request receipts make retrying a lost response safe. Not exposed to clients.
create table if not exists public.workspace_mutations (
  organisation_id uuid not null references public.organisations(id), request_id uuid not null,
  fingerprint text not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key (organisation_id,request_id)
);
create index if not exists clients_org_updated on public.clients(organisation_id,updated_at);
create index if not exists contacts_client on public.client_contacts(organisation_id,client_id);
create index if not exists jobs_client on public.jobs(organisation_id,client_id);
create index if not exists assignments_contact on public.job_contact_assignments(organisation_id,client_id,contact_id);

create or replace function public.workspace_organisation_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.organisation_id from public.organisation_memberships m
  join public.organisations o on o.id=m.organisation_id
  join auth.users u on u.id=m.user_id
  where m.user_id=auth.uid() and m.is_active and o.status='active'
    and m.role in ('admin','operations') and u.email_confirmed_at is not null
$$;
revoke all on function public.workspace_organisation_id() from public,anon;
grant execute on function public.workspace_organisation_id() to authenticated;

alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.jobs enable row level security;
alter table public.job_contact_assignments enable row level security;
alter table public.workspace_mutations enable row level security;
revoke all on public.clients,public.client_contacts,public.jobs,public.job_contact_assignments,public.workspace_mutations from public,anon,authenticated;
grant select on public.clients,public.client_contacts,public.jobs,public.job_contact_assignments to authenticated;
drop policy if exists workspace_clients_read on public.clients;
create policy workspace_clients_read on public.clients for select to authenticated using (organisation_id=(select public.workspace_organisation_id()));
drop policy if exists workspace_contacts_read on public.client_contacts;
create policy workspace_contacts_read on public.client_contacts for select to authenticated using (organisation_id=(select public.workspace_organisation_id()));
drop policy if exists workspace_jobs_read on public.jobs;
create policy workspace_jobs_read on public.jobs for select to authenticated using (organisation_id=(select public.workspace_organisation_id()));
drop policy if exists workspace_assignments_read on public.job_contact_assignments;
create policy workspace_assignments_read on public.job_contact_assignments for select to authenticated using (organisation_id=(select public.workspace_organisation_id()));

-- All writes pass through this checked transaction. Browser organisation IDs are rejected.
create or replace function public.workspace_save(p_kind text,p_data jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid:=public.workspace_organisation_id(); v_id uuid; v_version integer;
  v_old_client public.clients; v_old_job public.jobs; v_client public.clients;
  v_code text; v_number integer; v_result jsonb; v_receipt public.workspace_mutations;
  v_fingerprint text:=md5(p_kind||coalesce(p_data::text,'')); v_contact jsonb;
  v_contact_id uuid; v_contact_ids uuid[]:='{}'; v_now timestamptz:=clock_timestamp();
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
    insert into public.clients(id,organisation_id,code,name,contact,phone,email,address,notes,archived,version,updated_at)
    values(v_id,v_org,v_code,btrim(p_data->>'name'),btrim(coalesce(p_data->>'contact','')),btrim(coalesce(p_data->>'phone','')),btrim(coalesce(p_data->>'email','')),btrim(coalesce(p_data->>'address','')),btrim(coalesce(p_data->>'notes','')),coalesce((p_data->>'archived')::boolean,false),v_version+1,v_now)
    on conflict(id) do update set name=excluded.name,contact=excluded.contact,phone=excluded.phone,email=excluded.email,address=excluded.address,notes=excluded.notes,archived=excluded.archived,version=excluded.version,updated_at=excluded.updated_at
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
    delete from public.job_contact_assignments where organisation_id=v_org and job_id=v_id;
    insert into public.job_contact_assignments(organisation_id,job_id,client_id,contact_id) select v_org,v_id,v_client.id,id from unnest(v_contact_ids) x(id);
  end if;
  v_result:=jsonb_build_object('id',v_id,'code',v_code,'version',v_version+1);
  insert into public.workspace_mutations values(v_org,p_request_id,v_fingerprint,v_result,v_now);
  insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
    values(v_org,auth.uid(),'workspace_'||p_kind||'_saved','Saved '||p_kind||' '||v_code,jsonb_build_object('id',v_id,'version',v_version+1,'archived',coalesce((p_data->>'archived')::boolean,false)));
  return v_result;
end $$;
revoke all on function public.workspace_save(text,jsonb,uuid) from public,anon;
grant execute on function public.workspace_save(text,jsonb,uuid) to authenticated;

create or replace function public.workspace_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid:=public.workspace_organisation_id();
begin
  if v_org is null then raise exception 'Active company Admin or Operations access required'; end if;
  return jsonb_build_object(
    'organisation_id',v_org,
    'clients',coalesce((select jsonb_agg(to_jsonb(c) order by c.code::integer) from public.clients c where organisation_id=v_org),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from public.client_contacts c where organisation_id=v_org),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.number desc) from public.jobs j where organisation_id=v_org),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.job_contact_assignments a where organisation_id=v_org),'[]'::jsonb)
  );
end $$;
revoke all on function public.workspace_snapshot() from public,anon;
grant execute on function public.workspace_snapshot() to authenticated;

-- Explicit, all-or-nothing import. Existing codes are never overwritten.
create or replace function public.workspace_import(p_bundle jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid:=public.workspace_organisation_id(); v_receipt public.workspace_mutations;
  v_fingerprint text:='import:'||md5(p_bundle::text); v_client jsonb; v_job jsonb; v_contact jsonb;
  v_contacts jsonb; v_ids jsonb; v_saved jsonb; v_clients jsonb:='{}'; v_maps jsonb:='{}'; v_map jsonb;
  v_key text; v_code text; v_id uuid; v_result jsonb;
begin
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'Active company Admin access required for imports'; end if;
  if p_request_id is null or p_bundle->>'format' is distinct from 'construct360-transfer-v1'
    or jsonb_typeof(p_bundle->'clients') is distinct from 'array' or jsonb_typeof(p_bundle->'jobs') is distinct from 'array' then raise exception 'Invalid Construct360 transfer file'; end if;
  if p_bundle->>'organisation_id' is distinct from v_org::text then raise exception 'This file is not for your company workspace'; end if;
  if jsonb_array_length(p_bundle->'clients')>500 or jsonb_array_length(p_bundle->'jobs')>500 or length(p_bundle::text)>5000000 then raise exception 'Import limit: 500 clients, 500 jobs and 5 MB per file'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text,12));
  select * into v_receipt from public.workspace_mutations where organisation_id=v_org and request_id=p_request_id;
  if found then
    if v_receipt.fingerprint<>v_fingerprint then raise exception 'Import request changed'; end if;
    return v_receipt.result;
  end if;
  for v_client in select value from jsonb_array_elements(p_bundle->'clients') loop
    v_code:=v_client->>'code'; v_contacts:='[]'; v_map:='{}';
    if v_code is null or v_clients ? v_code or exists(select 1 from public.clients where organisation_id=v_org and code=v_code) then raise exception 'Duplicate or missing client code. Import stopped; no records changed'; end if;
    if jsonb_typeof(v_client->'contacts') is distinct from 'array' then raise exception 'Invalid client contacts'; end if;
    for v_contact in select value from jsonb_array_elements(v_client->'contacts') loop
      v_key:=v_contact->>'key'; v_id:=gen_random_uuid();
      if v_key is null or v_map ? v_key then raise exception 'Duplicate or missing contact key'; end if;
      v_map:=v_map||jsonb_build_object(v_key,v_id);
      v_contacts:=v_contacts||jsonb_build_array((v_contact-'key'-'id')||jsonb_build_object('id',v_id));
    end loop;
    v_saved:=public.workspace_save('client',(v_client-'id'-'version'-'organisation_id')||jsonb_build_object('contacts',v_contacts,'archived',false),gen_random_uuid());
    v_clients:=v_clients||jsonb_build_object(v_code,v_saved->>'id');
    v_maps:=v_maps||jsonb_build_object(v_code,v_map);
  end loop;
  for v_job in select value from jsonb_array_elements(p_bundle->'jobs') loop
    v_code:=v_job->>'client_code'; v_ids:='[]';
    if nullif(v_job->>'code','') is null then raise exception 'Imported job code is required'; end if;
    if v_code is null or not(v_clients ? v_code) then raise exception 'Every imported job must reference a client in this file'; end if;
    if jsonb_typeof(v_job->'contact_keys') is distinct from 'array' then raise exception 'Invalid job contact keys'; end if;
    for v_key in select value from jsonb_array_elements_text(v_job->'contact_keys') loop
      if v_key is null or not((v_maps->v_code) ? v_key) then raise exception 'Job contact is missing from its client'; end if;
      v_ids:=v_ids||jsonb_build_array(v_maps->v_code->v_key);
    end loop;
    perform public.workspace_save('job',(v_job-'id'-'version'-'organisation_id')||jsonb_build_object('client_id',v_clients->>v_code,'contact_ids',v_ids),gen_random_uuid());
  end loop;
  -- Restore exported archive flags only after children have been imported.
  for v_client in select value from jsonb_array_elements(p_bundle->'clients') loop
    if coalesce((v_client->>'archived')::boolean,false) then
      if exists(select 1 from public.jobs where organisation_id=v_org and client_id=(v_clients->>(v_client->>'code'))::uuid and not archived) then raise exception 'Archived client has unarchived jobs'; end if;
      update public.clients set archived=true where organisation_id=v_org and id=(v_clients->>(v_client->>'code'))::uuid;
    end if;
  end loop;
  v_result:=jsonb_build_object('clients',jsonb_array_length(p_bundle->'clients'),'jobs',jsonb_array_length(p_bundle->'jobs'));
  insert into public.workspace_mutations(organisation_id,request_id,fingerprint,result) values(v_org,p_request_id,v_fingerprint,v_result);
  return v_result;
end $$;
revoke all on function public.workspace_import(jsonb,uuid) from public,anon;
grant execute on function public.workspace_import(jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

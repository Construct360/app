-- Construct360 v11: controlled company provisioning, one company per account.
-- Requires migrations 001 and 002. Additive: no company/user records are deleted.
-- Operational modules are NOT migrated by this file. New workspaces stay in setup.
begin;

alter table public.organisations
  add column if not exists status text not null default 'active'
    check (status in ('active','suspended')),
  add column if not exists workspace_mode text not null default 'setup'
    check (workspace_mode in ('setup','prototype')),
  add column if not exists provisioning_request_id uuid unique;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.platform_activity_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  event_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);
create index if not exists platform_activity_created_idx
  on public.platform_activity_log (created_at desc);

-- A trusted reservation binds an invitation to ONE company before SMTP sends.
-- Client-supplied auth metadata is never used to choose company or role.
create table if not exists public.organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null unique check (email = lower(btrim(email))),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  role public.app_role not null,
  initial_admin boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  last_sender uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempt_id uuid,
  last_attempt_at timestamptz,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check (not initial_admin or role = 'admin'::public.app_role)
);
create index if not exists invitations_org_idx on public.organisation_invitations (organisation_id);
create unique index if not exists invitations_initial_admin_idx
  on public.organisation_invitations (organisation_id) where initial_admin;

alter table public.platform_admins enable row level security;
alter table public.platform_activity_log enable row level security;
alter table public.organisation_invitations enable row level security;
revoke all on public.platform_admins, public.platform_activity_log,
  public.organisation_invitations from public, anon, authenticated;
grant all on public.platform_admins, public.platform_activity_log,
  public.organisation_invitations to service_role;
grant usage, select on sequence public.platform_activity_log_id_seq to service_role;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins
    where user_id = (select auth.uid()) and is_active);
$$;
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organisation_memberships m
    join public.organisations o on o.id = m.organisation_id
    where m.organisation_id = p_org and m.user_id = (select auth.uid())
      and m.is_active and o.status = 'active');
$$;
create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organisation_memberships m
    join public.organisations o on o.id = m.organisation_id
    where m.organisation_id = p_org and m.user_id = (select auth.uid())
      and m.is_active and m.role = 'admin'::public.app_role and o.status = 'active');
$$;
create or replace function public.current_organisation_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.organisation_id from public.organisation_memberships m
    join public.organisations o on o.id = m.organisation_id
    where m.user_id = (select auth.uid()) and m.is_active and o.status = 'active';
$$;

-- Company Admins must not reactivate a suspended organisation, change workspace
-- mode, move memberships or bypass Edge Function checks through the REST API.
revoke all on public.organisations, public.organisation_memberships from anon, authenticated;
grant select on public.organisations, public.organisation_memberships to authenticated;
grant update (name, slug) on public.organisations to authenticated;
drop policy if exists "admins update memberships" on public.organisation_memberships;
-- Permit only the member's own organisation metadata even while suspended.
drop policy if exists "members view organisation" on public.organisations;
create policy "members view organisation" on public.organisations for select to authenticated
  using (exists (select 1 from public.organisation_memberships m
    where m.organisation_id = organisations.id and m.user_id = (select auth.uid())));
drop policy if exists "activity visibility" on public.user_activity_log;
create policy "activity visibility" on public.user_activity_log for select to authenticated
  using (public.is_org_member(organisation_id)
    and (actor_user_id = (select auth.uid()) or public.is_org_admin(organisation_id)));

-- Provisioning is platform-controlled from v11. Existing companies are retained.
revoke all on function public.create_organisation_and_admin(text) from public, anon, authenticated;

create or replace function public.platform_create_company(
  p_name text, p_admin_name text, p_admin_email text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_old public.organisations; v_inv public.organisation_invitations;
  v_email text := lower(btrim(p_admin_email));
begin
  if not public.is_platform_admin() then
    raise exception using errcode='42501', message='Platform Administrator access required';
  end if;
  if p_request_id is null or p_name is null or char_length(btrim(p_name)) not between 2 and 160
    or p_admin_name is null or char_length(btrim(p_admin_name)) not between 1 and 120
    or v_email is null or char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a company name, Admin name and valid email';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into v_old from public.organisations where provisioning_request_id = p_request_id;
  if found then
    select * into v_inv from public.organisation_invitations where organisation_id=v_old.id and initial_admin;
    if v_old.created_by is distinct from auth.uid() or v_old.name <> btrim(p_name)
      or v_inv.email is distinct from v_email or v_inv.full_name is distinct from btrim(p_admin_name) then
      raise exception 'This request was already used for different company details';
    end if;
    return v_old.id;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,1));
  if exists(select 1 from auth.users where lower(email)=v_email)
    or exists(select 1 from public.organisation_invitations where email=v_email) then
    raise exception 'This email already has an account or pending invitation. Use a new Admin email.';
  end if;
  insert into public.organisations(name,created_by,provisioning_request_id,status,workspace_mode)
    values(btrim(p_name),auth.uid(),p_request_id,'active','setup') returning id into v_org;
  insert into public.organisation_invitations(organisation_id,email,full_name,role,initial_admin,invited_by)
    values(v_org,v_email,btrim(p_admin_name),'admin',true,auth.uid());
  insert into public.platform_activity_log(actor_user_id,organisation_id,event_type,description)
    values(auth.uid(),v_org,'company_created','Created company; first Admin invitation pending');
  return v_org;
end;
$$;

create or replace function public.prepare_company_user_invite(p_email text,p_full_name text,p_role public.app_role)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.current_organisation_id(); v_email text := lower(btrim(p_email));
  v_inv public.organisation_invitations; v_user auth.users; v_member public.organisation_memberships; v_id uuid;
begin
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception using errcode='42501',message='Active company Admin access required';
  end if;
  if p_role is null or p_full_name is null or char_length(btrim(p_full_name)) not between 1 and 120
    or v_email is null or char_length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Valid name, email and role are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,1));
  select * into v_inv from public.organisation_invitations where email=v_email;
  if found then
    if v_inv.organisation_id <> v_org then raise exception 'This email is unavailable for invitation'; end if;
    if v_inv.initial_admin then raise exception 'The first Admin invitation is managed through Platform Administration'; end if;
    if v_inv.role <> p_role then raise exception 'An invitation already exists with a different role. Use the original role to resend.'; end if;
    return v_inv.id;
  end if;
  select * into v_user from auth.users where lower(email)=v_email;
  if found then
    select * into v_member from public.organisation_memberships where user_id=v_user.id;
    if v_member.organisation_id is distinct from v_org then
      raise exception 'This email is unavailable for invitation';
    end if;
    if v_user.email_confirmed_at is not null then raise exception 'This user has accepted their invitation. They can sign in or reset their password.'; end if;
    if not v_member.is_active or v_member.role <> p_role then raise exception 'Review this user''s existing role and active status before resending'; end if;
  end if;
  insert into public.organisation_invitations(organisation_id,email,full_name,role,user_id,invited_by)
    values(v_org,v_email,btrim(p_full_name),p_role,v_user.id,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.claim_company_invitation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.organisation_invitations; v_user auth.users; v_member public.organisation_memberships;
  v_attempt uuid := gen_random_uuid();
begin
  select * into v from public.organisation_invitations where id=p_id for update;
  if not found then raise exception 'Invitation not found'; end if;
  if not (case when v.initial_admin then public.is_platform_admin()
    else public.is_org_admin(v.organisation_id) end) then
    raise exception using errcode='42501',message='Invitation access denied';
  end if;
  if not exists(select 1 from public.organisations where id=v.organisation_id and status='active') then
    raise exception 'This company is suspended';
  end if;
  select * into v_user from auth.users where lower(email)=v.email;
  if found then
    select * into v_member from public.organisation_memberships where user_id=v_user.id;
    if v_member.organisation_id is not null and v_member.organisation_id<>v.organisation_id then
      raise exception 'This email is unavailable for invitation';
    end if;
    if v_member.user_id is not null and not v_member.is_active then raise exception 'This user is disabled'; end if;
    if v_user.email_confirmed_at is not null then
      raise exception 'This user has accepted their invitation. They can sign in or reset their password.';
    end if;
  end if;
  if v.last_attempt_at > now()-interval '60 seconds' then
    raise exception 'Please wait at least 60 seconds before resending this invitation';
  end if;
  update public.organisation_invitations set status='sending',attempt_id=v_attempt,
    last_attempt_at=now(),last_error=null,last_sender=auth.uid() where id=p_id;
  return jsonb_build_object('id',v.id,'email',v.email,'full_name',v.full_name,
    'organisation_id',v.organisation_id,'attempt_id',v_attempt);
end;
$$;

create or replace function public.mark_company_invitation_failed(p_id uuid,p_attempt_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.organisation_invitations;
begin
  select * into v from public.organisation_invitations where id=p_id for update;
  if not found or not (case when v.initial_admin then public.is_platform_admin()
    else public.is_org_admin(v.organisation_id) end) then
    raise exception using errcode='42501',message='Invitation access denied';
  end if;
  -- A timeout after SMTP succeeds must not overwrite the committed sent status.
  if v.attempt_id=p_attempt_id and v.status='sending' then
    update public.organisation_invitations set status='failed',
      last_error='Sending was not confirmed. Check SMTP settings, then retry.' where id=p_id;
    if v.initial_admin then
      insert into public.platform_activity_log(actor_user_id,organisation_id,event_type,description)
        values(auth.uid(),v.organisation_id,'invitation_failed','First Admin email could not be confirmed; retry available');
    end if;
  end if;
end;
$$;

-- Supabase Auth updates invited_at as part of the invite transaction.
-- Link the reserved company BEFORE the invitation transaction commits. This also
-- makes retries safe: no deletion/recreation of an existing Auth user is required.
create or replace function public.attach_reserved_company_invitation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.organisation_invitations; v_member public.organisation_memberships;
begin
  if new.invited_at is null then return new; end if;
  select * into v from public.organisation_invitations where email=lower(new.email) for update;
  if not found then return new; end if;
  if not exists(select 1 from public.organisations where id=v.organisation_id and status='active') then
    raise exception 'This company is suspended';
  end if;
  select * into v_member from public.organisation_memberships where user_id=new.id;
  if found then
    if v_member.organisation_id <> v.organisation_id or not v_member.is_active then
      raise exception 'Existing company access does not match the invitation';
    end if;
  else
    insert into public.profiles(id,email,full_name) values(new.id,new.email,v.full_name)
      on conflict(id) do nothing;
    insert into public.organisation_memberships(organisation_id,user_id,role,is_active,created_by)
      values(v.organisation_id,new.id,v.role,true,v.invited_by);
    if v.role in ('supervisor','operative') then
      insert into public.staff_members(organisation_id,user_id,full_name,email,employment_role,created_by)
        values(v.organisation_id,new.id,v.full_name,new.email,
          case when v.role='supervisor' then 'Scaffold Supervisor' else 'Operative' end,v.invited_by);
    end if;
  end if;
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
    ||jsonb_build_object('needs_password_setup',true) where id=new.id;
  update public.organisation_invitations set user_id=new.id,status='sent',last_sent_at=new.invited_at,
    last_error=null where id=v.id;
  insert into public.user_activity_log(organisation_id,actor_user_id,event_type,description,metadata)
    values(v.organisation_id,coalesce(v.last_sender,v.invited_by),'user_invited','Sent company invitation',
      jsonb_build_object('target_user_id',new.id));
  if v.initial_admin then
    insert into public.platform_activity_log(actor_user_id,organisation_id,event_type,description)
      values(coalesce(v.last_sender,v.invited_by),v.organisation_id,'admin_invited','Sent first Admin invitation');
  end if;
  return new;
end;
$$;
drop trigger if exists zz_construct360_reserved_invitation on auth.users;
create trigger zz_construct360_reserved_invitation after insert or update of invited_at on auth.users
  for each row execute function public.attach_reserved_company_invitation();

create or replace function public.platform_set_company_status(p_org uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not public.is_platform_admin() then raise exception using errcode='42501',message='Platform Administrator access required'; end if;
  if p_status is null or p_status not in ('active','suspended') then raise exception 'Invalid company status'; end if;
  -- Protect the platform operator's own company from accidental suspension.
  if p_status='suspended' and exists(select 1 from public.organisation_memberships
    where organisation_id=p_org and user_id=auth.uid()) then
    raise exception 'You cannot suspend your own company';
  end if;
  select status into v_old from public.organisations where id=p_org for update;
  if not found then raise exception 'Company not found'; end if;
  if v_old=p_status then return; end if;
  update public.organisations set status=p_status where id=p_org;
  insert into public.platform_activity_log(actor_user_id,organisation_id,event_type,description)
    values(auth.uid(),p_org,'company_status_changed','Company status changed to '||p_status);
end;
$$;

-- Only metadata is exposed to platform administrators. No cross-company staff,
-- documents, jobs or other operational RLS exception is introduced.
create or replace function public.platform_list_companies()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception using errcode='42501',message='Platform Administrator access required'; end if;
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into v_result from (
    select o.id,o.name,o.status,o.workspace_mode,o.created_at,
      (select count(*) from public.organisation_memberships m where m.organisation_id=o.id) as user_count,
      i.id as invitation_id,i.email as admin_email,i.full_name as admin_name,i.last_sent_at,i.last_error,
      case when u.email_confirmed_at is not null then 'accepted' else i.status end as invitation_status,
      exists(select 1 from public.organisation_memberships m where m.organisation_id=o.id and m.user_id=auth.uid()) as is_own_company
    from public.organisations o left join public.organisation_invitations i on i.organisation_id=o.id and i.initial_admin
    left join auth.users u on u.id=i.user_id
  ) x;
  return v_result;
end;
$$;
create or replace function public.platform_recent_activity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception using errcode='42501',message='Platform Administrator access required'; end if;
  select coalesce(jsonb_agg(x order by x.id desc),'[]'::jsonb) into v_result from (
    select a.id,a.created_at,a.event_type,a.description,o.name as company_name
    from public.platform_activity_log a left join public.organisations o on o.id=a.organisation_id
    order by a.id desc limit 50
  ) x;
  return v_result;
end;
$$;

-- Lock every new SECURITY DEFINER function down explicitly.
create or replace function public.guard_company_admin_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.organisation_id<>old.organisation_id or new.user_id<>old.user_id) then
    raise exception 'A membership cannot be transferred to another company or account';
  end if;
  if old.role='admin' and old.is_active then
    if tg_op='DELETE' or new.role<>'admin' or not new.is_active then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.organisation_id::text,2));
      if not exists(select 1 from public.organisation_memberships
        where organisation_id=old.organisation_id and user_id<>old.user_id and role='admin' and is_active) then
        raise exception 'A company must keep at least one active Admin';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists guard_company_admin_membership on public.organisation_memberships;
create trigger guard_company_admin_membership before update or delete on public.organisation_memberships
  for each row execute function public.guard_company_admin_membership();
revoke all on function public.guard_company_admin_membership() from public,anon,authenticated;

revoke all on function public.is_platform_admin(),public.is_org_member(uuid),public.is_org_admin(uuid),
  public.current_organisation_id(),public.platform_create_company(text,text,text,uuid),
  public.prepare_company_user_invite(text,text,public.app_role),public.claim_company_invitation(uuid),
  public.mark_company_invitation_failed(uuid,uuid),public.platform_set_company_status(uuid,text),
  public.platform_list_companies(),public.platform_recent_activity(),public.attach_reserved_company_invitation()
  from public,anon,authenticated;
grant execute on function public.is_platform_admin(),public.is_org_member(uuid),public.is_org_admin(uuid),
  public.current_organisation_id(),public.platform_create_company(text,text,text,uuid),
  public.prepare_company_user_invite(text,text,public.app_role),public.claim_company_invitation(uuid),
  public.mark_company_invitation_failed(uuid,uuid),public.platform_set_company_status(uuid,text),
  public.platform_list_companies(),public.platform_recent_activity() to authenticated;

commit;

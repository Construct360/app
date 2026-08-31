-- Linked Construct360 staff records for invited Operatives and Supervisors.

begin;

create table if not exists public.staff_members (
  id uuid primary key default extensions.gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 140),
  email text not null,
  employment_role text not null check (employment_role in ('Operative','Scaffold Supervisor')),
  team_name text not null default 'Unassigned',
  qualification text not null default 'None',
  availability text not null default 'Available',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_linked_staff_per_company unique (organisation_id, user_id)
);

create index if not exists staff_members_org_idx
  on public.staff_members (organisation_id);

-- Backfill users who were invited before this migration was installed.
insert into public.staff_members (
  organisation_id,
  user_id,
  full_name,
  email,
  employment_role,
  is_active,
  created_by
)
select
  m.organisation_id,
  m.user_id,
  coalesce(nullif(btrim(p.full_name), ''), p.email, 'Staff member'),
  p.email,
  case
    when m.role = 'supervisor'::public.app_role then 'Scaffold Supervisor'
    else 'Operative'
  end,
  m.is_active,
  m.created_by
from public.organisation_memberships as m
join public.profiles as p on p.id = m.user_id
where m.role in ('supervisor'::public.app_role, 'operative'::public.app_role)
on conflict (user_id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    employment_role = excluded.employment_role,
    is_active = excluded.is_active,
    updated_at = now();

drop trigger if exists staff_members_set_updated_at on public.staff_members;
create trigger staff_members_set_updated_at
before update on public.staff_members
for each row execute function public.set_updated_at();

alter table public.staff_members enable row level security;

revoke all on table public.staff_members from anon, authenticated;
grant select on table public.staff_members to authenticated;

drop policy if exists "members view linked staff" on public.staff_members;
create policy "members view linked staff"
on public.staff_members
for select
to authenticated
using (public.is_org_member(organisation_id));

-- Writes are deliberately restricted to the service-role Admin Edge Function.

commit;

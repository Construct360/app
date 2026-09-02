-- ONE-TIME OWNER STEP: run manually as postgres in Supabase SQL Editor AFTER 003.
-- No automatic email-based elevation during sign-up. Only this explicit script
-- appoints the existing verified account named by the Construct360 owner.
begin;
do $$
declare v_id uuid; v_org uuid;
begin
  select id into strict v_id from auth.users
    where lower(email)='sam.gerrie@construct-360.co.uk' and email_confirmed_at is not null;
  insert into public.platform_admins(user_id,is_active) values(v_id,true)
    on conflict(user_id) do update set is_active=true;
  select organisation_id into v_org from public.organisation_memberships where user_id=v_id;
  if v_org is not null then
    -- Retain the operator's current prototype, without moving or deleting data.
    update public.organisations set workspace_mode='prototype' where id=v_org;
  end if;
  insert into public.platform_activity_log(actor_user_id,event_type,description)
    values(v_id,'platform_admin_bootstrapped','Owner appointed the first Platform Administrator');
exception when no_data_found then
  raise exception 'Sam must already have a verified Supabase account at sam.gerrie@construct-360.co.uk. Verify that account, then rerun this file.';
end;
$$;
commit;

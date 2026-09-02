import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';
process.on('uncaughtException',error=>{console.error(error.message, error.query || '', error.where || '');process.exit(1)});

const root=path.resolve(import.meta.dirname,'..');
const db=new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema extensions;
  create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
  create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz,
    invited_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public to authenticated,anon,service_role;
  grant execute on function auth.uid() to authenticated,anon,service_role;
`);
for(const file of ['001_auth_foundation.sql','002_linked_staff_members.sql','003_platform_foundation.sql']){
  // PGlite has built-in gen_random_uuid but not Supabase's pgcrypto extension.
  const sql=(await fs.readFile(path.join(root,'supabase/migrations',file),'utf8'))
    .replace('create extension if not exists pgcrypto with schema extensions;','');
  await db.exec(sql); console.log('PASS migration',file);
}
await db.exec(await fs.readFile(path.join(root,'supabase/migrations/003_platform_foundation.sql'),'utf8'));
console.log('PASS migration 003 rerun');
let count=0;
async function owner(sql){await db.exec('reset role');return (await db.exec(sql)).at(-1);}
async function as(id,sql){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);return db.query(sql);}
async function reject(id,sql,pattern){await assert.rejects(()=>as(id,sql),pattern);count++;}
const sam='00000000-0000-4000-8000-000000000001';
const a='00000000-0000-4000-8000-000000000002';
const b='00000000-0000-4000-8000-000000000003';
const operative='00000000-0000-4000-8000-000000000004';
const outsider='00000000-0000-4000-8000-000000000005';
await owner(`insert into auth.users(id,email,email_confirmed_at) values('${sam}','sam.gerrie@construct-360.co.uk',now()),('${outsider}','outside@example.test',now());`);
await owner(`insert into public.organisations(id,name) values('10000000-0000-4000-8000-000000000001','Construct360');
 insert into public.organisation_memberships(organisation_id,user_id,role) values('10000000-0000-4000-8000-000000000001','${sam}','admin');`);
await db.exec(await fs.readFile(path.join(root,'supabase/setup/004_bootstrap_sam_platform_admin.sql'),'utf8'));
assert.equal((await as(sam,'select public.is_platform_admin() as ok')).rows[0].ok,true);count++;
assert.equal((await as(outsider,'select public.is_platform_admin() as ok')).rows[0].ok,false);count++;
await reject(outsider,'select public.platform_list_companies()',/Platform Administrator/);
await reject(outsider,`insert into public.platform_admins(user_id) values('${outsider}')`,/permission denied/);
await reject(outsider,`select public.create_organisation_and_admin('Unapproved')`,/permission denied/);
await reject(outsider,`select public.platform_create_company('Bad','Bad','bad@example.test',gen_random_uuid())`,/Platform Administrator/);
const requestA='20000000-0000-4000-8000-000000000001';
const createA=`select public.platform_create_company('Test Company A','Admin A','a@example.test','${requestA}') as id`;
const orgA=(await as(sam,createA)).rows[0].id;
assert.equal((await as(sam,createA)).rows[0].id,orgA);count++;
await reject(sam,`select public.platform_create_company('Different','Admin A','a@example.test','${requestA}')`,/different company/);
await reject(sam,`select public.platform_create_company('Duplicate','Admin A','a@example.test',gen_random_uuid())`,/already has/);
const orgB=(await as(sam,`select public.platform_create_company('Test Company B','Admin B','b@example.test',gen_random_uuid()) as id`)).rows[0].id;
const inviteA=(await owner(`select id from public.organisation_invitations where organisation_id='${orgA}'`)).rows[0].id;
const inviteB=(await owner(`select id from public.organisation_invitations where organisation_id='${orgB}'`)).rows[0].id;
await as(sam,`select public.claim_company_invitation('${inviteA}')`);
await reject(sam,`select public.claim_company_invitation('${inviteA}')`,/60 seconds/);
// Auth creation alone does not grant membership based on user-controlled metadata.
await owner(`insert into auth.users(id,email,raw_user_meta_data) values('${a}','a@example.test','{"organisation_id":"${orgB}","role":"admin"}');`);
assert.equal((await owner(`select count(*)::int as n from public.organisation_memberships where user_id='${a}'`)).rows[0].n,0);count++;
// Simulates the trusted Supabase invite transaction's invited_at update.
await owner(`update auth.users set invited_at=now() where id='${a}';
  insert into auth.users(id,email) values('${b}','b@example.test');
  update auth.users set invited_at=now() where id='${b}';
  update auth.users set email_confirmed_at=now() where id in ('${a}','${b}');`);
assert.equal((await as(a,'select public.current_organisation_id() as id')).rows[0].id,orgA);count++;
assert.equal((await as(b,'select public.current_organisation_id() as id')).rows[0].id,orgB);count++;
assert.equal((await as(a,`select * from public.organisations where id='${orgB}'`)).rows.length,0);count++;
assert.equal((await as(a,`select * from public.organisation_memberships where organisation_id='${orgB}'`)).rows.length,0);count++;
assert.equal((await as(a,`select * from public.profiles where id='${b}'`)).rows.length,0);count++;
await reject(a,`select public.platform_set_company_status('${orgB}','suspended')`,/Platform Administrator/);
await reject(a,`update public.organisations set status='active' where id='${orgA}'`,/permission denied/);
await reject(a,`update public.organisations set workspace_mode='prototype' where id='${orgA}'`,/permission denied/);
await reject(a,`update public.organisation_memberships set organisation_id='${orgB}' where user_id='${a}'`,/permission denied/);
await reject(a,`select public.prepare_company_user_invite('b@example.test','Other','operative')`,/unavailable/);
await reject(a,`select public.claim_company_invitation('${inviteB}')`,/access denied/);
const staffInvite=(await as(a,`select public.prepare_company_user_invite('worker@example.test','Worker A','operative') as id`)).rows[0].id;
await as(a,`select public.claim_company_invitation('${staffInvite}')`);
await owner(`insert into auth.users(id,email,invited_at) values('${operative}','worker@example.test',now());`);
assert.equal((await as(a,`select * from public.staff_members`)).rows.length,1);count++;
assert.equal((await as(b,`select * from public.staff_members`)).rows.length,0);count++;
assert.equal((await as(sam,`select * from public.staff_members where organisation_id='${orgA}'`)).rows.length,0);count++;
await reject(operative,`select public.prepare_company_user_invite('badworker@example.test','Bad','admin')`,/Admin access/);
await reject(operative,`insert into public.staff_members(organisation_id,user_id,full_name,email,employment_role) values('${orgB}','${operative}','x','x@example.test','Operative')`,/permission denied/);
await reject(operative,`insert into public.user_activity_log(organisation_id,actor_user_id,event_type) values('${orgB}','${operative}','fake')`,/row-level security/);
await as(sam,`select public.platform_set_company_status('${orgA}','suspended')`);
assert.equal((await as(a,'select public.current_organisation_id() as id')).rows[0].id,null);count++;
assert.equal((await as(a,'select * from public.staff_members')).rows.length,0);count++;
assert.equal((await as(a,'select * from public.user_activity_log')).rows.length,0);count++;
await reject(a,`select public.prepare_company_user_invite('new@example.test','New','operative')`,/Admin access/);
await reject(sam,`select public.claim_company_invitation('${inviteA}')`,/suspended/);
assert.equal((await as(a,`select status from public.organisations where id='${orgA}'`)).rows[0].status,'suspended');count++;
await as(sam,`select public.platform_set_company_status('${orgA}','active')`);
assert.equal((await as(a,'select public.current_organisation_id() as id')).rows[0].id,orgA);count++;
await reject(sam,`select public.platform_set_company_status('10000000-0000-4000-8000-000000000001','suspended')`,/own company/);
await owner(`update public.organisation_memberships set is_active=false where user_id='${operative}'`);
assert.equal((await as(operative,'select * from public.staff_members')).rows.length,0);count++;
await assert.rejects(()=>owner(`insert into public.organisation_memberships(organisation_id,user_id,role) values('${orgB}','${a}','admin')`),/one_construct360_company_per_user/);count++;
await owner('set role anon');
await assert.rejects(()=>db.query('select public.platform_list_companies()'),/permission denied/);count++;
await assert.rejects(()=>db.query('select * from public.platform_admins'),/permission denied/);count++;
const companies=(await as(sam,'select public.platform_list_companies() as data')).rows[0].data;
assert.equal(companies.length,3);count++;
assert.equal(companies.find(c=>c.id===orgA).workspace_mode,'setup');count++;
assert.equal(companies.find(c=>c.id===orgA).invitation_status,'accepted');count++;
await reject(sam,`select public.claim_company_invitation('${inviteA}')`,/accepted/);
const activity=(await as(sam,'select public.platform_recent_activity() as data')).rows[0].data;
assert.ok(activity.some(a=>a.event_type==='company_status_changed'));count++;
await assert.rejects(()=>owner(`update public.organisation_memberships set role='operative' where user_id='${a}'`),/at least one active Admin/);count++;
await assert.rejects(()=>owner(`delete from auth.users where id='${a}'`),/at least one active Admin/);count++;
await assert.rejects(()=>owner(`update public.organisation_memberships set organisation_id='${orgB}' where user_id='${a}'`),/cannot be transferred/);count++;
assert.equal((await owner(`select raw_user_meta_data->>'needs_password_setup' as flag from auth.users where id='${a}'`)).rows[0].flag,'true');count++;
// Unconfirmed invite retries keep the existing membership and linked staff.
await owner(`update public.organisation_memberships set is_active=true where user_id='${operative}';
  update public.organisation_invitations set last_attempt_at=now()-interval '2 minutes' where id='${staffInvite}';`);
const retry=(await as(a,`select public.claim_company_invitation('${staffInvite}') as data`)).rows[0].data;
await as(a,`select public.mark_company_invitation_failed('${staffInvite}','${retry.attempt_id}')`);
assert.equal((await owner(`select status from public.organisation_invitations where id='${staffInvite}'`)).rows[0].status,'failed');count++;
await owner(`update auth.users set invited_at=now() where id='${operative}'`);
await as(a,`select public.mark_company_invitation_failed('${staffInvite}','${retry.attempt_id}')`);
assert.equal((await owner(`select status from public.organisation_invitations where id='${staffInvite}'`)).rows[0].status,'sent');count++;
assert.equal((await owner(`select count(*)::int as n from public.staff_members where user_id='${operative}'`)).rows[0].n,1);count++;
assert.equal((await owner(`select count(*)::int as n from public.organisation_memberships where user_id='${operative}'`)).rows[0].n,1);count++;
// A failed Auth transaction rolls membership/staff/invitation updates back too.
const rollbackUser='00000000-0000-4000-8000-000000000099';
await as(a,`select public.prepare_company_user_invite('rollback@example.test','Rollback Test','supervisor')`);
await owner(`begin;insert into auth.users(id,email,invited_at) values('${rollbackUser}','rollback@example.test',now());rollback;`);
assert.equal((await owner(`select count(*)::int as n from public.organisation_memberships where user_id='${rollbackUser}'`)).rows[0].n,0);count++;
assert.equal((await owner(`select count(*)::int as n from public.staff_members where user_id='${rollbackUser}'`)).rows[0].n,0);count++;
await owner(`update public.platform_admins set is_active=false where user_id='${sam}'`);
await reject(sam,'select public.platform_list_companies()',/Platform Administrator/);
console.log(`PASS ${count} database assertions: tenant separation, grants, invitations, suspension, one-company rule and platform-only access`);

for(const file of ['auth.js','platform.js']) new vm.Script(await fs.readFile(path.join(root,file),'utf8'),{filename:file});
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if(match[1].trim()) new vm.Script(match[1]);
for(const file of ['_shared/platform.ts','platform-companies/index.ts','admin-users/index.ts']){
  const source=await fs.readFile(path.join(root,'supabase/functions',file),'utf8');
  const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file);
}
console.log('PASS JavaScript/inline script parse and Edge Function TypeScript syntax');
await db.close();

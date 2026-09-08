import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import path from 'node:path';
export const appRoot=path.resolve(import.meta.dirname,'..');
export const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002',ops:'00000000-0000-4000-8000-000000000003',worker:'00000000-0000-4000-8000-000000000004',platform:'00000000-0000-4000-8000-000000000005',supervisor:'00000000-0000-4000-8000-000000000006',orgA:'10000000-0000-4000-8000-000000000001',orgB:'10000000-0000-4000-8000-000000000002'};
export async function createDatabase(operations=process.env.C360_TEST_OPERATIONS==='1'||process.env.C360_TEST_V14==='1'||(process.env.C360_TEST_V15==='1'||process.env.C360_TEST_V16==='1')){
 const db=new PGlite();
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create schema extensions;
 create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
 create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,invited_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const filename of ['001_auth_foundation.sql','002_linked_staff_members.sql','003_platform_foundation.sql','005_clients_jobs.sql'])await db.exec((await fs.readFile(path.join(appRoot,'supabase/migrations',filename),'utf8')).replace('create extension if not exists pgcrypto with schema extensions;',''));
 if(operations)await db.exec(await fs.readFile(path.join(appRoot,'supabase/migrations/006_staff_teams_planner.sql'),'utf8'));
 if(process.env.C360_TEST_V14==='1'||(process.env.C360_TEST_V15==='1'||process.env.C360_TEST_V16==='1')){
  if(!operations)throw new Error('v14 tests require operations schema');
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  await db.exec(await fs.readFile(path.join(appRoot,'supabase/migrations/20260906180341_client_staff_documents_v14.sql'),'utf8'));
 }
 if((process.env.C360_TEST_V15==='1'||process.env.C360_TEST_V16==='1'))await db.exec(await fs.readFile(path.join(appRoot,'supabase/migrations/20260907195118_vehicle_inspections_v15.sql'),'utf8'));
 if(process.env.C360_TEST_V16==='1'){
  await db.exec(await fs.readFile(path.join(appRoot,'supabase/migrations/20260908200027_timesheets_v16.sql'),'utf8'));
  await db.exec(await fs.readFile(path.join(appRoot,'supabase/migrations/20260908210129_timesheets_simplified_v17.sql'),'utf8'));
 }
 await db.exec(`insert into public.organisations(id,name) values('${ids.orgA}','Test Company A'),('${ids.orgB}','Test Company B');`);
 for(const [name,role,org] of [['a','admin',ids.orgA],['b','admin',ids.orgB],['ops','operations',ids.orgA],['worker','operative',ids.orgA],['supervisor','supervisor',ids.orgA],['platform',null,null]]){
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[ids[name],name+'@example.test']);
  if(role)await db.query('insert into public.organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[org,ids[name],role]);
 }
 await db.query('insert into public.platform_admins(user_id) values($1)',[ids.platform]);
 return db;
}
export async function asUser(db,id,query,params=[]){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return db.query(query,params)}
export async function rpcAs(db,id,name,args=[]){const names={timesheets_snapshot:['date'],timesheet_history:['uuid'],timesheet_save:['text','jsonb','uuid'],workspace_snapshot:[],workspace_save:['text','jsonb','uuid'],workspace_import:['jsonb','uuid'],operations_snapshot:[],operations_save:['text','jsonb','uuid'],vehicles_snapshot:[],vehicle_history:['uuid','integer'],vehicle_save:['text','jsonb','uuid']};if(!(name in names))throw new Error('Unknown test RPC');return (await asUser(db,id,`select public.${name}(${names[name].map((t,i)=>'$'+(i+1)+'::'+t).join(',')}) as result`,args)).rows[0].result}

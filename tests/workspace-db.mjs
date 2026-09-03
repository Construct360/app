import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import path from 'node:path';
export const appRoot=path.resolve(import.meta.dirname,'..');
export const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002',ops:'00000000-0000-4000-8000-000000000003',worker:'00000000-0000-4000-8000-000000000004',platform:'00000000-0000-4000-8000-000000000005',supervisor:'00000000-0000-4000-8000-000000000006',orgA:'10000000-0000-4000-8000-000000000001',orgB:'10000000-0000-4000-8000-000000000002'};
export async function createDatabase(){
 const db=new PGlite();
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create schema extensions;
 create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
 create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,invited_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const filename of ['001_auth_foundation.sql','002_linked_staff_members.sql','003_platform_foundation.sql','005_clients_jobs.sql'])await db.exec((await fs.readFile(path.join(appRoot,'supabase/migrations',filename),'utf8')).replace('create extension if not exists pgcrypto with schema extensions;',''));
 await db.exec(`insert into public.organisations(id,name) values('${ids.orgA}','Test Company A'),('${ids.orgB}','Test Company B');`);
 for(const [name,role,org] of [['a','admin',ids.orgA],['b','admin',ids.orgB],['ops','operations',ids.orgA],['worker','operative',ids.orgA],['supervisor','supervisor',ids.orgA],['platform',null,null]]){
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[ids[name],name+'@example.test']);
  if(role)await db.query('insert into public.organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[org,ids[name],role]);
 }
 await db.query('insert into public.platform_admins(user_id) values($1)',[ids.platform]);
 return db;
}
export async function asUser(db,id,query,params=[]){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return db.query(query,params)}
export async function rpcAs(db,id,name,args=[]){const names={workspace_snapshot:[],workspace_save:['text','jsonb','uuid'],workspace_import:['jsonb','uuid']};if(!(name in names))throw new Error('Unknown test RPC');return (await asUser(db,id,`select public.${name}(${names[name].map((t,i)=>'$'+(i+1)+'::'+t).join(',')}) as result`,args)).rows[0].result}

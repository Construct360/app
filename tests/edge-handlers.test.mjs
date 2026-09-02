import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../supabase/functions');
let handler;
let claims=[];
let invites=0;
let env={APP_URL:'https://app.construct-360.co.uk',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',SUPABASE_ANON_KEY:'test-anon'};
let allowed=true;
let callerOrg='org-a';
let crossTarget=false;
let smtpFailure=false;
const tableQuery=table=>{
 const q={select:()=>q,eq:()=>q,single:async()=>({data:{id:'invitation-a',last_sent_at:null}}),
 maybeSingle:async()=>({data:table==='organisation_memberships'?(crossTarget?null:{organisation_id:'org-a',user_id:'target'}):null})};return q;
};
const caller={rpc:async(name,args)=>{
 claims.push(name);
 if(name==='is_platform_admin')return {data:allowed};
 if(name==='current_organisation_id')return {data:callerOrg};
 if(name==='is_org_admin')return {data:Boolean(callerOrg)};
 if(name==='platform_list_companies'||name==='platform_recent_activity')return {data:[]};
 if(name==='platform_create_company')return {data:'org-a'};
 if(name==='claim_company_invitation')return {data:{email:'local@example.test',full_name:'Local Test',organisation_id:'org-a',attempt_id:'attempt-a'}};
 return {data:null};
}};
const admin={auth:{getUser:async(token)=>({data:{user:token==='valid'?{id:'caller',email_confirmed_at:'2026-01-01'}:null}}),admin:{inviteUserByEmail:async()=>{invites++;return smtpFailure?{error:new Error('SMTP unavailable')}:{data:{user:{id:'new-user'}}};}}},from:tableQuery};
const loader=async(file,shared)=>{
 const source=await fs.readFile(path.join(root,file),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(compiled,{exports:module.exports,module,require:name=>name.includes('supabase-js')?{createClient:(_url,key)=>key==='test-service'?admin:caller}:shared,
  Deno:{env:{get:name=>env[name]},serve:fn=>{handler=fn}},URL,Request,Response,console:{error:()=>{}}},{filename:file});
 return module.exports;
};
const shared=await loader('_shared/platform.ts');
const req=(body={},token='valid',origin='https://app.construct-360.co.uk')=>new Request('https://example.supabase.co/functions/v1/test',{method:'POST',headers:{Authorization:`Bearer ${token}`,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
await assert.rejects(()=>shared.context(req({},'invalid')),/verified/);
await assert.rejects(()=>shared.context(req({},'valid','https://untrusted.example')),/origin/);
const original=env.APP_URL;env.APP_URL='';await assert.rejects(()=>shared.context(req()),/setup is incomplete/);env.APP_URL=original;
env.APP_URL='https://app.construct-360.co.uk/path';await assert.rejects(()=>shared.context(req()),/without a path/);env.APP_URL=original;
const ctx=await shared.context(req());
smtpFailure=true;await assert.rejects(()=>shared.sendReservedInvite(ctx,'invitation-a'),/SMTP/);
assert.ok(claims.includes('mark_company_invitation_failed'));
smtpFailure=false;assert.equal(await shared.sendReservedInvite(ctx,'invitation-a'),'new-user');
await loader('platform-companies/index.ts',shared);
allowed=false;let r=await handler(req({action:'list'}));assert.equal(r.status,403);
allowed=true;r=await handler(req({action:'list'}));assert.equal(r.status,200);assert.deepEqual((await r.json()).companies,[]);
r=await handler(req({action:'invalid'}));assert.equal(r.status,400);
smtpFailure=true;r=await handler(req({action:'create',name:'Local',admin_email:'local@example.test',admin_name:'Local',request_id:'request-a'}));
assert.equal(r.status,200);const pending=await r.json();assert.equal(pending.ok,true);assert.equal(pending.invitation_sent,false);
await loader('admin-users/index.ts',shared);
callerOrg=null;r=await handler(req({action:'invite'}));assert.equal(r.status,403);
callerOrg='org-a';crossTarget=true;r=await handler(req({action:'delete-user',user_id:'user-in-another-company'}));assert.equal(r.status,404);
assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://app.construct-360.co.uk');
console.log('PASS Edge handler checks: invalid auth/origin/config, platform-only access, SMTP failure retention, and cross-company delete denial (mock Supabase transport; no emails sent)');

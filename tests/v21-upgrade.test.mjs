import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {createDatabase,ids,rpcAs,appRoot} from './workspace-db.mjs';
for(const v of [14,15,16,18,19,20])process.env['C360_TEST_V'+v]='1';process.env.C360_TEST_V21='0';
const db=await createDatabase();let n=0;const check=(v,msg)=>{assert.ok(v,msg);n++;console.log('PASS',msg)};
const call=(name,args=[])=>rpcAs(db,ids.a,name,args),save=(name,kind,data,req=randomUUID())=>call(name,[kind,JSON.stringify(data),req]);
try{
 const c=await save('workspace_save','client',{name:'Existing V20',contacts:[]}),j=await save('workspace_save','job',{site:'Existing site',client_id:c.id,status:'Handover',contact_ids:[]});
 const staff=(await call('operations_snapshot')).staff.find(s=>s.user_id===ids.worker),request=randomUUID(),payload={job_id:j.id,task:'Existing task',staff_ids:[staff.id],starts_at:'2030-01-07T08:00:00Z',ends_at:'2030-01-07T12:00:00Z'};
 const b=await save('operations_save','booking',payload,request),before=await call('operations_snapshot');
 await db.exec('reset role');const f=randomUUID();await db.query("insert into public.job_files(id,organisation_id,job_id,category,name,mime_type,byte_size,object_path,ready) values($1,$2,$3,'rams','Existing RAMS','application/pdf',100,'existing-v21-proof',true)",[f,ids.orgA,j.id]);
 const migration=await fs.readFile(appRoot+'/supabase/migrations/20260922033518_job_media_staff_planner_v21.sql','utf8');await db.exec(migration);
 const after=await call('operations_snapshot');check(JSON.stringify(before)===JSON.stringify(after),'Existing operation snapshot preserved through upgrade');
 check((await call('job_resources_snapshot',[j.id])).files.some(x=>x.id===f&&!x.deletion_pending),'Existing files remain visible, no automatic deletions');
 check((await save('operations_save','booking',payload,request)).id===b.id,'Existing mutation receipt retained');
 await db.exec('reset role');await assert.rejects(()=>db.exec(migration),/already exists/);await db.exec('rollback');n++;
 check((await call('operations_snapshot')).bookings.some(x=>x.id===b.id),'Accidental migration rerun rolls back safely');
 await db.exec('reset role');await db.query("update public.organisations set status='suspended' where id=$1",[ids.orgA]);
 await assert.rejects(()=>call('job_file_delete',['begin',f,randomUUID()]),/required/);n++;
 await assert.rejects(()=>call('planner_delete',[b.id,1,true,randomUUID()]),/required/);n++;
 console.log(`PASS v21 upgrade: ${n} checks`);
}finally{await db.close()}

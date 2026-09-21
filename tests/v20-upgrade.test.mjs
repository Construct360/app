import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {createDatabase,ids,rpcAs,asUser,appRoot} from './workspace-db.mjs';
for(const v of [16,18,19])process.env['C360_TEST_V'+v]='1';process.env.C360_TEST_V20='0';
const db=await createDatabase();let count=0;const check=(v,msg)=>{assert.ok(v,msg);count++};
const call=(who,name,args=[])=>rpcAs(db,ids[who],name,args),save=(name,kind,data,id=randomUUID())=>call('a',name,[kind,JSON.stringify(data),id]);
try{
 const staff=(await call('a','operations_snapshot')).staff.find(s=>s.user_id===ids.worker);
 const c=await save('workspace_save','client',{name:'Existing client',contacts:[]});
 const request=randomUUID(),payload={client_id:c.id,site:'Existing live job',status:'Delivery & Erection',notes:'Existing private notes',team:'Old team label',contact_ids:[]};
 const j=await save('workspace_save','job',payload,request);
 const vehicle=await save('vehicle_save','vehicle',{version:0,registration:'OLD20',name:'Existing van',vehicle_type:'Van',availability:'Available',mileage:100,assigned_staff_id:staff.id});
 const previous=await call('a','operations_snapshot');await db.exec('reset role');
 const migration=await fs.readFile(appRoot+'/supabase/migrations/20260921181503_dashboard_assignments_notifications_v20.sql','utf8');await db.exec(migration);
 let current=await call('a','operations_snapshot'),job=current.jobs.find(x=>x.id===j.id);
 check(job.version===previous.jobs[0].version&&job.notes===payload.notes&&job.team===payload.team,'Historical job fields/version preserved');
 check(job.site_address===''&&job.supervisor_staff_id===null&&job.staff_ids.length===0,'No invented addresses or job assignments');
 check((await call('worker','vehicles_snapshot')).vehicles.find(x=>x.id===vehicle.id).assigned_to_me,'Pre-existing vehicle assignment becomes visible as own');
 check((await call('a','notifications_snapshot',[null,25])).items.length===0,'Upgrade does not fabricate historical notifications');
 check((await save('workspace_save','job',payload,request)).id===j.id,'Old save receipt remains valid');
 check((await call('a','notifications_snapshot',[null,25])).items.length===0,'Replaying old receipt creates no notification');
 const newPayload={id:j.id,version:job.version,...payload,site_address:'New site address',supervisor_staff_id:staff.id,staff_ids:[staff.id]};
 await save('workspace_save','job',newPayload);job=(await call('a','operations_snapshot')).jobs.find(x=>x.id===j.id);
 // Simulate an old v19 tab without the new fields saving/archive; preserve assignments.
 await save('workspace_save','job',{id:j.id,version:job.version,...payload,archived:true});job=(await call('a','operations_snapshot')).jobs.find(x=>x.id===j.id);
 check(job.site_address==='New site address'&&job.supervisor_staff_id===staff.id&&job.staff_ids.includes(staff.id),'Older tab save preserves all new fields');
 check(job.archived&&!job.is_live,'Archived live status is not a live job');
 await db.exec('reset role');const functions=await db.query("select proname,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') auth from pg_proc where pronamespace='public'::regnamespace and proname in ('workspace_save','operations_snapshot','job_resources_snapshot','vehicles_snapshot','notifications_snapshot','notifications_mark_read')");
 check(functions.rows.length===6&&functions.rows.every(r=>!r.anon&&r.auth&&r.proconfig.some(x=>x.startsWith('search_path='))),'Public RPC grants and fixed search paths verified');
 const helpers=await db.query("select proname,has_function_privilege('authenticated',oid,'execute') auth,has_function_privilege('anon',oid,'execute') anon from pg_proc where pronamespace='c360_private'::regnamespace and (proname like 'notify%' or proname in ('job_summary','staff_recipient','job_recipients','workspace_save_v14','operations_snapshot_v19','job_resources_snapshot_v18','vehicles_snapshot_v15'))");
 check(helpers.rows.length>=15&&helpers.rows.every(r=>!r.auth&&!r.anon),'All new privileged helpers denied to browser roles');
 const tables=await db.query("select relname,relrowsecurity from pg_class where relname in ('workspace_notifications','workspace_notification_reads','job_staff_assignments')");check(tables.rows.length===3&&tables.rows.every(r=>r.relrowsecurity),'RLS enabled on all new tables');
 await assert.rejects(()=>db.exec(migration),/already exists/);await db.exec('rollback');count++;check((await call('a','operations_snapshot')).jobs[0].site_address==='New site address','Accidental migration rerun fails without partial changes');
 await db.exec("reset role;set role anon");await assert.rejects(()=>db.query('select public.notifications_snapshot()'),/denied/);count++;
 await assert.rejects(()=>call('platform','notifications_snapshot',[null,25]),/Active company/);count++;
 await db.exec('reset role');await db.query("update public.organisations set status='suspended' where id=$1",[ids.orgA]);await assert.rejects(()=>call('worker','notifications_snapshot',[null,25]),/Active company/);count++;
 check((await asUser(db,ids.worker,'select id from public.workspace_notifications')).rows.length===0,'Suspended company has no direct notification access');
 console.log(`PASS v20 upgrade: ${count} checks; existing data, receipts, old-client compatibility, grants, RLS, suspension.`);
}finally{await db.close()}

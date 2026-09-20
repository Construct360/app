import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {createDatabase,ids,rpcAs,appRoot} from './workspace-db.mjs';
process.env.C360_TEST_V16='1';process.env.C360_TEST_V18='1';process.env.C360_TEST_V19='0';
const db=await createDatabase();
const call=(name,args=[])=>rpcAs(db,ids.a,name,args);const save=(name,kind,data)=>call(name,[kind,JSON.stringify(data),randomUUID()]);
try{
 const c=await save('workspace_save','client',{name:'Existing client',contacts:[]});
 const old=await save('workspace_save','job',{client_id:c.id,site:'Existing handover',status:'Handover & Initial Inspection',team:'Retained historic label',contact_ids:[]});
 const completed=await save('workspace_save','job',{client_id:c.id,site:'Existing complete',status:'Completed',contact_ids:[]});
 const ordinary=await save('workspace_save','job',{client_id:c.id,site:'Three scaffolds',status:'Quotation',contact_ids:[]});
 for(const [job,refs]of [[old,['Historic']],[ordinary,['Front','Rear','Dismantled']]])for(const reference of refs)await save('scaffold_save','scaffold',{job_id:job.id,reference,location:reference,description:'Existing scaffold',erected_on:'2026-01-01'});
 await db.exec("reset role; update public.job_scaffolds set inspection_required=false; update public.job_scaffolds set dismantled=true where reference='Dismantled'");
 await db.exec(await fs.readFile(appRoot+'/supabase/migrations/20260919183227_profiles_planner_handover_v19.sql','utf8'));
 let snapshot=await call('operations_snapshot');
 assert.equal(snapshot.jobs.find(j=>j.id===old.id).status,'Handover');assert.equal(snapshot.jobs.find(j=>j.id===completed.id).status,'Completion/Closed');assert.equal(snapshot.jobs.find(j=>j.id===old.id).team,'Retained historic label');
 let scaffolds=(await call('scaffold_snapshot')).scaffolds;assert.equal(scaffolds.find(s=>s.job_id===old.id).inspection_required,false);
 await save('workspace_save','job',{id:ordinary.id,version:1,client_id:c.id,site:'Three scaffolds',status:'Handover',contact_ids:[]});
 scaffolds=(await call('scaffold_snapshot')).scaffolds.filter(s=>s.job_id===ordinary.id);assert.equal(scaffolds.filter(s=>s.inspection_required&&!s.dismantled).length,2);assert.equal(scaffolds.find(s=>s.dismantled).inspection_required,false);
 const audit=await call('scaffold_history',[scaffolds.find(s=>!s.dismantled).id]);assert.ok(audit.events.some(e=>e.action==='handover'));
 await db.exec('reset role');
 const protectedFunctions=await db.query("select proname,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated from pg_proc where pronamespace='public'::regnamespace and proname in ('annual_leave_save','operations_save','operations_snapshot','scaffold_snapshot')");
 assert.equal(protectedFunctions.rows.length,4);assert.ok(protectedFunctions.rows.every(r=>!r.anon&&r.authenticated&&r.proconfig.some(x=>x.startsWith('search_path='))));
 const privateFunctions=await db.query("select proname,has_function_privilege('authenticated',oid,'execute') allowed from pg_proc where pronamespace='c360_private'::regnamespace and proname in ('operations_save_v14','operations_snapshot_v14','scaffold_snapshot_v18','require_handover_inspections','normalise_job_handover','register_handover_scaffold')");
 assert.equal(privateFunctions.rows.length,6);assert.ok(privateFunctions.rows.every(r=>!r.allowed));
 console.log('PASS v19 upgrade: 11 checks; existing status/data retention, no historical event fabrication, multi-scaffold handover, dismantled exclusion, audit and grants.');
}finally{await db.close()}

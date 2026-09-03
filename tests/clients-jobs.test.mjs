import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createDatabase,ids,asUser,rpcAs,appRoot} from './workspace-db.mjs';
const db=await createDatabase();let checks=0;
const ok=(actual,expected)=>{assert.deepEqual(actual,expected);checks++};
async function rejects(fn,pattern){await assert.rejects(fn,pattern);checks++}
const save=(user,kind,data,request=crypto.randomUUID())=>rpcAs(db,user,'workspace_save',[kind,JSON.stringify(data),request]);
const snapshot=user=>rpcAs(db,user,'workspace_snapshot');
const client=(name,extra={})=>({name,contacts:[],...extra});
const job=(client_id,extra={})=>({client_id,site:'Brighton Marina',status:'Quotation',contact_ids:[],...extra});
const read=(user,table)=>asUser(db,user,`select * from public.${table}`);
const owner=async sql=>{await db.exec('reset role');return db.exec(sql)};
const contactId=crypto.randomUUID();
const req=crypto.randomUUID(),payload=client('Acme Scaffold',{contacts:[{id:contactId,name:'Site Manager',email:'site@example.test'}]});
const a=await save(ids.a,'client',payload,req);
ok(a.code,'123');ok(await save(ids.a,'client',payload,req),a);ok((await snapshot(ids.a)).clients.length,1);
await rejects(()=>save(ids.a,'client',client('Different'),req),/Request changed/);
const b=await save(ids.b,'client',client('Other Company Client'));
ok(b.code,'123');ok((await snapshot(ids.a)).clients.map(c=>c.name),['Acme Scaffold']);
ok((await snapshot(ids.b)).contacts.length,0);
const a2=await save(ids.ops,'client',client('Operations Client'));ok(a2.code,'124');
const j=await save(ids.ops,'job',job(a.id,{contact_ids:[contactId],start_date:'2026-09-01',end_date:'2026-09-20'}));ok(j.code,'123001');
const j2=await save(ids.a,'job',job(a2.id));ok(j2.code,'124001');
ok((await snapshot(ids.a)).assignments.length,1);
for(const table of ['clients','jobs','client_contacts','job_contact_assignments']){
 ok((await read(ids.b,table)).rows.every(r=>r.organisation_id===ids.orgB),true);
 for(const user of [ids.worker,ids.supervisor,ids.platform])ok((await read(user,table)).rows.length,0);
 await rejects(()=>asUser(db,ids.a,`delete from public.${table}`),/permission denied/);
}
for(const user of [ids.worker,ids.supervisor,ids.platform]){
 await rejects(()=>snapshot(user),/Active company/);
 await rejects(()=>save(user,'client',client('Forbidden')),/Active company/);
}
await rejects(()=>save(ids.a,'client',client('Spoof',{organisation_id:ids.orgB})),/assigned by the server/);
await rejects(()=>save(ids.a,'client',client('Overwrite',{id:b.id})),/Client unavailable/);
await rejects(()=>save(ids.a,'client',client('Overwrite',{id:b.id,version:1})),/changed or is unavailable/);
await rejects(()=>save(ids.a,'job',job(b.id)),/Client unavailable/);
await rejects(()=>save(ids.a,'job',job(a2.id,{contact_ids:[contactId]})),/does not belong/);
await rejects(()=>save(ids.b,'job',job(b.id,{contact_ids:[contactId]})),/does not belong/);
await rejects(()=>save(ids.b,'client',client('Steal contact',{id:b.id,version:1,contacts:[{id:contactId,name:'Bad'}]})),/Contact unavailable/);
ok((await snapshot(ids.b)).clients[0].version,1);
await rejects(()=>save(ids.a,'client',client('Remove assigned',{id:a.id,version:1})),/assigned to a job/);
ok((await snapshot(ids.a)).clients[0].name,'Acme Scaffold');
await rejects(()=>save(ids.a,'job',job(a.id,{start_date:'2026-09-20',end_date:'2026-09-01'})),/check constraint/);
await rejects(()=>save(ids.a,'job',job(a.id,{status:'Bogus'})),/check constraint/);
await rejects(()=>save(ids.a,'job',job(a.id,{site:''})),/check constraint/);
await rejects(()=>save(ids.a,'client',client('x'.repeat(161))),/check constraint/);
await rejects(()=>save(ids.a,'client',client('Repeated contacts',{contacts:[{id:crypto.randomUUID(),name:''}]})),/check constraint/);
ok((await snapshot(ids.a)).clients.length,2);
const updated=await save(ids.ops,'job',job(a.id,{id:j.id,version:1,site:'Updated job',contact_ids:[contactId]}));ok(updated.version,2);
await rejects(()=>save(ids.a,'job',job(a.id,{id:j.id,version:1,site:'Stale overwrite'})),/changed or is unavailable/);
await rejects(()=>save(ids.a,'job',job(a2.id,{id:j.id,version:2})),/cannot be moved/);
await rejects(()=>save(ids.a,'client',{...payload,id:a.id,version:1,archived:true}),/Archive this client/);
await save(ids.a,'job',job(a.id,{id:j.id,version:2,archived:true,contact_ids:[contactId]}));
await save(ids.a,'client',{...payload,id:a.id,version:1,archived:true});
await rejects(()=>save(ids.ops,'job',job(a.id)),/Restore the client/);
await rejects(()=>save(ids.ops,'job',job(a.id,{id:j.id,version:3,archived:false})),/Restore the client/);
await save(ids.ops,'client',{...payload,id:a.id,version:2,archived:false});
await save(ids.ops,'job',job(a.id,{id:j.id,version:3,archived:false}));
await save(ids.ops,'client',{...payload,id:a.id,version:3,contacts:[]});
ok((await snapshot(ids.a)).contacts.length,0);
// Disabled and suspended accounts cannot read or mutate, even with a saved request ID.
await owner(`update public.organisation_memberships set is_active=false where user_id='${ids.ops}'`);
await rejects(()=>snapshot(ids.ops),/Active company/);ok((await read(ids.ops,'clients')).rows.length,0);
await owner(`update public.organisation_memberships set is_active=true where user_id='${ids.ops}';update public.organisations set status='suspended' where id='${ids.orgA}'`);
await rejects(()=>save(ids.a,'client',payload,req),/Active company/);ok((await read(ids.a,'jobs')).rows.length,0);
await owner(`update public.organisations set status='active' where id='${ids.orgA}'`);
await owner(`update auth.users set email_confirmed_at=null where id='${ids.ops}'`);await rejects(()=>snapshot(ids.ops),/Active company/);
await owner(`update auth.users set email_confirmed_at=now() where id='${ids.ops}'`);
// Explicit, atomic transfer. Per-client job numbers preserve the original 123001/124001 convention.
const bundle={format:'construct360-transfer-v1',organisation_id:ids.orgA,clients:[{code:'200',name:'Imported A',contacts:[{key:'0',name:'Imported contact'}]},{code:'201',name:'Imported B',contacts:[]}],jobs:[{code:'200001',client_code:'200',site:'Import Site A',status:'Quotation',contact_keys:['0']},{code:'201001',client_code:'201',site:'Import Site B',contact_keys:[]}]};
const importReq=crypto.randomUUID(),importBundle=(user,data=bundle,request=crypto.randomUUID())=>rpcAs(db,user,'workspace_import',[JSON.stringify(data),request]);
await rejects(()=>importBundle(ids.ops),/Admin access required for imports/);
await rejects(()=>importBundle(ids.b),/not for your company/);
const invalid=structuredClone(bundle);invalid.jobs[1].start_date='not-a-date';
await rejects(()=>importBundle(ids.a,invalid),/invalid input syntax/);ok((await snapshot(ids.a)).clients.length,2);
const invalidContact=structuredClone(bundle);invalidContact.jobs[0].contact_keys=['missing'];
await rejects(()=>importBundle(ids.a,invalidContact),/missing from its client/);ok((await snapshot(ids.a)).clients.length,2);
ok(await importBundle(ids.a,bundle,importReq),{clients:2,jobs:2});ok(await importBundle(ids.a,bundle,importReq),{clients:2,jobs:2});
ok((await snapshot(ids.a)).clients.length,4);ok((await snapshot(ids.b)).clients.length,1);
await rejects(()=>importBundle(ids.a),/Duplicate or missing client code/);
// New numbering follows imported codes; records are never overwritten.
ok((await save(ids.a,'client',client('After import'))).code,'202');
const importedClient=(await snapshot(ids.a)).clients.find(c=>c.code==='200');ok((await save(ids.a,'job',job(importedClient.id))).code,'200002');
// Constraints still protect tenant/contact relationships when bypassing RLS as the database owner.
await rejects(()=>owner(`insert into public.jobs(organisation_id,client_id,code,number,site) values('${ids.orgA}','${b.id}','999001',1,'Bad link')`),/foreign key/);
await owner('set role anon');for(const sql of ['select public.workspace_snapshot()',"select public.workspace_save('client','{}',gen_random_uuid())","select public.workspace_import('{}',gen_random_uuid())",'select * from public.clients'])await rejects(()=>db.query(sql),/permission denied/);
await owner('reset role');await db.exec(await fs.readFile(appRoot+'/supabase/migrations/005_clients_jobs.sql','utf8'));ok((await snapshot(ids.a)).clients.length,5);
for(const file of ['auth.js','platform.js','workspace.js','legacy-transfer.js'])new vm.Script(await fs.readFile(appRoot+'/'+file,'utf8'),{filename:file});
const html=await fs.readFile(appRoot+'/index.html','utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
// Execute the actual legacy exporter with a download sink. It must not export local
// attachments/auth/session data or guess years from the old human-readable date labels.
let downloaded,exportMessage;
const legacyContext=vm.createContext({Blob,setTimeout:fn=>fn(),URL:{createObjectURL:b=>{downloaded=b;return 'blob:test'},revokeObjectURL:()=>{}},document:{createElement:()=>({click(){}})},
 c360Access:{membership:{role:'admin'},organisation:{id:ids.orgA,name:'Test Company A',workspace_mode:'prototype'}},
 clients:[{code:'300',name:'Legacy client',email:'client@example.test'}],jobs:[{id:'300001',clientCode:'300',site:'Legacy site',dates:'17–20 Aug',status:'Quotation',photos:['NEVER_EXPORT_ATTACHMENT']}],
 loadClients(){},getClientContacts:()=>[{name:'Legacy Site Lead'}],getSiteContactAssignments:()=>({'300001':[0]}),toast:message=>exportMessage=message});
vm.runInContext(await fs.readFile(appRoot+'/legacy-transfer.js','utf8'),legacyContext);vm.runInContext('exportLegacyClientsJobs()',legacyContext);
const transferred=JSON.parse(await downloaded.text());ok(transferred.jobs[0].start_date,'');ok(transferred.jobs[0].contact_keys,['0']);ok(transferred.jobs[0].notes,'Legacy date label (year not recorded): 17–20 Aug');ok(JSON.stringify(transferred).includes('NEVER_EXPORT_ATTACHMENT'),false);ok(transferred.organisation_id,ids.orgA);ok(exportMessage.startsWith('Exported'),true);
ok(await importBundle(ids.a,transferred),{clients:1,jobs:1});
// Round-trip the actual workspace exporter through the importer in a fresh DB.
const fullSnapshot=await snapshot(ids.a),source=await fs.readFile(appRoot+'/workspace.js','utf8');
const exportContext=vm.createContext({workspaceData:fullSnapshot,c360Access:{organisation:{name:'Test Company A'}},contactsFor:id=>fullSnapshot.contacts.filter(c=>c.client_id===id),assignmentsFor:id=>fullSnapshot.assignments.filter(a=>a.job_id===id).map(a=>a.contact_id),clientFor:id=>fullSnapshot.clients.find(c=>c.id===id)});
vm.runInContext(source.slice(source.indexOf('function transferBundle(){'),source.indexOf('function downloadJson(')),exportContext);
const roundTrip=JSON.parse(vm.runInContext('JSON.stringify(transferBundle())',exportContext));
const restored=await createDatabase();await rpcAs(restored,ids.a,'workspace_import',[JSON.stringify(roundTrip),crypto.randomUUID()]);
const restoredSnapshot=await rpcAs(restored,ids.a,'workspace_snapshot');ok(restoredSnapshot.clients.length,fullSnapshot.clients.length);ok(restoredSnapshot.jobs.length,fullSnapshot.jobs.length);ok(restoredSnapshot.assignments.length,fullSnapshot.assignments.length);
ok(restoredSnapshot.clients.map(c=>[c.code,c.name,c.email,c.notes,c.archived]),fullSnapshot.clients.map(c=>[c.code,c.name,c.email,c.notes,c.archived]));await restored.close();
console.log(`PASS ${checks} Clients & Jobs assertions: migration/rerun, tenant ownership, Admin/Operations, contact links, versions, retries, archives, atomic import, grants and SQL constraints.`);
await db.close();

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createDatabase,ids,rpcAs} from './workspace-db.mjs';
process.env.C360_TEST_V16='1';
const db=await createDatabase();let count=0;
const check=(value,message)=>{assert.ok(value,message);count++};
const save=(action,data)=>rpcAs(db,ids.worker,'timesheet_save',[action,JSON.stringify(data),randomUUID()]);
const week='2026-08-24';
try{
 // Emulate a deployed v16 with a quarter-hour draft and approved record.
 const old=await fs.readFile(new URL('../supabase/migrations/20260908200027_timesheets_v16.sql',import.meta.url),'utf8');
 const rpc=old.slice(old.indexOf('create function public.timesheet_save('),old.indexOf('revoke all on function public.timesheets_snapshot')).replace('create function','create or replace function');
 await db.exec('reset role');await db.exec(rpc);
 const draft=await save('save',{week_start:week,version:0,entries:[{date:week,hours:7.25,notes:'Original quarter hours'}]});
 const approvedWeek='2026-08-17';
 const submitted=await save('submit',{week_start:approvedWeek,version:0,entries:[{date:approvedWeek,hours:7.25}],confirmed:true});
 await db.exec('reset role');await db.query('update public.staff_members set hourly_rate=25.50 where user_id=$1',[ids.worker]);
 await rpcAs(db,ids.ops,'timesheet_save',['approve',JSON.stringify({id:submitted.id,version:submitted.version,confirmed:true,expected_rate:25.5}),randomUUID()]);
 await db.exec('reset role');
 const snapshot=async()=>JSON.stringify((await db.query("select jsonb_build_object('sheets',(select jsonb_agg(t order by id) from public.timesheets t),'pay',(select jsonb_agg(p order by timesheet_id) from public.timesheet_pay p),'events',(select jsonb_agg(e order by id) from public.timesheet_events e)) data")).rows);
 const before=await snapshot();
 const migration=await fs.readFile(new URL('../supabase/migrations/20260908210129_timesheets_simplified_v17.sql',import.meta.url),'utf8');
 await db.exec(migration);
 check(await snapshot()===before,'Upgrade preserves drafts, approved records, rate snapshots and history byte-for-byte');
 await db.exec(migration);check(await snapshot()===before,'v17 rerun preserves records');
 await assert.rejects(()=>save('save',{id:draft.id,version:draft.version,week_start:week,entries:[{date:week,hours:7.25}]}),/whole or half/);count++;
 let result=draft;
 for(const hours of [0,0.5,8,8.5,23.5,24]){
  result=await save('save',{id:result.id,version:result.version,week_start:week,entries:[{date:week,hours}]});
  check(result.status==='draft','Accept whole/half boundary '+hours);
 }
 await db.exec('reset role');
 check((await db.query("select count(*)::int n from public.timesheet_events where entries @> '[{\"hours\":7.25}]'::jsonb")).rows[0].n>=2,'Original quarter-hour history retained after corrected save');
 console.log('PASS v17 upgrade: '+count+' assertions (historical data retention, rerun, half-hour boundaries).');
}catch(error){console.error(error.message);process.exitCode=1}finally{await db.close()}

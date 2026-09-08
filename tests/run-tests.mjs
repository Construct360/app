import {spawnSync} from 'node:child_process';
for(const [name,v14,v16=false] of [['platform-foundation',false],['edge-handlers',false],['clients-jobs',false],['operations',false],['clients-jobs',true],['operations',true],['client-staff-v14',true],['weather-api',true],['vehicles',true],['timesheets',true,true],['timesheets-v17',true,true],['clients-jobs',true,true],['operations',true,true],['client-staff-v14',true,true],['vehicles',true,true]]){
 const result=spawnSync(process.execPath,[name+'.test.mjs'],{cwd:import.meta.dirname,stdio:'inherit',env:{...process.env,C360_TEST_V14:v14?'1':'0',C360_TEST_OPERATIONS:'0',C360_TEST_V15:name==='vehicles'||v16?'1':'0',C360_TEST_V16:v16?'1':'0'}});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}

import {spawnSync} from 'node:child_process';
for(const [name,v14] of [['platform-foundation',false],['edge-handlers',false],['clients-jobs',false],['operations',false],['clients-jobs',true],['operations',true],['client-staff-v14',true],['weather-api',true],['vehicles',true]]){
 const result=spawnSync(process.execPath,[name+'.test.mjs'],{cwd:import.meta.dirname,stdio:'inherit',env:{...process.env,C360_TEST_V14:v14?'1':'0',C360_TEST_OPERATIONS:'0',C360_TEST_V15:name==='vehicles'?'1':'0'}});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}

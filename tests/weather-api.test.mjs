import assert from 'node:assert/strict';
import handler from '../api/weather.js';
process.env.CONSTRUCT360_SUPABASE_URL='https://supabase.example.test';process.env.CONSTRUCT360_SUPABASE_PUBLISHABLE_KEY='public-test';process.env.WEATHER_API_KEY='private-fixture-key';
let mode='ok',calls=0;
global.fetch=async url=>{calls++;url=String(url);if(url.includes('/auth/'))return Response.json({id:'test-user'},{status:mode==='bad-auth'?401:200});if(url.includes('/rpc/'))return Response.json(mode==='suspended'?null:'company-id');if(mode==='failure')throw Error('upstream failed with a key that must not leak');if(mode==='missing')return Response.json({error:{code:1006}},{status:400});return Response.json({location:{name:'Glasgow',region:'Scotland',country:'UK'},current:{temp_c:12.5,feelslike_c:11,condition:{text:'Cloudy'},wind_mph:12,gust_mph:18,humidity:70,precip_mm:0,last_updated:'2026-09-06 18:00',last_updated_epoch:1788714000}})};
async function call(query='Glasgow',auth='Bearer valid-fixture-token',method='GET'){const result={headers:{}};await handler({method,headers:{authorization:auth},query:{q:query}},{setHeader:(k,v)=>result.headers[k]=v,status:s=>({json:data=>Object.assign(result,{status:s,data})})});return result}
assert.equal((await call('Glasgow',null)).status,401);assert.equal(calls,0);
assert.equal((await call('',undefined)).status,400);assert.equal((await call('Glasgow',undefined,'POST')).status,405);
mode='bad-auth';assert.equal((await call()).status,401);mode='suspended';assert.equal((await call()).status,403);
mode='ok';const secret=process.env.WEATHER_API_KEY;delete process.env.WEATHER_API_KEY;assert.equal((await call()).data.setupRequired,true);process.env.WEATHER_API_KEY=secret;
const good=await call();assert.equal(good.status,200);assert.equal(good.data.current.temperature,12.5);assert.ok(!JSON.stringify(good).includes(secret));assert.equal(good.headers['Cache-Control'],'private, no-store');
const before=calls;await call();assert.equal(calls-before,2,'Cached weather still rechecks Auth and membership');
mode='missing';assert.equal((await call('Unknown place')).status,404);mode='failure';const failed=await call('New place');assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes('key'));
console.log('PASS weather endpoint: authentication, membership, setup, validation, cache, private key, provider errors.');

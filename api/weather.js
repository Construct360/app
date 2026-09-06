// Provider key stays on the server. Only active, verified company users may query.
const cache=new Map(),requests=new Map();
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'})}
  const authorization=req.headers.authorization;
  if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)||authorization.length>8192)return res.status(401).json({error:'Sign in to view weather.'});
  const q=typeof req.query.q==='string'?req.query.q.trim():'';
  if(q.length<2||q.length>100||/[\x00-\x1f]/.test(q))return res.status(400).json({error:'Enter a town, city or postcode.'});
  const url=process.env.CONSTRUCT360_SUPABASE_URL,key=process.env.CONSTRUCT360_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return res.status(503).json({error:'Weather authentication is not configured.'});
  try{
    const headers={apikey:key,Authorization:authorization};
    const userResponse=await fetch(url+'/auth/v1/user',{headers,signal:AbortSignal.timeout(8000)});
    if(!userResponse.ok)return res.status(userResponse.status>=500?503:401).json({error:'Could not verify your session. Please sign in again.'});
    const user=await userResponse.json();
    const access=await fetch(url+'/rest/v1/rpc/operations_member_org',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
    if(!access.ok||!(await access.json()))return res.status(403).json({error:'Active company access is required.'});
    if(!process.env.WEATHER_API_KEY)return res.status(503).json({error:'Weather setup required: add WEATHER_API_KEY to Vercel and redeploy.',setupRequired:true});
    const now=Date.now(),window=requests.get(user.id)||{start:now,count:0};
    if(now-window.start>60000){window.start=now;window.count=0}window.count++;requests.set(user.id,window);
    if(requests.size>1000)for(const [id,w] of requests)if(now-w.start>60000)requests.delete(id);
    if(window.count>20){res.setHeader('Retry-After','60');return res.status(429).json({error:'Too many weather requests. Try again in a minute.'})}
    const cacheKey=q.toLowerCase(),stored=cache.get(cacheKey);if(stored&&now-stored.saved<600000)return res.status(200).json(stored.data);
    const endpoint=new URL('https://api.weatherapi.com/v1/current.json');endpoint.searchParams.set('key',process.env.WEATHER_API_KEY);endpoint.searchParams.set('q',q);endpoint.searchParams.set('aqi','no');
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(8000)}),body=await response.json();
    if(!response.ok){const missing=body.error?.code===1006;return res.status(missing?404:503).json({error:missing?'Location not found. Try a nearby town or a full postcode.':'Weather is temporarily unavailable. Please try again later.'})}
    const c=body.current,l=body.location;if(!c||!l||!Number.isFinite(c.temp_c))throw new Error('Invalid weather response');
    const data={location:{name:l.name,region:l.region,country:l.country},current:{temperature:c.temp_c,feelsLike:c.feelslike_c,condition:c.condition?.text||'',wind:c.wind_mph,gust:c.gust_mph,humidity:c.humidity,precipitation:c.precip_mm,updated:c.last_updated,updatedEpoch:c.last_updated_epoch},fetchedAt:now};
    if(cache.size>=250)cache.delete(cache.keys().next().value);cache.set(cacheKey,{data,saved:now});return res.status(200).json(data);
  }catch{return res.status(503).json({error:'Weather could not be loaded. Check your connection and try again.'})}
}

let weatherTimer,weatherController,weatherContext='',weatherGeneration=0,weatherLoadedAt=0;
function stopWeather(){clearInterval(weatherTimer);weatherTimer=null;weatherController?.abort();weatherGeneration++;weatherContext='';weatherLoadedAt=0;document.getElementById('weatherPanel')?.replaceChildren()}
function renderWeatherPanel(){
  const panel=$('weatherPanel'),visible=currentPage==='overview'&&isManager();panel.hidden=!visible;
  if(!visible){if(weatherContext)stopWeather();return}
  const context=c360Access.membership.organisation_id+':'+c360Access.user.id;if(weatherContext===context)return;
  stopWeather();weatherContext=context;let saved='';try{saved=localStorage.getItem('c360-weather:'+context)||''}catch{}
  panel.innerHTML=`<div class="weather-heading"><div><p class="eyebrow">LOCAL CONDITIONS</p><h2>Weather</h2></div><span class="weather-tag">Updates every 10 minutes</span></div><form id="weatherLocationForm" class="weather-search"><label for="weatherLocation">Town, city or postcode<input id="weatherLocation" maxlength="100" minlength="2" required placeholder="e.g. Glasgow or SW1A 1AA" value="${esc(saved)}"></label><button>Show weather</button></form><div id="weatherResult" role="status" aria-live="polite"><p>Choose a location to see current conditions.</p></div><p class="weather-disclaimer">For general information only. Conditions and forecasts are uncertain and may differ at your site. Do not rely on this panel alone for scaffolding, work-at-height or other safety decisions. Check official Met Office warnings and site conditions.</p><a class="weather-credit" href="https://www.weatherapi.com/" target="_blank" rel="noopener noreferrer">Powered by WeatherAPI.com</a>`;
  $('weatherLocationForm').onsubmit=e=>{e.preventDefault();loadWeather()};
  weatherTimer=setInterval(()=>{if(!document.hidden&&Date.now()-weatherLoadedAt>=600000&&$('weatherLocation')?.value.trim())loadWeather()},60000);
  if(saved)loadWeather();
}
async function loadWeather(){
  const q=$('weatherLocation')?.value.trim();if(!q||q.length<2)return;
  weatherController?.abort();weatherController=new AbortController();const controller=weatherController,generation=++weatherGeneration,context=weatherContext;
  const result=$('weatherResult'),button=$('weatherLocationForm').querySelector('button');button.disabled=true;result.textContent='Loading weather…';
  try{
    const {data,error}=await authClient().auth.getSession();if(error||!data.session?.access_token)throw new Error('Sign in to view weather.');
    const response=await fetch('/api/weather?q='+encodeURIComponent(q),{headers:{Authorization:'Bearer '+data.session.access_token},signal:controller.signal});const body=await response.json();
    if(generation!==weatherGeneration)return;if(!response.ok)throw new Error(body.error||'Weather unavailable.');
    const c=body.current,l=body.location,stale=Date.now()/1000-c.updatedEpoch>3600;
    result.innerHTML=`<div class="weather-reading"><div><h3>${esc(l.name)}</h3><p>${esc([l.region,l.country].filter(Boolean).join(', '))}</p><strong class="weather-temperature">${esc(c.temperature)}°C</strong><p>${esc(c.condition)} · Feels like ${esc(c.feelsLike)}°C</p></div><dl><div><dt>Wind</dt><dd>${esc(c.wind)} mph</dd></div><div><dt>Gusts</dt><dd>${esc(c.gust)} mph</dd></div><div><dt>Humidity</dt><dd>${esc(c.humidity)}%</dd></div><div><dt>Precipitation</dt><dd>${esc(c.precipitation)} mm</dd></div></dl></div><p class="hint">Provider updated: ${esc(c.updated)} (location time).${stale?' Older reading — refresh later and check official reports.':''}</p>`;
    weatherLoadedAt=Date.now();try{localStorage.setItem('c360-weather:'+context,q)}catch{}
  }catch(e){if(generation!==weatherGeneration||e.name==='AbortError')return;result.textContent=e.message;weatherLoadedAt=Date.now()}
  finally{if(generation===weatherGeneration)button.disabled=false}
}

let weatherTimer,weatherController,weatherContext='',weatherGeneration=0,weatherLoadedAt=0,weatherSelectedLocation='';
function stopWeather(){clearInterval(weatherTimer);weatherTimer=null;weatherController?.abort();weatherGeneration++;weatherContext='';weatherLoadedAt=0;weatherSelectedLocation='';document.getElementById('weatherPanel')?.replaceChildren()}
function renderWeatherPanel(){
  const panel=$('weatherPanel'),visible=currentPage==='overview'&&isManager();panel.hidden=!visible;
  if(!visible){if(weatherContext)stopWeather();return}
  const context=c360Access.membership.organisation_id+':'+c360Access.user.id;if(weatherContext===context)return;
  stopWeather();weatherContext=context;let saved='';try{saved=localStorage.getItem('c360-weather:'+context)||''}catch{}
  panel.innerHTML=`<div class="weather-heading"><h2>Weather</h2><button type="button" id="weatherChange" class="text-button" aria-controls="weatherLocationForm" aria-expanded="true">Change location</button></div><form id="weatherLocationForm" class="weather-search"><label for="weatherLocation">Town, city or postcode<input id="weatherLocation" maxlength="100" minlength="2" required placeholder="e.g. Glasgow" value="${esc(saved)}"></label><button type="submit">Show weather</button></form><div id="weatherResult" role="status" aria-live="polite"><p class="weather-empty">Choose a location for current conditions.</p></div><div class="weather-footer"><span>Indicative only — check site conditions.</span><a class="weather-credit" href="https://www.weatherapi.com/" target="_blank" rel="noopener noreferrer">WeatherAPI.com ↗</a></div>`;
  $('weatherChange').onclick=()=>{const form=$('weatherLocationForm');form.hidden=!form.hidden;$('weatherChange').setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)$('weatherLocation').focus()};
  $('weatherLocationForm').onsubmit=e=>{e.preventDefault();loadWeather()};
  weatherTimer=setInterval(()=>{if(!document.hidden&&Date.now()-weatherLoadedAt>=600000&&weatherSelectedLocation)loadWeather(weatherSelectedLocation)},60000);
  if(saved){weatherSelectedLocation=saved;$('weatherLocationForm').hidden=true;$('weatherChange').setAttribute('aria-expanded','false');loadWeather(saved)}
}
async function loadWeather(location){
  const q=location||$('weatherLocation')?.value.trim();if(!q||q.length<2)return;
  weatherController?.abort();weatherController=new AbortController();const controller=weatherController,generation=++weatherGeneration,context=weatherContext;
  const result=$('weatherResult'),button=$('weatherLocationForm').querySelector('button');button.disabled=true;result.textContent='Loading weather…';
  try{
    const {data,error}=await authClient().auth.getSession();if(error||!data.session?.access_token)throw new Error('Sign in to view weather.');
    const response=await fetch('/api/weather?q='+encodeURIComponent(q),{headers:{Authorization:'Bearer '+data.session.access_token},signal:controller.signal});const body=await response.json();
    if(generation!==weatherGeneration)return;if(!response.ok)throw new Error(body.error||'Weather unavailable.');
    const c=body.current,l=body.location,stale=Date.now()/1000-c.updatedEpoch>3600;
    result.innerHTML=`<div class="weather-reading"><strong class="weather-temperature">${esc(c.temperature)}°C</strong><div class="weather-place"><h3>${esc(l.name)}</h3><p>${esc(c.condition)}</p><p>Feels like ${esc(c.feelsLike)}°C</p></div></div><div class="weather-wind"><span>Wind <b>${esc(c.wind)} mph</b></span><span>Gusts <b>${esc(c.gust)} mph</b></span></div>${stale?'<p class="weather-stale">Older reading — check official reports.</p>':''}<details class="weather-details"><summary>More details</summary><p>${esc([l.region,l.country].filter(Boolean).join(', '))}</p><p>Humidity: ${esc(c.humidity)}% · Precipitation: ${esc(c.precipitation)} mm</p><p>Provider updated: ${esc(c.updated)} (location time). Refreshes every 10 minutes.</p><p>Conditions may differ at your site. Do not rely on this widget alone for scaffolding, work-at-height or other safety decisions. Check official Met Office warnings and site conditions.</p></details>`;
    if(!location){$('weatherLocationForm').hidden=true;$('weatherChange').setAttribute('aria-expanded','false');$('weatherChange').focus()}
    weatherSelectedLocation=q;weatherLoadedAt=Date.now();try{localStorage.setItem('c360-weather:'+context,q)}catch{}
  }catch(e){if(generation!==weatherGeneration||e.name==='AbortError')return;result.textContent=e.message;weatherLoadedAt=Date.now()}
  finally{if(generation===weatherGeneration)button.disabled=false}
}

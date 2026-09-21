/* v20: server-filtered notifications. No notifications or recipients in local storage. */
let dashboardFeed=null,dashboardFleet=null,dashboardBusy=false,dashboardGeneration=0,dashboardTimer,dashboardError='';
function clearDashboard(){dashboardGeneration++;dashboardFeed=null;dashboardFleet=null;dashboardBusy=false;dashboardError='';clearInterval(dashboardTimer);dashboardTimer=null}
function jobAssignmentFields(job){
 const selected=job.staff_ids||[],staff=(workspaceData.staff||[]).filter(s=>s.is_active&&!s.archived||selected.includes(s.id)||s.id===job.supervisor_staff_id);
 const label=s=>s.full_name+(!s.user_id?' (no login — cannot receive notifications)':'')+(s.archived||!s.is_active?' (inactive)':'');
 return `<div class="field full"><label for="jobSupervisor">Job supervisor</label><select id="jobSupervisor" name="supervisor_staff_id"><option value="">Unassigned</option>${staff.map(s=>`<option value="${esc(s.id)}" ${s.id===job.supervisor_staff_id?'selected':''}>${esc(label(s))}</option>`).join('')}</select><p class="hint">Responsible person for this job. Receives shared job updates when linked to an active login. This does not change their account role or permissions.</p></div><fieldset class="field full job-people"><legend>Assigned individuals</legend><div class="crew-picker">${staff.map(s=>`<label class="check-label"><input type="checkbox" name="staff_ids" value="${esc(s.id)}" ${selected.includes(s.id)?'checked':''}><span>${esc(label(s))}</span></label>`).join('')||'<p>Add staff members first.</p>'}</div><p class="hint">Ongoing job assignments, separate from dated tasks in Planner. All staff can still view live site details and RAMS.</p></fieldset>`;
}
async function loadDashboard(older=false){
 if(dashboardBusy)return;dashboardBusy=true;const generation=dashboardGeneration,org=c360Access?.membership?.organisation_id;
 try{
  const before=older?dashboardFeed?.items.at(-1)?.id:null;
  const [feed,fleet]=await Promise.all([rpc('notifications_snapshot',{p_before:before||null,p_limit:25}),dashboardFleet?Promise.resolve(dashboardFleet):rpc('vehicles_snapshot')]);
  if(generation!==dashboardGeneration)return;
  if(feed.organisation_id!==org||fleet.organisation_id!==org)throw new Error('Company check failed.');
  if(older&&dashboardFeed)feed.items=[...dashboardFeed.items,...feed.items].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i);
  dashboardFeed=feed;dashboardFleet=fleet;dashboardError='';
 }catch(error){if(generation===dashboardGeneration)dashboardError=friendlyError(error)}
 finally{if(generation===dashboardGeneration){dashboardBusy=false;if(currentPage==='dashboard'&&!recordView&&!readPanel)renderDashboard()}}
}
function dashboardJobCard(j){return `<article class="dashboard-job"><div><span class="eyebrow">${esc(j.code)}</span><h3>${esc(j.site)}</h3><p>${esc(j.site_address||'Site address not added')}</p><span class="badge">${esc(j.status)}</span>${j.assigned_to_me?'<span class="badge">Assigned to you</span>':''}</div><div class="actions"><button type="button" class="secondary" data-view="job" data-id="${esc(j.id)}">View job</button><button type="button" class="text-button" data-job-files="${esc(j.id)}">RAMS &amp; files</button></div></article>`}
function renderDashboard(){
 document.querySelectorAll('[data-page]').forEach(b=>{const active=b.dataset.page==='dashboard';b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
 $('pageTitle').textContent='Dashboard';$('pageSubtitle').textContent=isManager()?'Company updates and the work that needs your attention.':'Your updates, assigned vehicles and live jobs.';
 $('filters').hidden=true;$('operationsToolbar').hidden=true;$('transferButton').hidden=true;$('addButton').hidden=true;
 $('overviewSummary').hidden=false;$('stats').hidden=false;
 const jobs=workspaceData.jobs||[],live=jobs.filter(j=>j.is_live),open=jobs.filter(j=>!j.archived&&!CLOSED_STATUSES.has(j.status));
 $('stats').innerHTML=`<div class="stat"><span>Open jobs</span><strong>${open.length}</strong><small>${live.length} live on site</small><button type="button" class="text-button" data-dashboard-page="jobs">View jobs →</button></div>`;
 renderWeatherPanel();
 const feed=dashboardFeed,mine=(dashboardFleet?.vehicles||[]).filter(v=>v.assigned_to_me&&!v.archived),myJobs=jobs.filter(j=>j.assigned_to_me&&!j.archived&&!CLOSED_STATUSES.has(j.status));
 const displayed=[...myJobs,...live.filter(j=>!myJobs.some(m=>m.id===j.id))].slice(0,6);
 $('records').innerHTML=`<div class="dashboard-grid"><section class="dashboard-panel notifications-panel" aria-label="Notifications"><div class="dashboard-section-heading"><div><p class="eyebrow">${isManager()?'COMPANY FEED':'YOUR FEED'}</p><h2>Notifications <span class="unread-count">${feed?.unread_count||0} unread</span></h2></div><button type="button" class="text-button" data-notifications="refresh" ${dashboardBusy?'disabled':''}>Refresh feed</button></div><p class="hint">${isManager()?'All company notifications. Read status is personal to you.':'Updates relevant to your assignments and records. Office-only changes are excluded.'}</p>${dashboardError?`<div class="notice" role="alert">${esc(dashboardError)}</div>`:''}${feed?.unread_count?'<button type="button" class="secondary" data-notifications="read-all">Mark all as read</button>':''}<div class="notification-list">${feed?feed.items.map(n=>`<article class="notification ${n.read_at?'is-read':'is-unread'}"><div class="notification-dot" aria-label="${n.read_at?'Read':'Unread'}"></div><div><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><small>${esc(vehicleTime(n.created_at))}${n.office_only?' · Office only':''}</small><div class="actions"><button type="button" class="text-button" data-notification-open="${esc(n.id)}">View ${esc({job:'job',vehicle:'vehicle',timesheets:'timesheets',planner:'Planner',staff:'leave'}[n.entity_kind])}</button>${!n.read_at?`<button type="button" class="text-button" data-notification-read="${esc(n.id)}">Mark as read</button>`:''}</div></div></article>`).join('')||'<div class="dashboard-empty">You’re all caught up. New updates will appear here as people use the workspace.</div>':`<div class="dashboard-empty" role="status">${dashboardError?'Feed unavailable. Use Refresh feed to retry.':'Loading your notifications…'}</div>`}</div>${feed?.has_more?`<button type="button" class="secondary" data-notifications="older" ${dashboardBusy?'disabled':''}>Load older notifications</button>`:''}<p class="hint">In-app updates · refreshes every minute while this page is visible.</p></section><div class="dashboard-side"><section class="dashboard-panel"><div class="dashboard-section-heading"><h2>Your vehicles</h2><button type="button" class="text-button" data-dashboard-page="vehicles">All vehicles →</button></div>${mine.map(v=>`<article class="dashboard-vehicle"><span class="vehicle-reg">${esc(v.registration)}</span><h3>${esc(v.name)}</h3><p class="${v.open_defects?'vehicle-danger':'hint'}">${esc(vehicleSafety(v))}</p><p class="hint">${v.last_inspection_at?'Last check: '+esc(vehicleTime(v.last_inspection_at)):'No inspection recorded yet'}</p><button type="button" data-dashboard-inspect="${esc(v.id)}">Start inspection</button></article>`).join('')||'<p class="hint">No vehicle assigned to you. You can still inspect any current company vehicle.</p>'}</section><section class="dashboard-panel"><div class="dashboard-section-heading"><h2>Your jobs &amp; live sites</h2><button type="button" class="text-button" data-dashboard-page="jobs">All jobs →</button></div>${displayed.map(dashboardJobCard).join('')||'<p class="hint">No assigned or live jobs yet.</p>'}</section></div></div>`;
 if(feed?.items.length>25)$('records').querySelector('.notifications-panel').lastElementChild.textContent='Showing older updates. Use Refresh feed to return to the newest notifications and resume automatic refresh.';
 if(!dashboardFeed&&!dashboardBusy&&!dashboardError)loadDashboard();
 if(!dashboardTimer)dashboardTimer=setInterval(()=>{if(!document.hidden&&currentPage==='dashboard'&&!recordView&&!readPanel&&!dashboardBusy&&(!dashboardFeed||dashboardFeed.items.length<=25))loadDashboard()},60000);
}
async function readNotification(id,all=false){
 const generation=dashboardGeneration;await rpc('notifications_mark_read',{p_id:id,p_all:all});if(generation!==dashboardGeneration)return false;
 if(dashboardFeed){const wasUnread=dashboardFeed.items.some(n=>n.id===id&&!n.read_at);dashboardFeed.items.forEach(n=>{if(all||n.id===id)n.read_at=new Date().toISOString()});dashboardFeed.unread_count=all?0:Math.max(0,dashboardFeed.unread_count-(wasUnread?1:0))}
 return true;
}
function initialiseDashboard(){
 document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-notifications],[data-notification-read],[data-notification-open],[data-dashboard-page],[data-dashboard-inspect]');if(!b)return;
  try{
   if(b.dataset.dashboardPage){setPage(b.dataset.dashboardPage);return}
   if(b.dataset.dashboardInspect){vehicleData=dashboardFleet;setPage('vehicles');openVehicleInspection(b.dataset.dashboardInspect);return}
   b.disabled=true;
   if(b.dataset.notifications==='older')await loadDashboard(true);
   else if(b.dataset.notifications==='refresh'){dashboardFleet=null;await loadDashboard()}
   else if(b.dataset.notifications==='read-all'){if(await readNotification(dashboardFeed.latest_id,true))renderDashboard()}
   else if(b.dataset.notificationRead){if(await readNotification(b.dataset.notificationRead))renderDashboard()}
   else if(b.dataset.notificationOpen){
    const n=dashboardFeed?.items.find(n=>n.id===b.dataset.notificationOpen);if(!n)return;
    if(!n.read_at&&!await readNotification(n.id))return;
    if(n.entity_kind==='job'){await loadWorkspace();openRecordView('job',n.entity_id)}
    else if(n.entity_kind==='vehicle'){vehicleData=null;await loadVehicles();setPage('vehicles');if(vehicleBy(n.entity_id))openVehicleHistory(n.entity_id)}
    else if(n.entity_kind==='staff'&&isManager()){await loadWorkspace();openRecordView('staff',n.entity_id)}
    else setPage(n.entity_kind==='staff'?'planner':n.entity_kind);
   }
  }catch(error){toast(friendlyError(error))}finally{if(b.isConnected)b.disabled=false}
 });
}

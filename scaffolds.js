/* One scaffold/inspection core. Future physical tags reference stable scaffold IDs. */
const SCAFFOLD_CHECKS={foundations:'Foundations, base plates and sole boards',standards:'Standards, ledgers, transoms and connections',bracing:'Bracing and stability',ties:'Ties, anchors and structural support',platforms:'Platforms, boards and working areas',edge_protection:'Guard rails, toe boards and fall protection',access:'Safe access and egress',loading:'Loading bays, duty rating and loading',design:'Design / configuration and alterations',surroundings:'Surroundings, weather and public protection'};
let scaffoldData=null,scaffoldGeneration=0,scaffoldLoading=false,scaffoldBusy=false,scaffoldEdit=null,scaffoldRequest=null,scaffoldJob='all',scaffoldFilter='active',scaffoldReports=[];
function clearScaffolds(){scaffoldGeneration++;scaffoldData=null;scaffoldLoading=false;scaffoldEdit=null;scaffoldRequest=null;scaffoldReports=[];$('scaffoldDialog').close()}
function scaffoldState(s,now=Date.now()){
 if(s.dismantled)return {key:'dismantled',label:'Dismantled',severity:5};
 if(s.latest_report?.outcome==='unsafe')return {key:'unsafe',label:'Do not use',severity:0};
 if(s.inspection_required||!s.latest_report)return {key:'required',label:s.latest_report?'Inspection required':'Initial inspection required',severity:1};
 const due=new Date(s.next_due).getTime();
 if(due<=now)return {key:'overdue',label:'Overdue — do not use until inspected',severity:2};
 if(due-now<=86400000)return {key:'soon',label:'Due within 24 hours',severity:3};
 return {key:'current',label:'Within seven-day interval',severity:4};
}
function scaffoldNow(){return Date.now()+(scaffoldData?new Date(scaffoldData.server_now).getTime()-scaffoldData.received_at:0)}
async function loadScaffolds(){
 if(scaffoldLoading)return;scaffoldLoading=true;const generation=scaffoldGeneration,org=c360Access.membership.organisation_id;
 try{const data=await rpc('scaffold_snapshot');if(generation!==scaffoldGeneration)return;if(data.organisation_id!==org)throw new Error('Company check failed.');scaffoldData={...data,received_at:Date.now()};if(currentPage==='inspections')renderScaffolds()}
 catch(e){if(generation===scaffoldGeneration)$('records').innerHTML='<div class="empty">'+esc(friendlyError(e))+'</div>'}
 finally{if(generation===scaffoldGeneration)scaffoldLoading=false}
}
function scaffoldButton(action,label,id='',primary=false){return `<button type="button" class="${primary?'':'secondary'}" data-scaffold="${action}" data-id="${esc(id)}">${esc(label)}</button>`}
function renderScaffolds(){
 $('pageTitle').textContent='Inspections';$('pageSubtitle').textContent='Every job. Every scaffold. One clear inspection schedule.';
 $('addButton').hidden=true;$('filters').hidden=true;$('operationsToolbar').hidden=false;
 document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page==='inspections');b.setAttribute('aria-current',b.dataset.page==='inspections'?'page':'false')});
 if(!scaffoldData){$('records').innerHTML='<div class="empty">Loading scaffold inspections…</div>';loadScaffolds();return}
 const data=scaffoldData,now=scaffoldNow(),active=data.scaffolds.filter(s=>!s.dismantled);
 $('operationsToolbar').innerHTML=`<div class="scaffold-toolbar"><label>Job<select id="scaffoldJobFilter"><option value="all">All jobs</option>${data.jobs.map(j=>`<option value="${j.id}" ${j.id===scaffoldJob?'selected':''}>${esc(j.code+' · '+j.site)}${j.archived?' (archived job)':''}</option>`).join('')}</select></label><label>Show<select id="scaffoldStatusFilter">${[['active','Active scaffolds'],['attention','Needs attention'],['soon','Due within 24 hours'],['dismantled','Dismantled'],['all','All records']].map(([value,label])=>`<option value="${value}" ${value===scaffoldFilter?'selected':''}>${label}</option>`).join('')}</select></label>${data.can_manage?scaffoldButton('new','+ Register scaffold','',true):''}</div>`;
 $('scaffoldJobFilter').onchange=e=>{scaffoldJob=e.target.value;renderScaffolds()};$('scaffoldStatusFilter').onchange=e=>{scaffoldFilter=e.target.value;renderScaffolds()};
 const warningCount=active.filter(s=>s.latest_report?.qualification_status==='not_verified').length;
 const visible=data.scaffolds.filter(s=>(scaffoldJob==='all'||s.job_id===scaffoldJob)&&(scaffoldFilter==='all'||scaffoldFilter==='dismantled'?scaffoldFilter==='all'||s.dismantled:!s.dismantled&&(scaffoldFilter==='active'||scaffoldFilter==='attention'&&scaffoldState(s,now).severity<=2||scaffoldFilter==='soon'&&scaffoldState(s,now).key==='soon'))).sort((a,b)=>scaffoldState(a,now).severity-scaffoldState(b,now).severity||String(a.next_due||'').localeCompare(String(b.next_due||'')));
 $('records').innerHTML=`<div class="vehicle-summary"><div><strong>${active.filter(s=>scaffoldState(s,now).severity<=2).length}</strong><span>Inspection required / overdue</span></div><div><strong>${active.filter(s=>scaffoldState(s,now).key==='soon').length}</strong><span>Due within 24 hours</span></div><div><strong>${active.length}</strong><span>Active scaffolds</span></div></div><div class="notice"><strong>Qualification checks are not configured.</strong> Everyone can submit reports, but qualifications are not automatically verified. ${data.can_manage&&warningCount?`<strong>${warningCount} latest inspection report(s) require office qualification review.</strong>`:''} App access and a current due date do not establish competence or authorise use.</div><p class="hint">Inspect before first use, at intervals no longer than seven days and after events likely to affect safety. Use “Require inspection” after alteration, adverse weather or damage. This schedule is not a substitute for checking current site conditions.</p>${data.received_at+300000<Date.now()?'<div class="notice">This view is over five minutes old. Refresh before relying on its status.</div>':''}${visible.length?data.jobs.filter(j=>visible.some(s=>s.job_id===j.id)).map(j=>`<section class="scaffold-job"><h2>${esc(j.code+' · '+j.site)}${j.archived?' (archived job)':''}</h2><div class="scaffold-grid">${visible.filter(s=>s.job_id===j.id).map(s=>scaffoldCard(s,now)).join('')}</div></section>`).join(''):'<div class="empty"><h3>No scaffolds in this view</h3><p>Office users can register each erected scaffold against its job. Each scaffold gets its own inspection history and due date.</p></div>'}`;
}
function scaffoldCard(s,now){
 const state=scaffoldState(s,now);
 return `<article class="scaffold-card"><span class="badge scaffold-${state.key}">${esc(state.label)}</span><h3>${esc(s.reference)}</h3><p>${esc(s.location)}</p><details><summary>Scaffold description</summary><p class="preserve-lines">${esc(s.description)}</p></details>${s.inspection_required&&!s.dismantled?`<p class="warning-text">${esc(s.required_reason)}</p>`:''}<dl><dt>Last inspected</dt><dd>${s.latest_report?esc(vehicleTime(s.latest_report.inspected_at)):'Not yet inspected'}</dd><dt>Next inspection deadline</dt><dd>${s.dismantled?'Not applicable':s.next_due?esc(vehicleTime(s.next_due)):'Before first use'}</dd></dl>${s.latest_report?`<p class="qualification-warning">Qualifications not verified — office review required</p>`:''}<div class="actions">${!s.dismantled?scaffoldButton('inspect','Carry out inspection',s.id,true)+scaffoldButton('flag','Require inspection',s.id):''}${scaffoldButton('history','Reports & history',s.id)}${scaffoldData.can_manage&&!s.dismantled?scaffoldButton('dismantle','Mark dismantled',s.id):''}</div></article>`;
}
function scaffoldField(label,name,value='',multiline=false,max=2000){return `<label>${esc(label)}${multiline?`<textarea name="${name}" maxlength="${max}" required rows="3">${esc(value)}</textarea>`:`<input name="${name}" maxlength="${max}" value="${esc(value)}" required>`}</label>`}
function openScaffoldForm(action,id){
 if(scaffoldBusy)return;const s=scaffoldData?.scaffolds.find(s=>s.id===id);if(action!=='new'&&!s)return;
 scaffoldEdit={action:action==='new'?'scaffold':action,scaffold:s};scaffoldRequest=null;scaffoldReports=[];
 $('scaffoldError').hidden=true;$('scaffoldSave').hidden=false;$('scaffoldSave').textContent=action==='inspect'?'Submit inspection report':'Save';
 $('scaffoldTitle').textContent={new:'Register scaffold',inspect:'Scaffold inspection',flag:'Require another inspection',dismantle:'Confirm dismantling'}[action]||'Scaffold';
 const date=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,19);
 $('scaffoldFields').innerHTML=action==='new'?`<p>Register each scaffold separately. The first inspection is required before use.</p><label>Job<select name="job_id" required>${scaffoldData.jobs.filter(j=>!j.archived).map(j=>`<option value="${j.id}" ${j.id===scaffoldJob?'selected':''}>${esc(j.code+' · '+j.site)}</option>`).join('')}</select></label>${scaffoldField('Scaffold reference / name','reference','',false,100)}${scaffoldField('Exact location on site','location','',true,1000)}${scaffoldField('Scaffold description / design reference','description','',true,3000)}<label>Erected on<input type="date" name="erected_on" value="${timesheetToday()}" max="${timesheetToday()}" required></label>`:
 action==='flag'?`<h3>${esc(s.reference)}</h3>${scaffoldField('What happened? Include any immediate safety action taken.','reason','',true)}<p class="notice">The scaffold will be marked Inspection required. Notify site personnel and control access as necessary; this app does not alert people who are offline.</p>`:
 action==='dismantle'?`<h3>${esc(s.reference)}</h3><p>This stops future inspection deadlines but retains all reports. Do not use this to hide an overdue scaffold.</p><label class="check-label"><input name="confirmed" type="checkbox" required><span>I confirm this scaffold has been physically dismantled.</span></label>`:
 `<h3>${esc(s.reference)} · ${esc(s.location)}</h3><div class="notice"><strong>Qualifications not verified — office review required.</strong> You must be competent for this type and complexity of scaffold. Submission does not verify competence.</div><label>Inspection date and time (your device’s local time)<input type="datetime-local" step="1" name="inspected_at" value="${date}" max="${date}" required></label><label>Reason<select name="reason"><option value="initial">Initial / before first use</option><option value="weekly" ${s.latest_report?'selected':''}>Seven-day inspection</option><option value="alteration">After alteration</option><option value="weather">After adverse weather</option><option value="other">Other event / reinspection</option></select></label>${scaffoldField('Name and address of person / organisation inspected for','inspection_for','',true)}${scaffoldField('Your position','inspector_position','',false,160)}<h3>Inspection checks</h3><p class="hint">These are recording prompts, not a complete site-specific inspection method. Record additional matters below. A failed check requires a Do not use outcome.</p><div class="scaffold-checklist">${Object.entries(SCAFFOLD_CHECKS).map(([key,label])=>`<label>${esc(label)}<select name="check_${key}" required><option value="">Choose…</option><option value="pass">Satisfactory</option><option value="fail">Defect / unsatisfactory</option><option value="na">Not applicable</option></select></label>`).join('')}</div>${scaffoldField('Defects / matters that could create a safety risk (enter None if none)','findings','',true,5000)}${scaffoldField('Action already taken, including any immediate notifications (enter None if none)','action_taken','',true,5000)}${scaffoldField('Further action required (enter None if none)','further_action','',true,5000)}<label>Inspection outcome<select name="outcome" required><option value="">Choose…</option><option value="safe">Satisfactory at time of inspection (reported)</option><option value="unsafe">Do not use — unsafe / action required</option></select></label><label class="check-label"><input name="confirmed" type="checkbox" required><span>I am competent for this scaffold and have completed this inspection. This report is accurate and will be retained as a read-only record. Qualifications will be flagged as unverified.</span></label><p class="hint">Reports must be provided to the responsible person; downloading a report does not send it automatically. Use job Images for progress photos.</p>`;
 if(!$('scaffoldDialog').open)$('scaffoldDialog').showModal();
}
async function saveScaffoldForm(event){
 event.preventDefault();if(scaffoldBusy)return;const form=new FormData($('scaffoldForm')),data=Object.fromEntries(form),state=scaffoldEdit;
 const generation=scaffoldGeneration;
 data.confirmed=form.get('confirmed')==='on';if(state.scaffold){data.id=state.scaffold.id;data.version=state.scaffold.version}
 if(state.action==='inspect'){data.inspected_at=new Date(data.inspected_at).toISOString();data.checks={};for(const key of Object.keys(SCAFFOLD_CHECKS)){data.checks[key]=data['check_'+key];delete data['check_'+key]}}
 const fingerprint=JSON.stringify({action:state.action,data});if(scaffoldRequest?.fingerprint!==fingerprint)scaffoldRequest={fingerprint,id:crypto.randomUUID()};
 scaffoldBusy=true;$('scaffoldDialog').querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=true);$('scaffoldError').hidden=true;
 try{await rpc('scaffold_save',{p_action:state.action,p_data:data,p_request_id:scaffoldRequest.id});if(generation!==scaffoldGeneration)return;$('scaffoldDialog').close();scaffoldRequest=null;scaffoldData=null;toast(state.action==='inspect'?'Inspection recorded. Qualifications not verified — office review required.':'Scaffold updated.');await loadScaffolds();loadScaffoldReviewAlerts()}
 catch(e){if(generation===scaffoldGeneration)showError($('scaffoldError'),e)}
 finally{scaffoldBusy=false;$('scaffoldDialog').querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=false)}
}
async function openScaffoldHistory(id){
 const s=scaffoldData.scaffolds.find(s=>s.id===id);if(!s)return;const generation=++scaffoldGeneration,org=c360Access.membership.organisation_id;
 scaffoldEdit=null;$('scaffoldTitle').textContent=s.reference+' · Reports & history';$('scaffoldFields').innerHTML='Loading reports…';$('scaffoldError').hidden=true;$('scaffoldSave').hidden=true;$('scaffoldDialog').showModal();
 try{const data=await rpc('scaffold_history',{p_id:id});if(generation!==scaffoldGeneration)return;if(data.organisation_id!==org)throw new Error('Company check failed.');scaffoldReports=data.reports;
 $('scaffoldFields').innerHTML=`<p class="hint">Submitted reports are retained read-only. Corrections require a new inspection; previous reports remain in history.</p>${data.reports.map(r=>`<details class="inspection-history"><summary>${esc(vehicleTime(r.inspected_at))} · ${r.outcome==='unsafe'?'DO NOT USE':'Satisfactory (reported)'}</summary><p>Inspector: ${esc(r.inspector_name)} · ${esc(r.inspector_position)}</p><p class="qualification-warning">${esc(r.inspector_scope)}</p><p><strong>Inspected for:</strong> ${esc(r.inspection_for)}</p><p><strong>Findings:</strong> ${esc(r.findings)}</p><p><strong>Action taken:</strong> ${esc(r.action_taken)}</p><p><strong>Further action:</strong> ${esc(r.further_action)}</p><dl class="inspection-results">${Object.entries(SCAFFOLD_CHECKS).map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(r.checks[key])}</dd></div>`).join('')}</dl>${scaffoldButton('pdf','Download branded report',r.id)}</details>`).join('')||'<p>No inspection reports yet.</p>'}<h3>Activity</h3>${data.events.map(e=>`<p>${esc(vehicleTime(e.created_at))} · ${esc(e.action)}<br>${esc(e.note)}</p>`).join('')}`;
 }catch(e){if(generation===scaffoldGeneration)showError($('scaffoldError'),e)}
}
function initialiseScaffolds(){
 $('scaffoldForm').onsubmit=saveScaffoldForm;
 $('scaffoldClose').onclick=()=>{if(scaffoldBusy)return;if(scaffoldEdit&&!confirm('Close this form? Unsaved inspection details will be lost.'))return;scaffoldGeneration++;$('scaffoldDialog').close()};
 $('scaffoldDialog').addEventListener('cancel',e=>{e.preventDefault();$('scaffoldClose').click()});
 document.addEventListener('click',async event=>{
  const job=event.target.closest('[data-scaffold-job]');if(job){scaffoldJob=job.dataset.scaffoldJob;setPage('inspections');return}
  const button=event.target.closest('[data-scaffold]');if(!button||scaffoldBusy)return;
  const {scaffold:action,id}=button.dataset;
  if(action==='history'){openScaffoldHistory(id);return}
  if(action==='pdf'){const report=scaffoldReports.find(r=>r.id===id);if(!report)return;button.disabled=true;const generation=scaffoldGeneration;
   try{const fresh=await rpc('scaffold_history',{p_id:report.scaffold_id});if(generation!==scaffoldGeneration||fresh.organisation_id!==c360Access.membership.organisation_id)return;const saved=fresh.reports.find(r=>r.id===id);if(!saved)throw new Error('Report unavailable.');const blob=await buildScaffoldPdf(saved,c360Access.organisation.name);if(generation===scaffoldGeneration)downloadBlob(blob,'Construct360-inspection-'+id+'.pdf')}catch(e){showError($('scaffoldError'),e)}finally{button.disabled=false}return
  }
  openScaffoldForm(action,id);
 });
 setInterval(()=>{if(currentPage==='inspections'&&scaffoldData&&!scaffoldBusy)renderScaffolds()},60000);
}
async function loadScaffoldReviewAlerts(){
 const generation=loadGeneration,org=c360Access?.membership?.organisation_id;
 $('inspectionAlerts').hidden=true;if(!isManager())return;
 try{const data=await rpc('scaffold_review_alerts');if(generation!==loadGeneration||data.organisation_id!==org)return;
  if(data.unverified){$('inspectionAlerts').innerHTML=`<strong>${Number(data.unverified)} inspection report(s): qualifications not verified.</strong> Office review required. Qualification rules have not yet been configured. <button type="button" class="secondary" data-open-inspections>View inspections</button>`;$('inspectionAlerts').hidden=false;$('inspectionAlerts').querySelector('button').onclick=()=>setPage('inspections')}
 }catch(e){if(generation===loadGeneration){$('inspectionAlerts').textContent='Inspection qualification alerts could not load. Open Inspections or refresh to check.';$('inspectionAlerts').hidden=false}}
}

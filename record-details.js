/* v19 record pages. Personal data is only present in the office-authorised snapshot. */
let recordView=null,readPanel=null,detailGeneration=0,leaveEdit=null,leaveRequest=null,leaveBusy=false;
const RECORD_PAGES={staff:'staff',team:'teams',client:'clients',job:'jobs',booking:'planner'};
function viewButton(kind,id,label='View profile'){return `<button type="button" class="secondary" data-view="${kind}" data-id="${esc(id)}">${esc(label)}</button>`}
function detailFacts(items){return `<dl class="profile-facts">${items.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd class="preserve-lines">${esc(value??'Not added')}</dd></div>`).join('')}</dl>`}
function detailSection(title,content){return `<section class="profile-section"><h2>${esc(title)}</h2>${content}</section>`}
function detailChrome(title,subtitle){
 $('overviewSummary').hidden=true;$('weatherPanel').hidden=true;$('stats').hidden=true;$('filters').hidden=true;$('operationsToolbar').hidden=true;$('addButton').hidden=true;$('transferButton').hidden=true;
 $('pageTitle').textContent=title;$('pageSubtitle').textContent=subtitle;
 document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===currentPage);b.setAttribute('aria-current',b.dataset.page===currentPage?'page':'false')});
}
function closeReadPage(){
 if(!readPanel)return;const {dialog,host}=readPanel;while(host.firstChild)dialog.append(host.firstChild);host.remove();readPanel=null;
}
function clearRecordViews(){detailGeneration++;closeReadPage();recordView=null;clearStaffDocuments()}
function openRecordView(kind,id,historyEntry=true){
 if(!RECORD_PAGES[kind]||!isManager()&&!['job','booking'].includes(kind))return;
 closeReadPage();recordView={kind,id};currentPage=RECORD_PAGES[kind];
 if(historyEntry)history.pushState(null,'','#'+kind+'/'+id);render();$('pageTitle').tabIndex=-1;$('pageTitle').focus();window.scrollTo(0,0);
}
function restoreRecordRoute(){
 const [kind,id]=location.hash.slice(1).split('/');
 if(id&&RECORD_PAGES[kind]){recordView={kind,id};currentPage=RECORD_PAGES[kind]}
 else if(['overview','jobs','clients','staff','teams','planner','vehicles','timesheets','inspections','permissions'].includes(kind)){recordView=null;currentPage=kind}
}
// Existing read-only history/file widgets are mounted in the workspace, not overlays.
function showReadPage(dialogId,title){
 closeReadPage();recordView=null;detailGeneration++;clearStaffDocuments();
 const dialog=$(dialogId);dialog.close();const host=document.createElement('section');host.className='read-page';
 const back=document.createElement('button');back.type='button';back.className='secondary';back.dataset.detailBack='';back.textContent='← Back to '+currentPage;
 $('records').replaceChildren(back,host);while(dialog.firstChild)host.append(dialog.firstChild);
 readPanel={dialog,host};detailChrome(title,'Company record');window.scrollTo(0,0);
}
function prepareDetailEditor(dialogId){if(readPanel?.dialog.id===dialogId){closeReadPage();render()}}
function renderRecordView(){
 const {kind,id}=recordView;const generation=++detailGeneration;clearStaffDocuments();
 const rows={staff:workspaceData.staff,team:workspaceData.teams,client:workspaceData.clients,job:workspaceData.jobs,booking:workspaceData.bookings};
 const r=rows[kind]?.find(x=>x.id===id)||(kind==='job'?jobResourceData?.jobs.find(x=>x.id===id):null);
 detailChrome('Record','Company workspace');
 const back=`<button type="button" class="secondary" data-detail-back>← Back to ${esc(RECORD_PAGES[kind])}</button>`;
 if(!r&&kind==='job'&&!isManager()&&!jobResourceData){$('records').innerHTML=back+'<p>Loading job…</p>';loadJobResources().then(()=>{if(generation===detailGeneration&&recordView)renderRecordView()}).catch(e=>{if(generation===detailGeneration)$('records').innerHTML=back+'<p>'+esc(friendlyError(e))+'</p>'});return}
 if(!r||!isManager()&&!['job','booking'].includes(kind)){$('records').innerHTML=back+'<div class="empty">This record is unavailable or you do not have access.</div>';return}
 let body='',title=r.full_name||r.name||r.site||jobBy(r.job_id)?.site||'Task',subtitle='';
 const edit=isManager()?kind==='client'||kind==='job'?`<button type="button" data-action="edit" data-kind="${kind}" data-id="${esc(id)}">Edit ${kind}</button>`:operationButton('edit-'+kind,'Edit '+(kind==='booking'?'task':kind==='staff'?'profile':kind),id,false):'';
 if(kind==='staff'){
  subtitle=r.position||r.employment_role;
  body=`<section class="profile-hero"><div class="profile-cover"></div><div class="profile-identity"><div class="profile-avatar" id="profileAvatar" aria-label="Staff profile image">${esc(r.full_name.split(/\s+/).map(x=>x[0]).slice(0,2).join(''))}</div><div><p class="eyebrow">STAFF PROFILE</p><h2>${esc(r.full_name)}</h2><p>${esc(subtitle)}</p><span class="badge">${esc(staffStatus(r))}</span></div><div class="actions">${edit}<button type="button" class="secondary" data-staff-pdf="${esc(id)}">Download staff record</button></div></div></section><div class="profile-columns"><div>${detailSection('Contact & personal details',detailFacts([['Email',r.email||'Not added'],['Phone',r.phone||'Not added'],['Address',r.address||'Not added'],['Account',r.user_id?'Linked user account':'Staff profile — no login']]))}${detailSection('Office information',detailFacts([['Hourly rate',r.hourly_rate===null||r.hourly_rate===undefined?'Not set':'£'+Number(r.hourly_rate).toFixed(2)],['Availability',r.availability],['Private notes',r.notes||'No notes added'],['Profile created',r.created_at?vehicleTime(r.created_at):'Not recorded'],['Last updated',r.updated_at?vehicleTime(r.updated_at):'Not recorded']]))}</div><div>${detailSection('Qualifications & credentials',`<div class="profile-qualifications">${r.qualification&&r.qualification!=='None'?`<p>Previous qualification label: ${esc(r.qualification)}</p>`:''}${(r.qualifications||[]).map((q,i)=>`<article><h3>${esc(q.name)}</h3><p>${esc(q.reference||'No reference added')}</p><p class="${q.expires&&q.expires<timesheetToday()?'warning-text':'hint'}">${q.expires?'Expires '+esc(dateLabel(q.expires)):'No expiry recorded'}</p><div class="qualification-image-grid" id="profileQualification${i}"></div></article>`).join('')||'<p>No qualifications added yet.</p>'}</div>`)}${detailSection('Teams',`<div class="actions">${(workspaceData.teams||[]).filter(t=>teamCrew(t.id).includes(id)).map(t=>viewButton('team',t.id,t.name)).join('')||'<p>No team membership.</p>'}</div>`)}${detailSection('Annual leave',`<button type="button" data-leave-add="${esc(id)}">+ Add annual leave</button>${staffLeaveList(id)}`)}</div></div>`;
 }else if(kind==='client'){
  subtitle='Client '+r.code;
  body=detailSection('Client details',detailFacts([['Name',r.name],['Address',r.address||'Not added'],['Primary contact',r.contact||'Not added'],['Position / role',r.contact_role||'Not added'],['Email',r.email||'Not added'],['Phone',r.phone||'Not added'],['Notes',r.notes||'No notes'],['Record',r.archived?'Archived':'Current']]))+detailSection('Additional contacts',contactsFor(id).map(c=>`<article class="profile-contact"><h3>${esc(c.name)}</h3>${detailFacts([['Position / role',c.role||'Not added'],['Email',c.email||'Not added'],['Phone',c.phone||'Not added'],['Site',contactJobIds(c.id).map(job=>jobBy(job)?.site).filter(Boolean).join(', ')||'Not attached'],['Notes',c.notes||'No notes']])}</article>`).join('')||'<p>No additional contacts.</p>')+detailSection('Jobs',`<div class="record-list">${workspaceData.jobs.filter(j=>j.client_id===id).map(jobCard).join('')||'<p>No jobs yet.</p>'}</div>`);
 }else if(kind==='team'){
  subtitle='Company team';body=detailSection('Team details',detailFacts([['Supervisor',staffBy(r.supervisor_id)?.full_name||'Unavailable'],['Record',r.archived?'Archived':'Current'],['Private notes',r.notes||'No notes']]))+detailSection('Team members',`<div class="record-list">${teamCrew(id).map(staffBy).filter(Boolean).map(staffCard).join('')}</div>`)+`<div class="actions">${!r.archived?operationButton('book-team','Schedule task',id):''}</div>`;
 }else if(kind==='job'){
  subtitle='Job '+r.code;body=detailSection('Job details',detailFacts([['Site',r.site],...(r.status?[['Status',r.status],['Scaffold type',r.scaffold_type||'Not set'],['Dates',dateRange(r)]]:[]),...(isManager()?[['Client',clientFor(r.client_id)?.name||'Unavailable'],['Notes',r.notes||'No notes']]:[])]))+`<div class="actions"><button type="button" data-job-files="${esc(id)}">Files &amp; photos</button><button type="button" class="secondary" data-scaffold-job="${esc(id)}">Scaffolds &amp; inspections</button>${isManager()&&!r.archived?operationButton('book-job','New task',id):''}</div>`;
  if(isManager())body+=detailSection('Additional contacts',contactsFor(r.client_id).filter(c=>assignmentsFor(id).includes(c.id)).map(c=>`<p><strong>${esc(c.name)}</strong> · ${esc(c.role)}<br>${esc([c.phone,c.email].filter(Boolean).join(' · '))}</p>`).join('')||'<p>No contacts attached.</p>');
  body+=detailSection('Scheduled tasks',`<div class="detail-tasks">${(workspaceData.bookings||[]).filter(b=>b.job_id===id&&b.status==='scheduled').map(bookingCard).join('')||'<p>No tasks visible to you.</p>'}</div>`);
 }else{
  subtitle='Task · '+r.task;body=detailSection('Task details',detailFacts([['Job',jobBy(r.job_id)?.site],['Task',r.task],['When',bookingRange(r)],['Status',r.status],['Instructions',r.instructions||'No instructions'],['Crew',bookingCrew(id).map(x=>staffBy(x)?.full_name).filter(Boolean).join(', ')]]));
 }
 detailChrome(title,subtitle);$('records').innerHTML=`<div class="detail-navigation">${back}${kind==='staff'?operationButton('new-staff','+ Add staff member'):edit}</div>${body}`;
 if(kind==='staff')loadStaffProfileMedia(r,generation);
}
async function loadStaffProfileMedia(staff,generation){
 const current=()=>generation===detailGeneration&&recordView?.id===staff.id;
 if(staff.profile_photo){try{const {data,error}=await authClient().storage.from('staff-profiles').download(staff.profile_photo);if(error)throw error;if(current()){const img=document.createElement('img');img.src=rememberDocumentUrl(data);img.alt=staff.full_name;$('profileAvatar').replaceChildren(img)}}catch{if(current())$('profileAvatar').title='Profile photo could not be loaded'}}
 for(const [i,q] of (staff.qualifications||[]).entries())for(const item of q.images||[]){
  if(!current())return;const card=document.createElement('div');card.className='qualification-image';const button=document.createElement('button');button.className='image-preview';button.textContent='Loading…';card.append(button);$('profileQualification'+i)?.append(card);
  try{const blob=await imageBlob(item.path);if(!current())return;const url=rememberDocumentUrl(blob),img=document.createElement('img');img.src=url;img.alt=item.name;button.replaceChildren(img);button.onclick=()=>enlargeQualification(url,item.name);const download=document.createElement('button');download.className='text-button';download.textContent='Download';download.onclick=()=>downloadBlob(blob,item.name);card.append(download)}catch{button.textContent='Image unavailable';button.disabled=true}
 }
}
function staffLeaveList(id){const leave=(workspaceData.annual_leave||[]).filter(l=>l.staff_id===id);return `<div class="staff-leave-list">${leave.map(l=>`<article><span>${esc(dateLabel(l.starts_on))} — ${esc(dateLabel(l.ends_on))}</span><button type="button" class="text-button" data-leave-cancel="${esc(l.id)}">Cancel leave</button></article>`).join('')||'<p>No annual leave recorded.</p>'}</div>`}
function leaveForDay(day){return (workspaceData.annual_leave||[]).filter(l=>l.starts_on<=day&&l.ends_on>=day&&(plannerStaff==='all'||l.staff_id===plannerStaff))}
function leaveForTask(start,end,ids){return (workspaceData.annual_leave||[]).filter(l=>ids.includes(l.staff_id)&&start<addDays(l.ends_on,1)+'T00:00'&&end>l.starts_on+'T00:00')}
function plannerLeave(day){const leave=leaveForDay(day);return leave.length?`<div class="planner-leave"><strong>Annual leave</strong>${leave.map(l=>`<span>${esc(l.full_name)}</span>`).join('')}</div>`:''}
function openAnnualLeave(staffId,leaveId){
 if(!isManager()||leaveBusy)return;leaveEdit=leaveId?(workspaceData.annual_leave||[]).find(l=>l.id===leaveId):null;leaveRequest=null;
 $('leaveTitle').textContent=leaveEdit?'Cancel annual leave':'Add annual leave';$('leaveError').hidden=true;
 $('leaveFields').innerHTML=leaveEdit?`<p>Cancel annual leave for ${esc(leaveEdit.full_name)}, ${esc(dateLabel(leaveEdit.starts_on))} — ${esc(dateLabel(leaveEdit.ends_on))}?</p><p>The original record stays in the audit history.</p>`:`<label>Staff member<select name="staff_id" required>${(workspaceData.staff||[]).filter(s=>!s.archived).map(s=>`<option value="${esc(s.id)}" ${s.id===staffId?'selected':''}>${esc(s.full_name)}</option>`).join('')}</select></label><div class="formgrid"><label>First day<input type="date" name="starts_on" value="${plannerDate}" required></label><label>Last day (included)<input type="date" name="ends_on" value="${plannerDate}" required></label></div><p class="hint">Full-day annual leave. Existing tasks are retained and flagged for rescheduling; new tasks during leave are blocked. Leave does not automatically create timesheet hours or calculate holiday pay.</p>`;
 $('leaveSave').textContent=leaveEdit?'Confirm cancellation':'Save annual leave';$('leaveDialog').showModal();
}
function setupStaffProfileFields(s){
 operationEdit.profilePhoto=s.profile_photo||null;operationEdit.photoBlob=null;
 const section=document.createElement('section');section.className='profile-edit';section.innerHTML=`<h3>Personal profile</h3>${field('Address','address',s.address,{textarea:true,max:1500,full:true})}<label>Profile photograph<input id="staffPhotoInput" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="profile-photo-preview" id="staffPhotoPreview"></div><button type="button" class="text-button" id="removeStaffPhoto">Remove photo</button><p class="hint">JPG, PNG or WebP, up to 5 MB. Only Admin and Operations can view staff profiles.</p>`;$('operationsFields').prepend(section);
 const state=operationEdit;const preview=blob=>{if(operationEdit!==state)return;const img=document.createElement('img');img.src=rememberDocumentUrl(blob);img.alt='Profile photo preview';$('staffPhotoPreview').replaceChildren(img)};
 if(s.profile_photo)authClient().storage.from('staff-profiles').download(s.profile_photo).then(({data,error})=>{if(!error&&operationEdit===state&&!state.photoBlob&&state.profilePhoto)preview(data)});
 $('staffPhotoInput').onchange=async event=>{const file=event.target.files[0];if(!file)return;operationBusy=true;setStaffFormBusy(true);try{if(file.size>5*1024*1024)throw new Error('Choose a photo no larger than 5 MB.');const prepared=await prepareJobFile(file,'images');if(operationEdit!==state)return;state.photoBlob=prepared.blob;state.profilePhoto=`${c360Access.membership.organisation_id}/${state.draftId}/${crypto.randomUUID()}.jpg`;state.photoUploaded=false;preview(prepared.blob)}catch(e){showError($('operationsError'),e)}finally{operationBusy=false;setStaffFormBusy(false);event.target.value=''}};
 $('removeStaffPhoto').onclick=()=>{state.profilePhoto=null;state.photoBlob=null;$('staffPhotoPreview').replaceChildren()};
}
async function uploadStaffProfilePhoto(){const s=operationEdit;if(s.photoBlob&&!s.photoUploaded){const {error}=await authClient().storage.from('staff-profiles').upload(s.profilePhoto,s.photoBlob,{contentType:'image/jpeg',upsert:false});if(error)throw error;s.photoUploaded=true}}
function initialiseRecordDetails(){
 restoreRecordRoute();window.addEventListener('popstate',()=>{clearRecordViews();restoreRecordRoute();if(c360Access)render()});
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-detail-back]')){closeReadPage();recordView=null;setPage(currentPage);return}
  const pdf=event.target.closest('[data-staff-pdf]');if(pdf){downloadStaffRecord(pdf.dataset.staffPdf,pdf);return}
  const leave=event.target.closest('[data-leave-add],[data-leave-cancel]');if(leave){openAnnualLeave(leave.dataset.leaveAdd,leave.dataset.leaveCancel);return}
  const view=event.target.closest('[data-view]');if(view){openRecordView(view.dataset.view,view.dataset.id);return}
  if(!event.target.closest('button,a,input,select,textarea,summary,details')){
   const card=event.target.closest('[data-record-kind]');if(card)openRecordView(card.dataset.recordKind,card.dataset.id);
   const vehicle=event.target.closest('[data-record-vehicle]');if(vehicle)openVehicleHistory(vehicle.dataset.recordVehicle);
   const scaffold=event.target.closest('[data-record-scaffold]');if(scaffold)openScaffoldHistory(scaffold.dataset.recordScaffold);
   const timesheet=event.target.closest('[data-record-timesheet]');if(timesheet)openTimesheet(timesheet.dataset.recordTimesheet,'view');
  }
 });
 document.addEventListener('keydown',event=>{const card=event.target;if(['Enter',' '].includes(event.key)){
  if(card.matches('[data-record-kind]')){event.preventDefault();openRecordView(card.dataset.recordKind,card.dataset.id)}
  if(card.matches('[data-record-vehicle]')){event.preventDefault();openVehicleHistory(card.dataset.recordVehicle)}
  if(card.matches('[data-record-scaffold]')){event.preventDefault();openScaffoldHistory(card.dataset.recordScaffold)}
  if(card.matches('[data-record-timesheet]')){event.preventDefault();openTimesheet(card.dataset.recordTimesheet,'view')}
 }});
 $('operationsEditor').addEventListener('close',()=>{if(recordView?.kind==='staff'&&!operationBusy)render()});
 $('leaveClose').onclick=()=>{if(!leaveBusy)$('leaveDialog').close()};$('leaveDialog').addEventListener('cancel',e=>{if(leaveBusy)e.preventDefault()});
 $('leaveForm').onsubmit=async event=>{
  event.preventDefault();if(leaveBusy)return;const data=leaveEdit?{id:leaveEdit.id,version:leaveEdit.version}:Object.fromEntries(new FormData(event.target)),action=leaveEdit?'cancel':'add',fingerprint=JSON.stringify({action,data});
  if(leaveRequest?.fingerprint!==fingerprint)leaveRequest={fingerprint,id:crypto.randomUUID()};leaveBusy=true;$('leaveSave').disabled=true;$('leaveError').hidden=true;
  try{await rpc('annual_leave_save',{p_action:action,p_data:data,p_request_id:leaveRequest.id});$('leaveDialog').close();toast(action==='add'?'Annual leave saved. Check the planner for tasks needing rescheduling.':'Annual leave cancelled.');await loadWorkspace()}catch(e){showError($('leaveError'),e)}finally{leaveBusy=false;$('leaveSave').disabled=false}
 };
}

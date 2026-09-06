/* v14 operations UI. All authorization and conflict decisions also run in Postgres. */
let operationEdit=null,operationRequest=null,operationBusy=false;
let plannerDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let plannerMode='week',plannerStaff='all',plannerJob='all',plannerCancelled=false;
function isManager(){return ['admin','operations'].includes(c360Access?.membership?.role)}
function clearOperations(){operationEdit=null;operationRequest=null;$('operationsFields').replaceChildren();$('operationsToolbar').replaceChildren()}
function staffBy(id){return (workspaceData.staff||[]).find(s=>s.id===id)}
function teamBy(id){return (workspaceData.teams||[]).find(t=>t.id===id)}
function jobBy(id){return workspaceData.jobs.find(j=>j.id===id)}
function teamCrew(id){return workspaceData.team_members.filter(a=>a.team_id===id).map(a=>a.staff_id)}
function bookingCrew(id){return workspaceData.crew.filter(a=>a.booking_id===id).map(a=>a.staff_id)}
function staffAvailable(s){return s&&s.is_active&&!s.archived&&s.availability==='Available'}
function staffStatus(s){return s.archived?'Archived':!s.is_active?'Disabled':s.availability==='Unavailable'?'Unavailable':'Active'}
function isoDay(date){return date.toISOString().slice(0,10)}
function addDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return isoDay(d)}
function weekStart(day){const d=new Date(day+'T12:00:00Z');return addDays(day,-((d.getUTCDay()+6)%7))}
function localStamp(value){return String(value||'').slice(0,16)}
function timeLabel(value){return localStamp(value).slice(11)}
function bookingRange(b){return `${dateLabel(b.starts_at.slice(0,10))}, ${timeLabel(b.starts_at)} → ${b.starts_at.slice(0,10)===b.ends_at.slice(0,10)?'':dateLabel(b.ends_at.slice(0,10))+', '}${timeLabel(b.ends_at)}`}
function expiredQualifications(s,day=plannerDate){return (s.qualifications||[]).filter(q=>q.expires&&q.expires<day)}
function operationButton(action,label,id='',secondary=true){return `<button type="button" ${secondary?'class="secondary"':''} ${action==='book-day'?`aria-label="New booking for ${esc(dateLabel(id))}"`:''} data-ops="${action}" data-id="${esc(id)}">${esc(label)}</button>`}
function renderOperations(){
  const fieldUser=!isManager(),page=fieldUser&&currentPage==='overview'?'planner':currentPage;
  document.querySelectorAll('[data-page]').forEach(b=>{const active=b.dataset.page===currentPage;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
  $('stats').hidden=true;$('statusFilterLabel').hidden=true;$('clientFilterLabel').hidden=true;
  $('filters').hidden=!['staff','teams'].includes(page);
  $('pageTitle').textContent={planner:fieldUser?'My assignments':'Planner',staff:'Staff',teams:'Teams',permissions:'Access guide',jobs:'My jobs'}[page]||'My assignments';
  $('pageSubtitle').textContent={planner:fieldUser?'Your scheduled work, site details and instructions.':'Book the right people, at the right time.',staff:'Your people, qualifications and availability.',teams:'Build crews once, then schedule them together.',permissions:'Who can do what in this company workspace.',jobs:'Only jobs with a scheduled assignment for you.'}[page];
  $('addButton').hidden=fieldUser||page==='permissions';$('addButton').textContent={staff:'+ Add staff',teams:'+ New team',planner:'+ New booking'}[page]||'+ New booking';
  const term=$('recordSearch').value.trim().toLowerCase(),view=$('archiveFilter').value;
  if(page==='staff'||page==='teams'){
    const rows=(page==='staff'?workspaceData.staff:workspaceData.teams).filter(r=>(view==='all'||r.archived===(view==='archived'))&&[r.full_name,r.name,r.email,r.employment_role].join(' ').toLowerCase().includes(term));
    $('records').innerHTML=rows.length?`<div class="records-heading"><h2>${page==='staff'?'Staff directory':'Company teams'}</h2><span>${rows.length} records</span></div><div class="record-list">${rows.map(r=>page==='staff'?staffCard(r):teamCard(r)).join('')}</div>`:`<div class="empty"><h2>No ${page} in this view</h2><p>${page==='staff'?'Invited Supervisors and Operatives appear here automatically. You can also add staff who do not need a login.':'Create a team with a supervisor and crew, then use it in the Planner.'}</p>${operationButton(page==='staff'?'new-staff':'new-team',page==='staff'?'Add staff':'Create a team','',false)}</div>`;
  }else if(page==='permissions')renderAccessGuide();
  else if(page==='jobs'){
    $('records').innerHTML=workspaceData.jobs.length?`<div class="record-list">${workspaceData.jobs.map(j=>`<article class="record"><div><div class="record-code">JOB ${esc(j.code)}</div><strong class="record-title">${esc(j.site)}</strong><p>${esc(j.scaffold_type)}</p></div><div class="record-side"><span class="badge">${esc(j.status)}</span><p>${esc(dateRange(j))}</p></div>${operationButton('job-assignments','View assignments',j.id)}</article>`).join('')}</div>`:'<div class="empty"><h2>No jobs assigned yet</h2><p>Your Company Admin or Operations team will schedule your work. Refresh to check for changes.</p></div>';
  }else renderPlanner();
}
function staffCard(s){const expired=expiredQualifications(s);return `<article class="record"><div><div class="record-code">${s.user_id?'LINKED USER':'STAFF PROFILE · NO LOGIN'}</div><strong class="record-title">${esc(s.full_name)}</strong><div class="record-sub">${esc(s.position||s.employment_role)} · ${esc(s.email||'No email added')}</div></div><div class="record-side"><span class="badge ${staffStatus(s)==='Active'?'completed':'archived'}">${esc(staffStatus(s))}</span><div class="record-sub">${(s.qualifications||[]).length} qualifications${s.qualification&&s.qualification!=='None'?' · '+esc(s.qualification):''}</div>${expired.length?`<span class="warning-text">${expired.length} expired qualification${expired.length===1?'':'s'}</span>`:''}</div><div class="record-actions">${operationButton('edit-staff','View / edit',s.id)}${operationButton('staff-planner','Bookings',s.id)}</div></article>`}
function teamCard(t){const crew=teamCrew(t.id),attention=crew.some(id=>!staffAvailable(staffBy(id)))||staffBy(t.supervisor_id)?.employment_role!=='Scaffold Supervisor';return `<article class="record"><div><div class="record-code">${t.archived?'ARCHIVED TEAM':'COMPANY TEAM'}</div><strong class="record-title">${esc(t.name)}</strong><div class="record-sub">Supervisor: ${esc(staffBy(t.supervisor_id)?.full_name||'Unavailable')}</div></div><div class="record-side">${crew.length} people<div class="record-sub">${esc(crew.map(id=>staffBy(id)?.full_name).filter(Boolean).join(', '))}</div>${attention?'<span class="warning-text">Review crew availability before booking</span>':''}</div><div class="record-actions">${operationButton('edit-team','View / edit',t.id)}${!t.archived?operationButton('book-team','Schedule team',t.id):''}</div></article>`}
function renderPlanner(){
  const start=plannerMode==='week'?weekStart(plannerDate):plannerDate,end=addDays(start,plannerMode==='week'?7:1);
  $('operationsToolbar').hidden=false;
  $('operationsToolbar').innerHTML=`<div class="planner-toolbar"><div class="actions">${operationButton('previous','← Previous')}${operationButton('today','Today')}${operationButton('next','Next →')}</div><label for="plannerDate">Date<input id="plannerDate" type="date" value="${esc(plannerDate)}"></label><label for="plannerMode">Display<select id="plannerMode"><option value="week" ${plannerMode==='week'?'selected':''}>Week</option><option value="day" ${plannerMode==='day'?'selected':''}>Day</option></select></label>${isManager()?`<label for="plannerStaff">Staff<select id="plannerStaff"><option value="all">All staff</option>${workspaceData.staff.map(s=>`<option value="${esc(s.id)}" ${plannerStaff===s.id?'selected':''}>${esc(s.full_name)}</option>`).join('')}</select></label>`:''}<label for="plannerJob">Job<select id="plannerJob"><option value="all">All jobs</option>${workspaceData.jobs.map(j=>`<option value="${esc(j.id)}" ${plannerJob===j.id?'selected':''}>${esc(j.code)} · ${esc(j.site)}</option>`).join('')}</select></label>${isManager()?`<label class="check-label"><input id="plannerCancelled" type="checkbox" ${plannerCancelled?'checked':''}>Include cancelled</label>`:''}</div><div class="records-heading"><h2>${esc(dateLabel(start))}${plannerMode==='week'?' – '+esc(dateLabel(addDays(end,-1))):''}</h2><span>UK site time</span></div>`;
  const visible=workspaceData.bookings.filter(b=>(plannerCancelled||b.status==='scheduled')&&(plannerStaff==='all'||bookingCrew(b.id).includes(plannerStaff))&&(plannerJob==='all'||b.job_id===plannerJob)&&b.starts_at<end+'T00:00:00'&&b.ends_at>start+'T00:00:00');
  const days=Array.from({length:plannerMode==='week'?7:1},(_,i)=>addDays(start,i));
  $('records').innerHTML=`<div class="planner-grid ${plannerMode==='day'?'day-view':''}">${days.map(day=>{const bookings=visible.filter(b=>b.starts_at<addDays(day,1)+'T00:00:00'&&b.ends_at>day+'T00:00:00');return `<section class="planner-day"><div class="planner-day-title"><h3>${new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00Z'))}</h3>${isManager()?operationButton('book-day','+',day):''}</div>${bookings.length?bookings.map(bookingCard).join(''):'<p class="day-empty">No assignments</p>'}</section>`}).join('')}</div><p class="hint">${isManager()?'Overlapping bookings for the same person are blocked. Team rosters are copied into bookings when saved. Availability changes are flagged below; review affected bookings.':'Only your scheduled assignments are shown. Contact your supervisor or office if anything needs changing.'}</p>`;
}
function bookingWarnings(b){if(!isManager()||b.status==='cancelled')return [];const warnings=[];for(const id of bookingCrew(b.id)){const s=staffBy(id);if(!staffAvailable(s))warnings.push(`${s?.full_name||'Staff member'} is ${s?staffStatus(s).toLowerCase():'unavailable'}`);if(s&&expiredQualifications(s,b.ends_at.slice(0,10)).length)warnings.push(`${s.full_name}: qualification expired by booking finish`)}if(b.team_id&&teamBy(b.team_id)?.archived)warnings.push('Team is archived; saved crew retained');return warnings}
function bookingCard(b){const j=jobBy(b.job_id),warnings=bookingWarnings(b);return `<button class="booking-card ${b.status==='cancelled'?'cancelled':''}" data-ops="edit-booking" data-id="${esc(b.id)}"><span class="booking-time">${esc(timeLabel(b.starts_at))} – ${esc(timeLabel(b.ends_at))}${b.starts_at.slice(0,10)!==b.ends_at.slice(0,10)?' · multi-day':''}</span><strong>${esc(b.task)}</strong><span>${esc(j?.code)} · ${esc(j?.site)}</span><small>${esc(bookingCrew(b.id).map(id=>staffBy(id)?.full_name).filter(Boolean).join(', '))}</small>${b.status==='cancelled'?'<span class="badge archived">Cancelled</span>':''}${warnings.length?`<span class="warning-text">Needs review · ${warnings.length}</span>`:''}</button>`}
function renderAccessGuide(){
  $('records').innerHTML=`<div class="permission-grid">${[
    ['Company Admin','Manage clients, jobs, staff, teams and bookings. Invite, disable and permanently delete company user accounts. Import and export Clients & Jobs.'],
    ['Operations','Manage clients, jobs, staff profiles, teams and bookings. Cannot administer login accounts, use the Admin import/export tool or enter Platform Administration.'],
    ['Supervisor','View jobs and instructions for their own scheduled assignments, plus the crew names and working roles on those assignments. No management edits or private staff notes.'],
    ['Operative','View their own scheduled assignments, job location and instructions. No company directories, other staff profiles or management edits.'],
    ['Platform Administrator','Manage companies through Platform Administration. Platform status alone does not grant access to a company’s operational records.']
  ].map(([name,description])=>`<article class="record permission-card"><h3>${name}</h3><p>${description}</p></article>`).join('')}</div><div class="notice">These permissions are enforced when data is requested or saved. Company suspension or account disabling blocks new requests. Previously downloaded information cannot be recalled.</div>`;
}
function selectField(label,id,options,value='',required=false){return `<div class="field"><label for="${id}">${esc(label)}${required?' *':''}</label><select id="${id}" name="${id}" ${required?'required':''}>${options.map(([key,text])=>`<option value="${esc(key)}" ${String(value)===String(key)?'selected':''}>${esc(text)}</option>`).join('')}</select></div>`}
function checkboxList(staff,selected,name){return staff.map(s=>`<label class="check-label"><input type="checkbox" name="${name}" value="${esc(s.id)}" ${selected.includes(s.id)?'checked':''}><span>${esc(s.full_name)} <small class="muted">· ${esc(s.employment_role)}${!staffAvailable(s)?' · '+esc(staffStatus(s)):''}</small></span></label>`).join('')}
function openOperations(kind,id=null,defaults={}){
  if(!isManager()&&kind!=='booking')return;
  $('editorFields').replaceChildren();
  const rows={staff:workspaceData.staff,team:workspaceData.teams,booking:workspaceData.bookings},r=id?rows[kind]?.find(x=>x.id===id):null;if(id&&!r)return;
  if(kind==='booking'&&!r&&!workspaceData.jobs.some(j=>!j.archived&&!CLOSED_STATUSES.has(j.status))){toast('Create an open job before scheduling a crew.');return}
  clearStaffDocuments();operationEdit={kind,record:r,draftId:r?.id||crypto.randomUUID()};operationRequest=null;$('operationsError').hidden=true;$('operationsForm').reset();
  $('operationsTitle').textContent=kind==='booking'&&!isManager()?'Assignment details':`${r?'Edit':'New'} ${kind==='booking'?'booking':kind==='staff'?'staff member':'team'}`;
  $('operationsSave').hidden=!isManager();$('operationsSave').textContent=r?.status==='cancelled'?'Restore booking':'Save';
  $('operationsFootnote').textContent='Changes are saved for your company.';
  if(kind==='staff')staffFields(r||{});
  else if(kind==='team')teamFields(r||{});
  else if(!isManager())assignmentFields(r);
  else bookingFields(r||{},defaults);
  $('operationsEditor').showModal();
}
function staffFields(s){
  $('operationsFields').innerHTML=`${s.user_id?'<div class="notice">Linked user: name, email, login role and account status come from the user account. Archiving this staff profile removes assignment access but does not delete the login.</div>':'<p class="hint">This creates a staff profile only. A Company Admin can invite people who also need a login through Users. Invitations create separate linked profiles; they do not merge existing manual profiles.</p>'}<div class="formgrid">${field('Full name','full_name',s.full_name,{required:true,max:140})}${field('Email','email',s.email,{type:'email',max:254})}${field('Phone','phone',s.phone,{type:'tel',max:60})}${selectField('Position','staff_position',[['Operative','Operative'],['Scaffold Supervisor','Scaffold Supervisor'],['Operations','Operations']],s.position||s.employment_role||'Operative')}${field('Hourly rate (£)','hourly_rate',s.hourly_rate??'',{max:6})}${selectField('Availability','availability',[['Available','Available'],['Unavailable','Unavailable']],s.availability==='Unavailable'?'Unavailable':'Available')}${field('Private office notes','notes',s.notes,{textarea:true,max:5000,full:true})}</div><label class="check-label"><input type="checkbox" name="archived" ${s.archived?'checked':''}>Archive this staff profile</label><div class="form-section"><h3>Qualifications</h3><button type="button" class="secondary" id="addQualification">+ Qualification</button></div><p class="hint">Record training and card expiry dates. Expiry warnings help planning; they do not certify someone as competent for a task.${s.qualification&&s.qualification!=='None'?' Previous qualification label: '+esc(s.qualification)+'.':''}</p><div id="qualificationFields"></div>`;
  if(s.user_id){['f_full_name','f_email'].forEach(id=>$(id).disabled=true)}
  const rate=$('f_hourly_rate');if(s.hourly_rate!==null&&s.hourly_rate!==undefined)rate.value=Number(s.hourly_rate).toFixed(2);rate.inputMode='decimal';rate.pattern='[0-9]{1,3}([.][0-9]{1,2})?';rate.title='£0.00 to £999.99, with up to two decimal places';rate.oninput=()=>{const value=rate.value.replace(/[^0-9.]/g,'');const [whole,...fraction]=value.split('.');rate.value=whole.slice(0,3)+(fraction.length?'.'+fraction.join('').slice(0,2):'')};rate.onblur=()=>{if(rate.value&&rate.validity.valid)rate.value=Number(rate.value).toFixed(2)};
  if(s.id){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Download staff record';button.onclick=()=>downloadStaffRecord(s.id,button);$('operationsFields').prepend(button)}
  (s.qualifications||[]).forEach(addQualification);$('addQualification').onclick=()=>addQualification();
}
function addQualification(q={}){if($('qualificationFields').children.length>=30){toast('Maximum 30 qualifications per person.');return}const id=q.id||crypto.randomUUID(),el=document.createElement('fieldset');el.className='contact-card';el.dataset.qualification=id;
  el.innerHTML=`<legend>Qualification</legend><div class="formgrid">${field('Qualification name','q_name_'+id,q.name,{required:true,max:160})}${field('Card / certificate reference','q_reference_'+id,q.reference,{max:120})}${field('Expiry date (optional)','q_expires_'+id,q.expires,{type:'date'})}</div><button type="button" class="text-button">Remove qualification</button>`;el.querySelector('button').onclick=()=>{el.remove();$('addQualification').focus()};$('qualificationFields').append(el);addQualificationImages(el,q);
}
function teamFields(t){const crew=t.id?teamCrew(t.id):[];
  $('operationsFields').innerHTML=`<div class="formgrid">${field('Team name','name',t.name,{required:true,max:120})}${selectField('Supervisor','supervisor_id',[['','Choose a supervisor'],...workspaceData.staff.filter(s=>s.employment_role==='Scaffold Supervisor'||s.id===t.supervisor_id).map(s=>[s.id,s.full_name+(s.archived||!s.is_active?' (inactive)':'')])],t.supervisor_id,true)}${field('Private team notes','notes',t.notes,{textarea:true,max:3000,full:true})}</div><h3 class="section-title">Team members</h3><p class="hint">The supervisor is always included. People may belong to more than one team; booking checks prevent double-booking. Changing this roster does not change existing bookings.</p><div class="crew-picker">${checkboxList(workspaceData.staff.filter(s=>!s.archived||crew.includes(s.id)),crew,'staff_ids')||'<p>Add staff first.</p>'}</div><label class="check-label"><input type="checkbox" name="archived" ${t.archived?'checked':''}>Archive this team</label>`;
}
function assignmentFields(b){const j=jobBy(b.job_id);$('operationsFootnote').textContent='Contact your supervisor or office to request a change.';
  $('operationsFields').innerHTML=`<div class="assignment-summary"><span class="badge">${esc(bookingRange(b))}</span><h3>${esc(b.task)}</h3><p><strong>Job ${esc(j?.code)} · ${esc(j?.site)}</strong></p><p>${esc(j?.scaffold_type)}</p><h3>Site instructions</h3><p class="preserve-lines">${esc(b.instructions||'No additional instructions provided.')}</p>${c360Access.membership.role==='supervisor'?`<h3>Assigned crew</h3><ul>${bookingCrew(b.id).map(id=>`<li>${esc(staffBy(id)?.full_name)} · ${esc(staffBy(id)?.employment_role)}</li>`).join('')}</ul>`:''}<p class="hint">All times are UK site-local time.</p></div>`;
}
function bookingFields(b,defaults){const jobId=b.job_id||defaults.job_id||'',teamId=b.team_id||defaults.team_id||'',day=defaults.day||plannerDate;
  const crew=b.id?bookingCrew(b.id):[],currentTeam=teamId?teamCrew(teamId):[];
  $('operationsFields').innerHTML=`<div class="formgrid">${selectField('Job','booking_job',[['','Choose a job'],...workspaceData.jobs.filter(j=>!j.archived&&!CLOSED_STATUSES.has(j.status)||j.id===jobId).map(j=>[j.id,j.code+' · '+j.site])],jobId,true)}${field('Task','task',b.task||'Scaffolding works',{required:true,max:180})}${field('Start (UK site time)','starts_at',localStamp(b.starts_at)||day+'T08:00',{type:'datetime-local',required:true})}${field('Finish (UK site time)','ends_at',localStamp(b.ends_at)||day+'T16:00',{type:'datetime-local',required:true})}${selectField('Team template','booking_team',[['','Individual staff only'],...workspaceData.teams.filter(t=>!t.archived||t.id===teamId).map(t=>[t.id,t.name+(t.archived?' (archived)':'')])],teamId)}<div class="field"><label>Saved booking</label><p>${b.id?'Existing crew: '+esc(crew.map(id=>staffBy(id)?.full_name).join(', ')):'New assignment'}</p></div></div><div id="selectedTeam" class="notice"></div><h3 class="section-title">${teamId?'Additional staff':'Staff'}</h3><p class="hint">The selected team’s current crew is included automatically when you save. Tick extra people below. For an existing booking, review the preview because the team roster may have changed.</p><div class="crew-picker">${checkboxList(workspaceData.staff.filter(s=>staffAvailable(s)||crew.includes(s.id)),crew.filter(id=>!currentTeam.includes(id)),'staff_ids')}</div><div id="bookingPreview" class="booking-preview" aria-live="polite"></div>${field('Instructions visible to assigned users','instructions',b.instructions,{textarea:true,max:5000,full:true})}${b.id&&b.status!=='cancelled'?`<div class="cancel-booking"><label class="check-label"><input id="confirmBookingCancel" type="checkbox">Cancel this booking and release its crew</label>${operationButton('cancel-booking','Confirm cancellation',b.id)}</div>`:''}`;
  $('booking_team').onchange=previewBooking;['f_starts_at','f_ends_at'].forEach(id=>$(id).onchange=previewBooking);$('operationsFields').querySelectorAll('input[name="staff_ids"]').forEach(el=>el.onchange=previewBooking);previewBooking();
}
function previewBooking(){
  const t=teamBy($('booking_team').value),teamIds=t?teamCrew(t.id):[],extra=[...$('operationsFields').querySelectorAll('input[name="staff_ids"]:checked')].map(el=>el.value),ids=[...new Set([...teamIds,...extra])];
  $('selectedTeam').textContent=t?`${t.name}: ${teamIds.map(id=>staffBy(id)?.full_name).join(', ')}. Roster version ${t.version}.`:'Choose individual staff below, or select a team template.';
  const start=$('f_starts_at').value,end=$('f_ends_at').value;
  const conflicts=workspaceData.bookings.filter(b=>b.id!==operationEdit.record?.id&&b.status==='scheduled'&&localStamp(b.starts_at)<end&&localStamp(b.ends_at)>start&&bookingCrew(b.id).some(id=>ids.includes(id)));
  const expired=ids.filter(id=>expiredQualifications(staffBy(id)||{},end.slice(0,10)).length);
  $('bookingPreview').innerHTML=`<strong>${ids.length} people selected</strong><p>${esc(ids.map(id=>staffBy(id)?.full_name).join(', '))||'Choose a crew to continue.'}</p>${conflicts.length?`<p class="warning-text">Conflicts with: ${esc(conflicts.map(b=>b.task+' ('+bookingRange(b)+')').join('; '))}. Saving will be blocked.</p>`:''}${expired.length?`<p class="warning-text">Check expired qualifications for ${esc(expired.map(id=>staffBy(id)?.full_name).join(', '))} before assigning this task.</p>`:''}`;
}
function operationsPayload(){const f=new FormData($('operationsForm')),r=operationEdit.record,data={id:r?.id||operationEdit.draftId||null,version:r?.version||0};const get=k=>String(f.get(k)||'').trim();
  if(operationEdit.kind==='staff')return {...data,full_name:r?.user_id?r.full_name:get('full_name'),email:r?.user_id?r.email:get('email'),phone:get('phone'),employment_role:r?.user_id?r.employment_role:get('staff_position'),position:get('staff_position'),hourly_rate:get('hourly_rate'),is_active:r?.is_active??true,availability:get('availability'),notes:get('notes'),archived:f.has('archived'),qualifications:[...$('qualificationFields').children].map(el=>{const id=el.dataset.qualification;return {id,name:get('q_name_'+id),reference:get('q_reference_'+id),expires:get('q_expires_'+id),images:qualificationImageMetadata(el)}})};
  if(operationEdit.kind==='team')return {...data,name:get('name'),supervisor_id:get('supervisor_id'),notes:get('notes'),archived:f.has('archived'),staff_ids:f.getAll('staff_ids')};
  const team=teamBy(get('booking_team'));return {...data,job_id:get('booking_job'),team_id:team?.id||null,team_version:team?.version||null,staff_ids:f.getAll('staff_ids'),task:get('task'),starts_at:get('starts_at'),ends_at:get('ends_at'),instructions:get('instructions')};
}
async function saveOperations(event){event.preventDefault();if(operationBusy||!isManager())return;
  if(operationEdit.kind==='staff'){
    operationBusy=true;setStaffFormBusy(true);
    try{await uploadQualificationImages();}catch(error){showError($('operationsError'),error);return}finally{operationBusy=false;setStaffFormBusy(false)}
  }
  await commitOperation(operationEdit.kind,operationsPayload());
}
async function commitOperation(kind,data){
  const fingerprint=JSON.stringify({kind,data});if(!operationRequest||operationRequest.fingerprint!==fingerprint)operationRequest={fingerprint,id:crypto.randomUUID()};
  operationBusy=true;$('operationsError').hidden=true;$('operationsForm').querySelectorAll('button').forEach(el=>el.disabled=true);
  try{await rpc('operations_save',{p_kind:kind,p_data:data,p_request_id:operationRequest.id});$('operationsEditor').close();toast(kind==='cancel_booking'?'Booking cancelled. Crew released.':'Saved to your company.');operationRequest=null;safeRefresh()}
  catch(error){showError($('operationsError'),error)}finally{operationBusy=false;$('operationsForm').querySelectorAll('button').forEach(el=>el.disabled=false)}
}
function initialiseOperations(){
  $('operationsForm').onsubmit=saveOperations;['operationsClose','operationsCancel'].forEach(id=>$(id).onclick=()=>{if(!operationBusy)$('operationsEditor').close()});
  $('operationsEditor').addEventListener('cancel',e=>{if(operationBusy)e.preventDefault()});
  document.addEventListener('click',e=>{const b=e.target.closest('button[data-ops]');if(!b||operationBusy)return;const {ops,id}=b.dataset;
    if(ops.startsWith('new-'))openOperations(ops.slice(4));
    if(ops.startsWith('edit-'))openOperations(ops.slice(5),id);
    if(ops==='book-job')openOperations('booking',null,{job_id:id});
    if(ops==='book-team')openOperations('booking',null,{team_id:id});
    if(ops==='book-day')openOperations('booking',null,{day:id});
    if(ops==='staff-planner'){plannerStaff=id;plannerJob='all';setPage('planner')}
    if(ops==='job-assignments'){plannerJob=id;plannerStaff='all';const next=workspaceData.bookings.find(b=>b.job_id===id&&b.ends_at.slice(0,10)>=plannerDate)||workspaceData.bookings.find(b=>b.job_id===id);if(next)plannerDate=next.starts_at.slice(0,10);setPage('planner')}
    if(ops==='previous'||ops==='next'){plannerDate=addDays(plannerDate,(ops==='previous'?-1:1)*(plannerMode==='week'?7:1));render()}
    if(ops==='today'){plannerDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());render()}
    if(ops==='cancel-booking'){if(!$('confirmBookingCancel')?.checked){showError($('operationsError'),new Error('Tick the cancellation confirmation first.'));return}commitOperation('cancel_booking',{id:operationEdit.record.id,version:operationEdit.record.version})}
  });
  $('operationsToolbar').addEventListener('change',e=>{const {id,value,checked}=e.target;if(id==='plannerDate'&&/^\d{4}-\d{2}-\d{2}$/.test(value))plannerDate=value;if(id==='plannerMode')plannerMode=value;if(id==='plannerStaff')plannerStaff=value;if(id==='plannerJob')plannerJob=value;if(id==='plannerCancelled')plannerCancelled=checked;render()});
}

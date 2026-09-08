/* v17: daily drafts and explicit weekly approval. No operational localStorage. */
let timesheetData=null,timesheetWeek=null,timesheetLoading=false,timesheetGeneration=0;
let timesheetEdit=null,timesheetRequest=null,timesheetBusy=false,timesheetDirty=false,timesheetHistoryGeneration=0;
function clearTimesheets(){timesheetGeneration++;timesheetHistoryGeneration++;timesheetData=null;timesheetLoading=false;timesheetEdit=null;timesheetRequest=null;timesheetDirty=false;$('timesheetDialog').close();$('timesheetFields').replaceChildren()}
function timesheetToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function timesheetStatus(status){return {draft:'Draft — not submitted',submitted:'Awaiting approval',returned:'Returned for correction',approved:'Approved'}[status]||'Not started'}
function timesheetMoney(value){return value==null?'Rate not set':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(value))}
function timesheetHours(value){return Number(value||0).toLocaleString('en-GB',{maximumFractionDigits:2})}
function tsButton(action,label,id='',secondary=true){return `<button type="button" ${secondary?'class="secondary"':''} data-timesheet="${action}" data-id="${esc(id)}">${esc(label)}</button>`}
async function loadTimesheets(){
 if(timesheetLoading)return;timesheetLoading=true;const generation=++timesheetGeneration,org=c360Access.membership.organisation_id;
 try{const data=await rpc('timesheets_snapshot',{p_week:timesheetWeek});if(generation!==timesheetGeneration)return;if(data.organisation_id!==org)throw new Error('Company check failed.');timesheetData=data;if(currentPage==='timesheets')renderTimesheets()}
 catch(error){if(generation===timesheetGeneration&&currentPage==='timesheets')$('records').innerHTML=`<div class="empty"><h2>Timesheets could not be loaded</h2><p>${esc(friendlyError(error))}</p>${tsButton('retry','Try again')}</div>`}
 finally{if(generation===timesheetGeneration)timesheetLoading=false}
}
function changeTimesheetWeek(value){if(!value)return;timesheetWeek=weekStart(value);timesheetGeneration++;timesheetData=null;timesheetLoading=false;renderTimesheets()}
function renderTimesheets(){
 timesheetWeek??=weekStart(timesheetToday());
 document.querySelectorAll('[data-page]').forEach(b=>{const active=b.dataset.page==='timesheets';b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
 $('pageTitle').textContent=isManager()?'Timesheets':'My timesheets';$('pageSubtitle').textContent=isManager()?'Review company hours, approve weeks and download branded reports.':'Save your hours each day. Submit your week only when it is complete.';
 $('addButton').hidden=true;$('filters').hidden=true;$('operationsToolbar').hidden=false;
 $('operationsToolbar').innerHTML=`<div class="timesheet-toolbar"><div class="actions">${tsButton('previous','← Previous week')}${tsButton('next','Next week →')}</div><label>Week commencing<input id="timesheetWeekPicker" type="date" min="2000-01-03" max="2199-12-23" value="${esc(timesheetWeek)}"></label>${isManager()?tsButton('report','Download weekly PDF'):''}</div>`;
 $('timesheetWeekPicker').onchange=e=>changeTimesheetWeek(e.target.value);
 if(!timesheetData){$('records').innerHTML='<div class="empty" role="status">Loading timesheets…</div>';loadTimesheets();return}
 const data=timesheetData,own=data.sheets.find(t=>t.owner_user_id===c360Access.user.id),total=data.sheets.reduce((s,t)=>s+Number(t.total_hours),0);
 $('records').innerHTML=`<div class="timesheet-banner"><div><p class="eyebrow">${esc(dateLabel(timesheetWeek))} — ${esc(dateLabel(addDays(timesheetWeek,6)))}</p><h2>${isManager()?'Company weekly timesheets':'Your working week'}</h2><p>${isManager()?'Drafts are saved but not submitted. Only submitted weeks can be approved or returned.':'Save draft keeps your hours for later. Submit week sends them to the office and locks them for review.'}</p></div>${data.self_staff&&!own?tsButton('new','Start my week','',false):''}</div>${!data.self_staff&&!isManager()?'<div class="notice">Your active linked Staff profile is unavailable. Ask your company Admin to check it.</div>':''}${isManager()?`<div class="vehicle-summary"><div><strong>${timesheetHours(total)}</strong><span>Hours saved this week</span></div><div><strong>${data.sheets.filter(t=>t.status==='submitted').length}</strong><span>Awaiting approval</span></div><div><strong>${data.sheets.filter(t=>t.status==='approved').length}</strong><span>Approved weeks</span></div></div><div class="timesheet-list">${data.sheets.map(timesheetCard).join('')}</div>${renderMissingTimesheets()}`:data.sheets.length?`<div class="timesheet-list">${data.sheets.map(timesheetCard).join('')}</div>`:'<div class="empty"><h3>No saved hours this week</h3><p>Start your week and enter daily totals, such as 7.5 hours. You do not need to wait until Friday to save.</p></div>'}`;
}
function renderMissingTimesheets(){const missing=timesheetData.staff.filter(s=>!timesheetData.sheets.some(t=>t.staff_id===s.id));return missing.length?`<details class="timesheet-missing"><summary>${missing.length} staff without a saved timesheet this week</summary>${missing.map(s=>`<p>${esc(s.full_name)} <span class="muted">${s.can_submit?'Not started':'No active linked login'}</span></p>`).join('')}</details>`:''}
function timesheetCard(t){const own=t.owner_user_id===c360Access.user.id,editable=own&&['draft','returned'].includes(t.status);return `<article class="timesheet-card"><div><p class="eyebrow">WEEK COMMENCING ${esc(dateLabel(t.week_start))}</p><h3>${esc(t.staff_name)}</h3><span class="badge ts-${esc(t.status)}">${esc(timesheetStatus(t.status))}</span>${t.review_note?`<p class="timesheet-notes"><strong>Office note:</strong> ${esc(t.review_note)}</p>`:''}<p class="hint">Last saved ${esc(vehicleTime(t.updated_at))}</p></div><div class="timesheet-totals"><strong>${timesheetHours(t.total_hours)} <small>hours</small></strong>${isManager()?`<span>${timesheetMoney(t.hourly_rate)} / hour</span><span>${timesheetMoney(t.gross_estimate)} ${t.status==='approved'?'Gross pay (approved)':'Gross pay (provisional)'}</span>`:''}</div><div class="vehicle-actions">${tsButton(editable?'edit':'view',editable?'Continue / submit':'View week',t.id)}${isManager()&&t.status==='submitted'?tsButton('review','Review / approve',t.id,false):''}${tsButton('pdf','Download PDF',t.id)}</div></article>`}
function tsEntryRow(entries=[],day=''){
 const hours=entries.length?entries.reduce((n,e)=>n+Number(e.hours),0):'';
 const notes=entries.map(e=>e.notes).filter(Boolean).join('\n');
 return `<div class="timesheet-entry"><label>Hours worked<input class="ts-hours" type="text" inputmode="decimal" maxlength="4" pattern="[0-9]{1,2}([.]5)?" aria-label="Hours worked on ${esc(day)}" title="Whole or half hours, from 0 to 24 (for example 8 or 8.5)" value="${esc(hours)}" placeholder="0"></label><details class="ts-entry-notes" ${notes?'open':''}><summary>Notes${notes?' added':' (optional)'}</summary><label>Notes for ${esc(day)}<textarea class="ts-notes" maxlength="1000" rows="2">${esc(notes)}</textarea></label></details></div>`;
}
function openTimesheet(id=null,mode='edit'){
 const t=id?timesheetData?.sheets.find(t=>t.id===id):null;if(id&&!t)return;
 const own=!t?!!timesheetData.self_staff:t.owner_user_id===c360Access.user.id;
 const editable=mode==='edit'&&own&&(!t||['draft','returned'].includes(t.status));
 if(!t&&!editable)return;
 timesheetEdit={sheet:t,editable,mode};timesheetDirty=false;timesheetRequest=null;timesheetHistoryGeneration++;
 $('timesheetError').hidden=true;$('timesheetSaveState').textContent='';$('timesheetTitle').textContent=t?.staff_name||timesheetData.self_staff.full_name;
 $('timesheetEyebrow').textContent=`WEEK OF ${dateLabel(timesheetWeek)}`;$('timesheetSave').hidden=!editable;$('timesheetSubmit').hidden=!editable;
 $('timesheetFields').innerHTML=editable?`<p class="ts-entry-help">Enter each day's total in whole or half hours, such as <strong>8</strong> or <strong>8.5</strong> (maximum 24). Save now; submit when your week is complete.</p>${t?.review_note?`<p class="timesheet-notes"><strong>Returned:</strong> ${esc(t.review_note)}</p>`:''}${t?.entries.some(e=>e.job_id)||t?.entries.some((e,i,all)=>all.findIndex(x=>x.date===e.date)!==i)?'<div class="notice">This older draft contains split entries. Saving combines them into daily totals without job allocations. Previous entries remain in the office audit history. Check the totals and notes before saving.</div>':''}<div id="timesheetDays">${Array.from({length:7},(_,i)=>{const day=addDays(timesheetWeek,i),entries=(t?.entries||[]).filter(e=>e.date===day);return `<fieldset class="timesheet-day" data-day="${day}"><legend>${esc(new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00Z')))}</legend>${tsEntryRow(entries,day)}</fieldset>`}).join('')}</div><div class="timesheet-week-total">Week total: <strong id="timesheetTotal"></strong> hours</div><label class="check-label"><input id="timesheetComplete" type="checkbox"><span>My week is complete and ready for approval. Leave unticked to save a draft.</span></label>`:timesheetDetails(t,mode);
 if(editable){$('timesheetFields').oninput=()=>{timesheetDirty=true;updateTimesheetTotals()};$('timesheetFields').onchange=()=>{timesheetDirty=true;updateTimesheetTotals()};updateTimesheetTotals()}
 else{$('timesheetFields').oninput=null;$('timesheetFields').onchange=null;loadTimesheetHistory(t.id)}
 if(!$('timesheetDialog').open)$('timesheetDialog').showModal();
}
function timesheetDetails(t,mode){return `<p><span class="badge ts-${esc(t.status)}">${esc(timesheetStatus(t.status))}</span></p>${t.review_note?`<p class="timesheet-notes"><strong>Office note:</strong> ${esc(t.review_note)}</p>`:''}<div class="timesheet-read-days">${Array.from({length:7},(_,i)=>{const day=addDays(t.week_start,i),entries=t.entries.filter(e=>e.date===day);return `<section><h3>${esc(dateLabel(day))} <span>${timesheetHours(entries.reduce((n,e)=>n+Number(e.hours),0))} hrs</span></h3>${entries.map(e=>`<p><strong>${timesheetHours(e.hours)} hrs</strong>${e.job_label?' · '+esc(e.job_label):''}</p>${e.notes?`<p class="timesheet-notes muted">${esc(e.notes)}</p>`:''}`).join('')||'<p class="muted">No hours recorded</p>'}</section>`}).join('')}</div><div class="timesheet-week-total">Total: <strong>${timesheetHours(t.total_hours)}</strong> hours</div>${isManager()?`<div class="notice">Hourly rate: <strong>${timesheetMoney(t.hourly_rate)}</strong><br>Gross pay: <strong>${timesheetMoney(t.gross_estimate)}</strong><br><small>${t.status==='approved'?'Rate captured at approval.':'Provisional, using the current Staff rate.'} No overtime uplift, deductions or employer costs included.</small></div>`:''}${isManager()&&mode==='review'&&t.status==='submitted'?`<div class="timesheet-review"><h3>Review this week</h3><label class="check-label"><input id="timesheetReviewed" type="checkbox"><span>I have reviewed the hours and hourly rate shown above.</span></label><label>Review note / reason for return<textarea id="timesheetReviewReason" maxlength="2000" rows="3"></textarea></label><div class="vehicle-actions">${tsButton('approve','Approve week',t.id,false)}${tsButton('return','Return for correction',t.id)}</div><p class="hint">Returning requires a reason. Approval locks the week and captures its rate.</p></div>`:''}<div id="timesheetHistory" class="hint">Loading status history…</div>`}
async function loadTimesheetHistory(id){const generation=timesheetHistoryGeneration;try{const result=await rpc('timesheet_history',{p_id:id});if(generation!==timesheetHistoryGeneration)return;if(result.organisation_id!==timesheetData?.organisation_id)throw new Error('Company check failed.');$('timesheetHistory').innerHTML='<h3>Status history</h3>'+result.events.map(e=>`<p>${esc({submit:'Submitted',approve:'Approved',return:'Returned'}[e.action])} · ${esc(vehicleTime(e.created_at))}${e.note?`<br>${esc(e.note)}`:''}</p>`).join('')}catch(error){if(generation===timesheetHistoryGeneration)$('timesheetHistory').textContent='Status history could not load. Close and reopen to retry.'}}
function timesheetEntries(){return [...$('timesheetDays').children].map(day=>({date:day.dataset.day,hours:day.querySelector('.ts-hours').value,notes:day.querySelector('.ts-notes').value.trim()})).filter(e=>e.hours!==''||e.notes).map(e=>({...e,hours:e.hours||'0'}))}
function updateTimesheetTotals(){
 if(!timesheetEdit?.editable)return;let total=0;
 for(const input of $('timesheetDays').querySelectorAll('.ts-hours')){
  const value=input.value,valid=value===''||(/^[0-9]{1,2}(?:[.]5)?$/.test(value)&&Number(value)<=24);
  input.setCustomValidity(valid?'':'Enter whole or half hours from 0 to 24, for example 8 or 8.5.');
  if(valid)total+=Number(value)||0;
 }
 $('timesheetTotal').textContent=timesheetHours(total);
 if(timesheetDirty)$('timesheetSaveState').textContent='Unsaved changes — choose Save draft to keep them.';
}
function setTimesheetBusy(busy){timesheetBusy=busy;$('timesheetForm').querySelectorAll('input,select,textarea,button').forEach(el=>{if(busy){el.dataset.tsDisabled=String(el.disabled);el.disabled=true}else if('tsDisabled' in el.dataset){el.disabled=el.dataset.tsDisabled==='true';delete el.dataset.tsDisabled}})}
async function saveTimesheet(action){
 if(timesheetBusy||!timesheetEdit)return;
 if(['save','submit'].includes(action)&&!$('timesheetForm').reportValidity())return;
 const t=timesheetEdit.sheet;
 const data=['save','submit'].includes(action)?{id:t?.id||null,version:t?.version||0,week_start:timesheetWeek,entries:timesheetEntries(),confirmed:$('timesheetComplete').checked}:{id:t.id,version:t.version,reason:$('timesheetReviewReason')?.value.trim()||'',confirmed:!!$('timesheetReviewed')?.checked,...(action==='approve'?{expected_rate:t.hourly_rate}:{})};
 if(action==='submit'&&!data.confirmed){showError($('timesheetError'),new Error('Tick the confirmation that your week is complete, or use Save draft to keep working.'));return}
 const fingerprint=JSON.stringify({action,data});if(timesheetRequest?.fingerprint!==fingerprint)timesheetRequest={fingerprint,id:crypto.randomUUID()};
 const generation=timesheetGeneration,org=c360Access.membership.organisation_id;setTimesheetBusy(true);$('timesheetError').hidden=true;
 let committed=false;
 try{
  const result=await rpc('timesheet_save',{p_action:action,p_data:data,p_request_id:timesheetRequest.id});if(generation!==timesheetGeneration)return;committed=true;
  // Advance the local version as soon as save is confirmed, even if refresh fails.
  if(action==='save'){timesheetEdit.sheet={...t,...data,...result,owner_user_id:c360Access.user.id};timesheetDirty=false;$('timesheetSaveState').textContent='Draft saved — not submitted.'}
  else{$('timesheetDialog').close();timesheetDirty=false;timesheetHistoryGeneration++;toast(action==='submit'?'Week submitted for approval.':action==='approve'?'Week approved.':'Week returned for correction.')}
  timesheetRequest=null;
  const fresh=await rpc('timesheets_snapshot',{p_week:timesheetWeek});if(generation!==timesheetGeneration)return;if(fresh.organisation_id!==org)throw new Error('Company check failed.');timesheetData=fresh;if(action==='save')timesheetEdit.sheet=fresh.sheets.find(s=>s.id===result.id);render();
 }catch(error){if(generation===timesheetGeneration){if(committed){timesheetData=null;if(action==='save')$('timesheetSaveState').textContent='Draft saved — not submitted. Refresh could not finish; close and refresh to see the latest list.';else{toast('Update saved, but the list could not refresh. Use Refresh.');render()}}else showError($('timesheetError'),error)}}
 finally{setTimesheetBusy(false)}
}
function closeTimesheet(){if(timesheetBusy)return;if(timesheetDirty&&!window.confirm('Discard unsaved changes? Choose Cancel to keep editing and Save draft.'))return;timesheetHistoryGeneration++;timesheetDirty=false;$('timesheetDialog').close()}
async function downloadTimesheetPdf(id,button){
 if(timesheetBusy)return;button.disabled=true;const generation=timesheetGeneration,org=c360Access.membership.organisation_id,week=timesheetWeek;
 try{const fresh=await rpc('timesheets_snapshot',{p_week:week});if(generation!==timesheetGeneration)return;if(fresh.organisation_id!==org)throw new Error('Company check failed.');const sheets=id?fresh.sheets.filter(t=>t.id===id):fresh.sheets;if(id&&!sheets.length)throw new Error('Timesheet unavailable.');if(!id&&!fresh.can_review)throw new Error('Office report access required.');const blob=await buildTimesheetPdf(sheets,c360Access.organisation.name,week,fresh.can_review,!id);if(generation!==timesheetGeneration)return;downloadBlob(blob,`Construct360-timesheet-${week}-${id?sheets[0].staff_name:'company'}.pdf`);toast('Downloaded saved records only. Unsaved edits are not included.')}
 catch(error){toast(friendlyError(error))}finally{button.disabled=false}
}
function initialiseTimesheets(){
 // Reject unsupported typing/paste before changing the field. The input
 // fallback covers mobile keyboards, drag/drop and non-cancellable events.
 const allowed=value=>value===''||(/^[0-9]{1,2}(?:[.]5?)?$/.test(value)&&Number(value)<=24);
 const hoursInput=target=>target instanceof HTMLInputElement&&target.matches('#timesheetDays .ts-hours');
 document.addEventListener('focusin',event=>{if(hoursInput(event.target)){const el=event.target;el.dataset.lastHours=allowed(el.value)?el.value:''}},true);
 document.addEventListener('beforeinput',event=>{
  const el=event.target;if(!hoursInput(el)||event.data==null)return;
  const next=el.value.slice(0,el.selectionStart)+event.data+el.value.slice(el.selectionEnd);
  if(!allowed(next)){event.preventDefault();toast('Use whole or half hours, from 0 to 24.')}
 },true);
 document.addEventListener('input',event=>{
  const el=event.target;if(!hoursInput(el))return;
  if(!allowed(el.value)){el.value=el.dataset.lastHours||'';event.stopImmediatePropagation();toast('Use whole or half hours, from 0 to 24.')}
  else el.dataset.lastHours=el.value;
 },true);
 document.addEventListener('focusout',event=>{
  const el=event.target;if(hoursInput(el)&&el.value.endsWith('.')){el.value=el.value.slice(0,-1);el.dataset.lastHours=el.value;updateTimesheetTotals()}
 },true);
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-timesheet]');if(b&&!timesheetBusy){const id=b.dataset.id;({previous:()=>changeTimesheetWeek(addDays(timesheetWeek,-7)),next:()=>changeTimesheetWeek(addDays(timesheetWeek,7)),retry:()=>{timesheetData=null;renderTimesheets()},new:()=>openTimesheet(),edit:()=>openTimesheet(id),view:()=>openTimesheet(id,'view'),review:()=>openTimesheet(id,'review'),approve:()=>saveTimesheet('approve'),return:()=>saveTimesheet('return'),pdf:()=>downloadTimesheetPdf(id,b),report:()=>downloadTimesheetPdf(null,b)})[b.dataset.timesheet]?.();return}

 });
 $('timesheetForm').onsubmit=event=>{event.preventDefault();saveTimesheet(event.submitter?.id==='timesheetSubmit'?'submit':'save')};
 ['timesheetClose','timesheetCancel'].forEach(id=>$(id).onclick=closeTimesheet);
 $('timesheetDialog').addEventListener('cancel',event=>{event.preventDefault();closeTimesheet()});
 window.addEventListener('beforeunload',event=>{if(timesheetDirty){event.preventDefault();event.returnValue=''}});
}

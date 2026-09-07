/* v15: company vehicles. RPCs independently enforce every permission. */
const VEHICLE_CHECKS=[['tyres','Tyres & wheels'],['lights','Lights & indicators'],['brakes','Brakes'],['steering','Steering'],['mirrors','Mirrors & glass'],['wipers','Wipers & washers'],['horn','Horn'],['fluids','Fluid levels & leaks'],['body_load','Bodywork & load security'],['seatbelts','Seatbelts'],['other','Other vehicle-specific checks']];
let vehicleData=null,vehicleLoading=false,vehicleGeneration=0,vehicleEdit=null,vehicleRequest=null,vehicleBusy=false,vehicleHistoryGeneration=0;
function clearVehicles(){vehicleGeneration++;vehicleHistoryGeneration++;vehicleData=null;vehicleLoading=false;vehicleEdit=null;vehicleRequest=null;$('vehicleDialog').close();$('vehicleFields').replaceChildren()}
function vehicleBy(id){return vehicleData?.vehicles.find(v=>v.id===id)}
function vehicleDay(value=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}
function vehicleTime(value){return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}
async function loadVehicles(){
  if(vehicleLoading)return;vehicleLoading=true;const generation=++vehicleGeneration,org=c360Access?.membership?.organisation_id;
  try{const data=await rpc('vehicles_snapshot');if(generation!==vehicleGeneration)return;if(data.organisation_id!==org)throw new Error('Company check failed. No vehicles displayed.');vehicleData=data;if(currentPage==='vehicles')renderVehicles()}
  catch(error){if(generation===vehicleGeneration&&currentPage==='vehicles')$('records').innerHTML=`<div class="empty"><h2>Vehicles could not be loaded</h2><p>${esc(friendlyError(error))}</p><button data-vehicle="retry">Try again</button></div>`}
  finally{if(generation===vehicleGeneration)vehicleLoading=false}
}
function vehicleButton(action,label,id='',style='secondary'){return `<button type="button" class="${style}" data-vehicle="${action}" data-id="${esc(id)}">${esc(label)}</button>`}
function vehicleWarnings(v){
  const today=vehicleDay(),soon=addDays(today,30),warnings=[];
  for(const [key,label] of [['mot_date','MOT'],['tax_date','Tax'],['insurance_date','Insurance'],['service_date','Service']]){
    if(!v[key])warnings.push(`${label}: date not set`);
    else if(v[key]<today)warnings.push(`${label}: overdue (${dateLabel(v[key])})`);
    else if(v[key]<=soon)warnings.push(`${label}: due ${dateLabel(v[key])}`);
  }
  return warnings;
}
function vehicleSafety(v){return v.open_defects>0?`${v.open_defects} open defect report${v.open_defects===1?'':'s'} · Do not use—review required`:v.availability==='Unavailable'?'Unavailable':'No open defects recorded'}
function renderVehicles(){
  document.querySelectorAll('[data-page]').forEach(b=>{const active=b.dataset.page==='vehicles';b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
  $('pageTitle').textContent='Vehicles';$('pageSubtitle').textContent='Your company fleet, daily checks and defect history.';
  $('addButton').hidden=!isManager();$('addButton').textContent='+ Add vehicle';$('filters').hidden=false;$('statusFilterLabel').hidden=true;$('clientFilterLabel').hidden=true;
  if(!vehicleData){$('records').innerHTML='<div class="empty" role="status">Loading company vehicles…</div>';loadVehicles();return}
  const term=$('recordSearch').value.trim().toLowerCase(),view=$('archiveFilter').value;
  const visible=vehicleData.vehicles.filter(v=>(view==='all'||v.archived===(view==='archived'))&&[v.registration,v.name,v.make_model,v.assigned_staff_name].join(' ').toLowerCase().includes(term));
  const active=vehicleData.vehicles.filter(v=>!v.archived);
  $('records').innerHTML=`<div class="vehicle-summary"><div><strong>${active.length}</strong><span>Current vehicles</span></div><div><strong>${active.filter(v=>v.open_defects>0).length}</strong><span>With open defects</span></div><div><strong>${active.filter(v=>v.last_inspection_at&&vehicleDay(v.last_inspection_at)===vehicleDay()).length}</strong><span>Checked today</span></div></div><div class="notice">Everyone in your company can carry out inspections. Check the vehicle before use and follow your company’s procedures. A saved check is not a roadworthiness certificate. Dates are entered manually.</div>${visible.length?`<div class="vehicle-grid">${visible.map(vehicleCard).join('')}</div>`:`<div class="empty"><h2>${vehicleData.vehicles.length?'No vehicles match this view':'Your fleet starts here'}</h2><p>${vehicleData.vehicles.length?'Try a different search or choose All records.':isManager()?'Add a vehicle to start recording daily inspections.':'Your Admin or Operations team can add company vehicles here.'}</p>${isManager()&&!vehicleData.vehicles.length?vehicleButton('new','+ Add vehicle'):''}</div>`}`;
}
function vehicleCard(v){const warnings=vehicleWarnings(v);return `<article class="vehicle-card"><div class="vehicle-card-head"><span class="vehicle-reg">${esc(v.registration)}</span><span class="badge ${v.archived?'archived':''}">${esc(v.archived?'Archived':v.vehicle_type)}</span></div><h2>${esc(v.name)}</h2><p class="muted">${esc(v.make_model||'Make / model not set')}</p><p class="${v.open_defects?'vehicle-danger':'vehicle-status'}">${esc(vehicleSafety(v))}</p><dl class="vehicle-facts"><div><dt>Mileage</dt><dd>${Number(v.mileage).toLocaleString('en-GB')} mi</dd></div><div><dt>Assigned to</dt><dd>${esc(v.assigned_staff_name||'Unassigned')}</dd></div><div><dt>Last inspection</dt><dd>${v.last_inspection_at?esc(vehicleTime(v.last_inspection_at)):'Not yet checked'}</dd></div></dl>${warnings.length?`<details class="vehicle-dates"><summary>${warnings.length} date reminders</summary><ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`:''}<div class="vehicle-actions">${!v.archived?vehicleButton('inspect','Start inspection',v.id,''):''}${vehicleButton('history','Details / history',v.id)}${isManager()?vehicleButton('edit','Edit',v.id):''}</div></article>`}
function openVehicleDialog(title,mode,record){
  vehicleHistoryGeneration++;vehicleEdit={mode,record};vehicleRequest=null;$('vehicleForm').reset();$('vehicleTitle').textContent=title;$('vehicleError').hidden=true;$('vehicleSave').hidden=mode==='history';$('vehicleSave').textContent=mode==='inspection'?'Submit inspection':mode==='resolve'?'Resolve defect':'Save';$('vehicleFields').replaceChildren();if(!$('vehicleDialog').open)$('vehicleDialog').showModal();
}
function vehicleNumber(label,name,value,min=0){return `<div class="field"><label for="v_${name}">${esc(label)} *</label><input id="v_${name}" name="${name}" type="number" min="${min}" max="9999999" step="1" value="${esc(value)}" required inputmode="numeric"></div>`}
function openVehicleEditor(id){
  if(!isManager())return;const v=id?vehicleBy(id):{};if(!v)return;
  openVehicleDialog(v.id?'Edit vehicle':'Add vehicle','vehicle',v);
  const staff=(workspaceData.staff||[]).filter(s=>(s.is_active&&!s.archived)||s.id===v.assigned_staff_id);
  $('vehicleFields').innerHTML=`<div class="formgrid">${vehicleField('Registration','registration',v.registration,{max:20,required:true})}${vehicleField('Vehicle name / fleet reference','name',v.name,{max:160,required:true})}${vehicleSelect('Vehicle type','vehicle_type',['Van','Lorry','Car','Other'].map(x=>[x,x]),v.vehicle_type||'Van')}${vehicleField('Make / model','make_model',v.make_model,{max:160})}${vehicleNumber('Current mileage (miles)','mileage',v.mileage||0,v.mileage||0)}${vehicleSelect('Assigned staff member','assigned_staff_id',[['','Unassigned'],...staff.map(s=>[s.id,s.full_name+(s.archived||!s.is_active?' (inactive)':'')])],v.assigned_staff_id||'')}${vehicleSelect('Availability','availability',[['Available','Available'],['Unavailable','Unavailable']],v.availability||'Available')}${vehicleField('MOT due','mot_date',v.mot_date,{type:'date'})}${vehicleField('Tax due','tax_date',v.tax_date,{type:'date'})}${vehicleField('Insurance renewal','insurance_date',v.insurance_date,{type:'date'})}${vehicleField('Next service','service_date',v.service_date,{type:'date'})}${vehicleField('Vehicle notes (visible to everyone in your company)','notes',v.notes,{textarea:true,max:5000,full:true})}</div><p class="hint">Open defects override “Available”. Editing this record does not resolve defects or change saved inspection history.</p>`;
}
function openVehicleInspection(id){
  const v=vehicleBy(id);if(!v||v.archived)return;
  openVehicleDialog(`Inspect ${v.registration}`,'inspection',v);
  $('vehicleFields').innerHTML=`<p>${esc(v.name)} · ${esc(v.make_model)}</p>${v.open_defects||v.availability==='Unavailable'?`<div class="vehicle-danger">${esc(vehicleSafety(v))}. Do not drive the vehicle to complete these checks.</div>`:''}<p class="hint">Select a result for every item. N/A means genuinely not applicable. Describe failed checks below. Follow the checks specific to your vehicle and company; this is a general checklist.</p>${vehicleNumber('Mileage at inspection (miles)','mileage',v.mileage,v.mileage)}<div class="vehicle-checklist">${VEHICLE_CHECKS.map(([key,label])=>`<fieldset class="vehicle-check"><legend>${esc(label)}</legend><div>${[['pass','OK'],['fail','Defect'],['na','N/A']].map(([value,text])=>`<label><input type="radio" name="check_${key}" value="${value}" required><span>${text}</span></label>`).join('')}</div></fieldset>`).join('')}</div>${vehicleField('Defect details — describe every failed check','defect_details','',{textarea:true,max:5000,full:true})}${vehicleField('Inspection notes / additional checks carried out','notes','',{textarea:true,max:5000,full:true})}<label class="check-label"><input name="confirmed" type="checkbox" required><span>I personally carried out these checks and confirm this record is accurate. Submitted inspections cannot be edited.</span></label>`;
  const update=()=>{$('f_vehicle_defect_details').required=!!$('vehicleFields').querySelector('input[value="fail"]:checked')};$('vehicleFields').querySelectorAll('input[type="radio"]').forEach(i=>i.onchange=update);
}
async function openVehicleHistory(id,offset=0){
  const v=vehicleBy(id);if(!v)return;
  openVehicleDialog(`${v.registration} · details & history`,'history',v);const generation=vehicleHistoryGeneration;
  $('vehicleFields').innerHTML='<p role="status">Loading inspection history…</p>';
  try{
    const history=await rpc('vehicle_history',{p_vehicle_id:id,p_offset:offset});if(generation!==vehicleHistoryGeneration)return;
    if(history.organisation_id!==vehicleData?.organisation_id||history.vehicle_id!==id)throw new Error('Company check failed.');
    $('vehicleFields').innerHTML=`<h3>${esc(v.name)}</h3><p class="${v.open_defects?'vehicle-danger':'vehicle-status'}">${esc(vehicleSafety(v))}</p><p>${esc(v.make_model)} · ${Number(v.mileage).toLocaleString('en-GB')} miles · ${esc(v.availability)}${v.archived?' · Archived':''}</p><p>Assigned: ${esc(v.assigned_staff_name||'Unassigned')}</p><dl class="vehicle-facts">${[['mot_date','MOT'],['tax_date','Tax'],['insurance_date','Insurance'],['service_date','Service']].map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(dateLabel(v[key]))}</dd></div>`).join('')}</dl><p class="vehicle-notes">${esc(v.notes||'No vehicle notes.')}</p>${isManager()?`<div class="vehicle-actions">${vehicleButton('edit','Edit vehicle',id)}${vehicleButton('archive',v.archived?'Restore vehicle':'Archive vehicle',id)}</div>`:''}<h3>Open defects</h3>${history.defects.filter(d=>!d.resolved_at).map(d=>`<article class="vehicle-defect"><p class="vehicle-notes">${esc(d.description)}</p><small>${esc(vehicleTime(d.created_at))}</small>${isManager()?vehicleButton('resolve','Record resolution',d.id):'<p class="hint">Ask Admin or Operations to review and resolve this report.</p>'}</article>`).join('')||'<p>No open defects recorded.</p>'}<h3>Inspection history (${history.total})</h3>${history.inspections.map(i=>inspectionHistoryCard(i,history.defects)).join('')||'<p>No inspections recorded yet.</p>'}<div class="vehicle-actions">${offset>0?`<button type="button" data-vehicle="history-page" data-id="${esc(id)}" data-offset="${Math.max(0,offset-25)}" class="secondary">Newer inspections</button>`:''}${offset+25<history.total?`<button type="button" data-vehicle="history-page" data-id="${esc(id)}" data-offset="${offset+25}" class="secondary">Older inspections</button>`:''}</div>`;
    vehicleEdit.history=history;
  }catch(error){if(generation===vehicleHistoryGeneration){$('vehicleFields').innerHTML='<p>History could not be loaded. Close and try again.</p>';showError($('vehicleError'),error)}}
}
function inspectionHistoryCard(i,defects){const d=defects.find(d=>d.inspection_id===i.id);return `<details class="inspection-history"><summary><strong>${esc(vehicleTime(i.submitted_at))}</strong><span>${i.has_defects?'Defects reported':'No defects reported'} · ${esc(i.inspector_name)}</span></summary><p>${esc(i.registration)} · ${Number(i.mileage).toLocaleString('en-GB')} miles · Checklist v${i.checklist_version}</p><dl class="inspection-results">${VEHICLE_CHECKS.map(([key,label])=>`<div><dt>${esc(label)}</dt><dd class="${i.checks[key]==='fail'?'warning-text':''}">${esc({pass:'OK',fail:'Defect',na:'N/A'}[i.checks[key]]||'Unknown')}</dd></div>`).join('')}</dl><p class="vehicle-notes">${esc(i.notes||'No additional notes.')}</p>${d?`<div class="vehicle-defect"><strong>${d.resolved_at?'Resolved':'Open defect'}</strong><p class="vehicle-notes">${esc(d.description)}</p>${d.resolved_at?`<p class="vehicle-notes">${esc(d.resolution)}</p><small>${esc(d.resolved_by_name)} · ${esc(vehicleTime(d.resolved_at))}</small>`:''}</div>`:''}</details>`}
function openVehicleResolution(id){const d=vehicleEdit?.history?.defects.find(d=>d.id===id&&!d.resolved_at);if(!d||!isManager())return;openVehicleDialog('Resolve defect','resolve',d);$('vehicleFields').innerHTML=`<p class="vehicle-notes">${esc(d.description)}</p>${vehicleField('Action taken / repair details','resolution','',{textarea:true,required:true,max:5000,full:true})}<label class="check-label"><input type="checkbox" name="confirmed" required><span>I confirm this defect has been addressed. Other open defects and vehicle availability remain unchanged.</span></label>`;$('f_vehicle_resolution').required=true}
function openVehicleArchive(id){const v=vehicleBy(id);if(!v||!isManager())return;openVehicleDialog(v.archived?'Restore vehicle?':'Archive vehicle?','archive',v);$('vehicleFields').innerHTML=`<p>${esc(v.registration)} · ${esc(v.name)}</p><p>${v.archived?'This returns the vehicle to current records.':'The vehicle will be hidden from current records and cannot receive new inspections until restored. History and open defects are retained.'}</p>`;$('vehicleSave').textContent=v.archived?'Restore vehicle':'Archive vehicle'}
async function saveVehicleForm(event){
  event.preventDefault();if(vehicleBusy||!vehicleEdit||vehicleEdit.mode==='history')return;
  const {mode,record}=vehicleEdit,f=new FormData($('vehicleForm'));let data={};
  if(mode==='vehicle'){data=Object.fromEntries(f);data.id=record.id||null;data.version=record.version||0}
  if(mode==='archive')data={id:record.id,version:record.version,archived:!record.archived};
  if(mode==='inspection')data={id:record.id,mileage:f.get('mileage'),checks:Object.fromEntries(VEHICLE_CHECKS.map(([key])=>[key,f.get('check_'+key)])),defect_details:f.get('defect_details'),notes:f.get('notes'),confirmed:f.get('confirmed')==='on'};
  if(mode==='resolve')data={id:record.id,resolution:f.get('resolution'),confirmed:f.get('confirmed')==='on'};
  const fingerprint=JSON.stringify({mode,data});if(vehicleRequest?.fingerprint!==fingerprint)vehicleRequest={fingerprint,id:crypto.randomUUID()};
  const generation=vehicleGeneration;vehicleBusy=true;$('vehicleError').hidden=true;['vehicleSave','vehicleClose','vehicleCancel'].forEach(id=>$(id).disabled=true);
  try{await rpc('vehicle_save',{p_kind:mode,p_data:data,p_request_id:vehicleRequest.id});if(generation!==vehicleGeneration)return;$('vehicleDialog').close();vehicleHistoryGeneration++;vehicleData=null;vehicleRequest=null;toast(mode==='inspection'?'Inspection saved. Any defects remain flagged until resolved.':'Vehicle update saved.');render();}
  catch(error){if(generation===vehicleGeneration)showError($('vehicleError'),error)}
  finally{vehicleBusy=false;['vehicleSave','vehicleClose','vehicleCancel'].forEach(id=>$(id).disabled=false)}
}
function initialiseVehicles(){
  document.addEventListener('click',event=>{const b=event.target.closest('[data-vehicle]');if(!b||vehicleBusy)return;const id=b.dataset.id;
    ({new:()=>openVehicleEditor(),edit:()=>openVehicleEditor(id),inspect:()=>openVehicleInspection(id),history:()=>openVehicleHistory(id),'history-page':()=>openVehicleHistory(id,Number(b.dataset.offset)),archive:()=>openVehicleArchive(id),resolve:()=>openVehicleResolution(id),retry:()=>{vehicleData=null;renderVehicles()}})[b.dataset.vehicle]?.();
  });
  $('vehicleForm').onsubmit=saveVehicleForm;
  ['vehicleClose','vehicleCancel'].forEach(id=>$(id).onclick=()=>{if(!vehicleBusy){vehicleHistoryGeneration++;$('vehicleDialog').close()}});
  $('vehicleDialog').addEventListener('cancel',event=>{if(vehicleBusy)event.preventDefault();else vehicleHistoryGeneration++});
}
// Namespace dialog IDs so closed Client/Staff forms cannot capture vehicle labels.
function vehicleField(label,name,value,options){return field(label,'vehicle_'+name,value,options).replaceAll(`name="vehicle_${name}"`,`name="${name}"`)}
function vehicleSelect(label,id,options,value,required){return selectField(label,'vehicle_'+id,options,value,required).replaceAll(`name="vehicle_${id}"`,`name="${id}"`)}

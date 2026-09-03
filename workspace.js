/* Company-backed Clients & Jobs. No operational records are stored in localStorage. */
const $=id=>document.getElementById(id);
const modal=$('modal'),modalbox=$('modalbox');
const escapeHtmlAttr=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeHtmlAttr;
const JOB_STATUSES=['Quotation','Acceptance & Planning','Delivery & Erection','Handover & Initial Inspection','Dismantling & Removal','Completion/Closed','Cancelled','Completed'];
const CLOSED_STATUSES=new Set(['Completion/Closed','Cancelled','Completed']);
let workspaceData={clients:[],contacts:[],jobs:[],assignments:[]};
let currentPage='overview',editState=null,pendingSave=null,archiveState=null,importState=null,loading=false,saving=false,toastTimer,loadGeneration=0;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500)}
function closeModal(){modal.classList.remove('show');$('accountButton').focus()}
function showLogin(){clearWorkspace();location.replace('/')}
function clearWorkspace(){loadGeneration++;workspaceData={clients:[],contacts:[],jobs:[],assignments:[]};$('workspaceApp').hidden=true;$('records').replaceChildren();['editor','transferDialog','confirmDialog'].forEach(id=>$(id).close());modal.classList.remove('show')}
function showError(element,error){element.textContent=friendlyError(error);element.hidden=false}
function friendlyError(error){
  if(error?.code==='23505')return 'This client or job code already exists. Nothing was changed. Refresh your records before trying again.';
  if(error?.code==='23514')return 'Check required fields, text lengths, job status and date order. Nothing was changed.';
  if(error?.code==='23502')return 'Complete all required fields. Nothing was changed.';
  if(error?.code==='PGRST202'||/workspace_.*schema cache/i.test(error?.message||''))return 'The Clients & Jobs database update is not installed yet. Run migration 005_clients_jobs.sql in Supabase, then refresh.';
  return error?.message||'The connection could not be completed. Your form is still here; try again.';
}
async function rpc(name,args){
  const {data,error}=await authClient().rpc(name,args);
  if(error){if(/Active company.*access required/.test(error.message)){clearWorkspace();$('accessState').hidden=false;$('accessState').innerHTML='<h1>Workspace access unavailable</h1><p>Your role or company access has changed.</p><a href="/">Return to sign in</a>'}throw error}
  return data;
}
async function loadWorkspace(){
  if(loading)return;
  loading=true;$('refreshButton').disabled=true;const generation=++loadGeneration;
  try{
    if(!authClient())throw new Error('Supabase connection is missing. Check the existing Vercel public configuration.');
    const access=await fetchCurrentAccess();
    if(generation!==loadGeneration)return;
    if(!access.user||!access.membership?.is_active||access.organisation?.status!=='active'||!['admin','operations'].includes(access.membership.role)||!access.user.email_confirmed_at||access.user.user_metadata?.needs_password_setup){showLogin();return}
    const snapshot=await rpc('workspace_snapshot');
    if(generation!==loadGeneration)return;
    if(snapshot.organisation_id!==access.membership.organisation_id)throw new Error('Company check failed. No records were displayed.');
    c360Access=access;workspaceData=snapshot;
    $('companyName').textContent=access.organisation.name;$('companyRole').textContent=access.membership.role;
    applyAccessToUi();$('legacyLink').hidden=access.organisation.workspace_mode!=='prototype';
    $('transferButton').hidden=access.membership.role!=='admin';
    $('accessState').hidden=true;$('workspaceApp').hidden=false;$('workspaceMessage').hidden=true;
    const selected=$('clientFilter').value;
    $('clientFilter').innerHTML='<option value="all">All clients</option>'+snapshot.clients.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    if(snapshot.clients.some(c=>c.id===selected))$('clientFilter').value=selected;
    render();
  }catch(error){
    if(generation!==loadGeneration)return;
    if($('workspaceApp').hidden){$('accessState').hidden=false;$('accessState').innerHTML=`<h1>Workspace could not be loaded</h1><p>${esc(friendlyError(error))}</p><button onclick="loadWorkspace()">Try again</button> <a href="/">Return to sign in</a>`}
    else showError($('workspaceMessage'),error);
    throw error;
  }finally{loading=false;$('refreshButton').disabled=false}
}
function safeRefresh(){loadWorkspace().catch(()=>{})}
function clientFor(id){return workspaceData.clients.find(c=>c.id===id)}
function contactsFor(id){return workspaceData.contacts.filter(c=>c.client_id===id)}
function assignmentsFor(id){return workspaceData.assignments.filter(a=>a.job_id===id).map(a=>a.contact_id)}
function dateLabel(value){return value?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'Not set'}
function dateRange(job){return !job.start_date&&!job.end_date?'Dates not set':`${dateLabel(job.start_date)} → ${dateLabel(job.end_date)}`}
function setPage(page){currentPage=page;$('recordSearch').value='';$('archiveFilter').value='active';$('statusFilter').value='all';$('clientFilter').value='all';render()}
function render(){
  document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===currentPage);b.setAttribute('aria-current',b.dataset.page===currentPage?'page':'false')});
  $('pageTitle').textContent={overview:'Overview',clients:'Clients',jobs:'Jobs'}[currentPage];
  $('pageSubtitle').textContent={overview:'Your clients and jobs, in one place.',clients:'Company relationships, contact details and site contacts.',jobs:'Plan your work and keep every job connected to its client.'}[currentPage];
  $('addButton').textContent=currentPage==='clients'?'+ New client':'+ New job';
  $('filters').hidden=currentPage==='overview';$('statusFilterLabel').hidden=currentPage!=='jobs';$('clientFilterLabel').hidden=currentPage!=='jobs';
  $('stats').hidden=currentPage!=='overview';
  const activeClients=workspaceData.clients.filter(c=>!c.archived),activeJobs=workspaceData.jobs.filter(j=>!j.archived&&!CLOSED_STATUSES.has(j.status));
  $('stats').innerHTML=`<div class="stat"><span>Current clients</span><strong>${activeClients.length}</strong><small>Company relationships</small></div><div class="stat"><span>Open jobs</span><strong>${activeJobs.length}</strong><small>Quotation to dismantling</small></div><div class="stat"><span>Completed jobs</span><strong>${workspaceData.jobs.filter(j=>!j.archived&&['Completed','Completion/Closed'].includes(j.status)).length}</strong><small>Closed and completed</small></div>`;
  const isClient=currentPage==='clients',term=$('recordSearch').value.trim().toLowerCase(),archive=$('archiveFilter').value;
  let records=isClient?workspaceData.clients:workspaceData.jobs;
  records=records.filter(r=>currentPage==='overview'?!r.archived:archive==='all'||r.archived===(archive==='archived'));
  if(currentPage!=='overview')records=records.filter(r=>{
    const search=isClient?[r.code,r.name,r.contact,r.email,r.address,r.phone]:[r.code,r.site,clientFor(r.client_id)?.name,r.scaffold_type,r.team];
    return search.join(' ').toLowerCase().includes(term)&&(isClient||($('statusFilter').value==='all'||r.status===$('statusFilter').value))&&(isClient||$('clientFilter').value==='all'||r.client_id===$('clientFilter').value);
  });
  if(currentPage==='overview')records=[...records].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,6);
  if(!records.length&&!term&&archive==='active'&&(isClient?workspaceData.clients:workspaceData.jobs).some(r=>r.archived)&&$('statusFilter').value==='all'&&$('clientFilter').value==='all'){
    $('records').innerHTML=`<div class="empty"><h2>No current ${isClient?'clients':'jobs'}</h2><p>Your archived records are still saved. Open ${isClient?'Clients':'Jobs'} and choose Archived records in the View filter to restore them.</p></div>`;return;
  }
  if(!records.length){
    const isFiltered=term||archive!=='active'||$('statusFilter').value!=='all'||$('clientFilter').value!=='all';
    $('records').innerHTML=`<div class="empty"><p class="eyebrow">${isFiltered?'NO MATCHES':'READY WHEN YOU ARE'}</p><h2>${isFiltered?'No records match this view':isClient?'Add your first client':activeClients.length?'Create your first job':'Start with your first client'}</h2><p>${isFiltered?'Try another search or switch the filters.':activeClients.length&&!isClient?'Choose a client, add a site and set the job dates. Your team will see the same saved record.':'Your workspace starts empty. Add a client and their contacts, then create a job. No prototype demonstration records are added automatically.'}</p>${isFiltered?'':`<button data-action="new" data-kind="${isClient||!activeClients.length?'client':'job'}">${isClient||!activeClients.length?'+ New client':'+ New job'}</button>`}</div>`;return;
  }
  $('records').innerHTML=`<div class="records-heading"><h2>${currentPage==='overview'?'Recently updated jobs':isClient?'Client directory':'Job register'}</h2><span>${records.length} ${records.length===1?'record':'records'}</span></div><div class="record-list">${records.map(r=>isClient?clientCard(r):jobCard(r)).join('')}</div>`;
}
function recordActions(kind,r){return `<div class="record-actions"><button class="secondary" data-action="edit" data-kind="${kind}" data-id="${esc(r.id)}">View / edit</button><button class="text-button" data-action="archive" data-kind="${kind}" data-id="${esc(r.id)}">${r.archived?'Restore':'Archive'}</button>${kind==='client'&&!r.archived?`<button class="text-button" data-action="new-job" data-id="${esc(r.id)}">+ Job</button>`:''}</div>`}
function clientCard(c){return `<article class="record"><div><div class="record-code">CLIENT ${esc(c.code)} ${c.archived?'· ARCHIVED':''}</div><span class="record-title">${esc(c.name)}</span><div class="record-sub">${esc(c.address||'Address not added')}</div></div><div class="record-side">${esc(c.contact||'Primary contact not added')}<br>${esc(c.email||c.phone||'Contact details not added')}<div class="record-sub">${contactsFor(c.id).length} site contacts · ${workspaceData.jobs.filter(j=>j.client_id===c.id&&!j.archived).length} current jobs</div></div>${recordActions('client',c)}</article>`}
function jobCard(j){return `<article class="record"><div><div class="record-code">JOB ${esc(j.code)}</div><span class="record-title">${esc(j.site)}</span><div class="record-sub">${esc(clientFor(j.client_id)?.name||'Client unavailable')} · ${esc(j.scaffold_type||'Scaffold type not set')}</div></div><div class="record-side"><span class="badge ${j.archived?'archived':CLOSED_STATUSES.has(j.status)?'completed':''}">${esc(j.archived?'Archived':j.status)}</span><div class="date-range">${esc(dateRange(j))}</div><div class="record-sub">${esc(j.team||'Team not assigned')}</div></div>${recordActions('job',j)}</article>`}
function field(label,name,value='',options={}){
  const {type='text',max=180,required=false,full=false,textarea=false}=options;
  return `<div class="field ${full?'full':''}"><label for="f_${name}">${esc(label)}${required?' *':''}</label>${textarea?`<textarea id="f_${name}" name="${name}" maxlength="${max}">${esc(value)}</textarea>`:`<input id="f_${name}" name="${name}" type="${type}" maxlength="${max}" value="${esc(value)}" ${required?'required':''}>`}</div>`;
}
function openEditor(kind,id=null,clientId=null){
  const record=id?(kind==='client'?workspaceData.clients:workspaceData.jobs).find(r=>r.id===id):null;
  if(id&&!record)return;
  if(kind==='job'&&!record&&!workspaceData.clients.some(c=>!c.archived)){toast('Add a client before creating a job.');openEditor('client');return}
  editState={kind,record};pendingSave=null;$('formError').hidden=true;$('recordForm').reset();
  $('editorTitle').textContent=record?`Edit ${kind}`:`New ${kind}`;$('editorCode').textContent=record?`${kind.toUpperCase()} ${record.code}${record.archived?' · ARCHIVED':''}`:'CODE ASSIGNED WHEN SAVED';
  if(kind==='client'){
    const c=record||{};
    $('editorFields').innerHTML=`<div class="formgrid">${field('Company / client name','name',c.name,{required:true,max:160,full:true})}${field('Primary contact','contact',c.contact,{max:120})}${field('Phone','phone',c.phone,{type:'tel',max:60})}${field('Email','email',c.email,{type:'email',max:254,full:true})}${field('Address','address',c.address,{textarea:true,max:1000,full:true})}${field('Notes','notes',c.notes,{textarea:true,max:5000,full:true})}</div><div class="form-section"><h3>Site contacts</h3><button id="addContact" type="button" class="secondary">+ Add contact</button></div><p class="hint">Assign these contacts to this client’s jobs. Contacts already assigned to jobs cannot be removed here until unassigned.</p><div id="contactFields"></div>`;
    if(record)contactsFor(record.id).forEach(addContactFields);
    $('addContact').onclick=()=>addContactFields();
  }else{
    const j=record||{},selected=j.client_id||clientId||workspaceData.clients.find(c=>!c.archived)?.id;
    const available=workspaceData.clients.filter(c=>!c.archived||c.id===j.client_id);
    $('editorFields').innerHTML=`<div class="formgrid"><div class="field full"><label for="jobClient">Client *</label><select id="jobClient" name="client_id" required ${record?'disabled':''}>${available.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.code)} · ${esc(c.name)}${c.archived?' (archived)':''}</option>`).join('')}</select></div>${field('Site / job name','site',j.site,{required:true,full:true})}${field('Scaffold type','scaffold_type',j.scaffold_type,{full:true})}${field('Start date','start_date',j.start_date,{type:'date'})}${field('End date','end_date',j.end_date,{type:'date'})}<div class="field"><label for="jobStatus">Status *</label><select name="status" id="jobStatus">${JOB_STATUSES.map(s=>`<option ${s===(j.status||'Quotation')?'selected':''}>${esc(s)}</option>`).join('')}</select></div>${field('Team label (not scheduled)','team',j.team,{max:120})}${field('Job notes','notes',j.notes,{textarea:true,max:5000,full:true})}</div><h3 style="margin-top:24px">Site contacts for this job</h3><div id="jobContacts"></div><p class="hint">Team labels are notes only. Staff assignment, scheduling, photos, RAMS and drawings are not connected in this release.</p>`;
    renderJobContacts(selected,record?assignmentsFor(record.id):[]);$('jobClient').onchange=()=>renderJobContacts($('jobClient').value,[]);
    $('f_start_date').onchange=()=>{$('f_end_date').min=$('f_start_date').value};$('f_end_date').min=j.start_date||'';
  }
  $('editor').showModal();
}
function addContactFields(c={}){
  const id=c.id||crypto.randomUUID(),fieldset=document.createElement('fieldset');fieldset.className='contact-card';fieldset.dataset.contactId=id;
  fieldset.innerHTML=`<legend>Site contact</legend><div class="formgrid">${field('Name','contact_name_'+id,c.name,{max:120,required:true})}${field('Position / role','contact_role_'+id,c.role,{max:120})}${field('Phone','contact_phone_'+id,c.phone,{max:60,type:'tel'})}${field('Email','contact_email_'+id,c.email,{max:254,type:'email'})}${field('Notes','contact_notes_'+id,c.notes,{max:3000,textarea:true,full:true})}</div><button type="button" class="remove-contact">Remove this contact</button>`;
  fieldset.querySelector('button').onclick=()=>{fieldset.remove();$('addContact').focus()};$('contactFields').append(fieldset);
}
function renderJobContacts(clientId,selected){const contacts=contactsFor(clientId);$('jobContacts').innerHTML=contacts.length?contacts.map(c=>`<label class="check-label"><input type="checkbox" name="contact_ids" value="${esc(c.id)}" ${selected.includes(c.id)?'checked':''}><span><strong>${esc(c.name)}</strong>${c.role?' · '+esc(c.role):''}<br><span class="hint">${esc([c.email,c.phone].filter(Boolean).join(' · '))}</span></span></label>`).join(''):'<p class="hint">No site contacts yet. Add them on the client record first.</p>'}
function formData(){
  const f=new FormData($('recordForm')),r=editState.record;
  const data={id:r?.id||null,version:r?.version||0,archived:r?.archived||false};
  const fields=editState.kind==='client'?['name','contact','phone','email','address','notes']:['site','scaffold_type','start_date','end_date','status','team','notes'];
  fields.forEach(k=>data[k]=String(f.get(k)||'').trim());
  if(editState.kind==='client')data.contacts=[...$('contactFields').children].map(el=>{const id=el.dataset.contactId;return Object.fromEntries([['id',id],...['name','role','phone','email','notes'].map(k=>[k,String(f.get('contact_'+k+'_'+id)||'').trim()])])});
  else {data.client_id=r?.client_id||$('jobClient').value;data.contact_ids=f.getAll('contact_ids')}
  return data;
}
async function saveForm(event){
  event.preventDefault();if(saving)return;
  const data=formData(),fingerprint=JSON.stringify(data);
  if(!pendingSave||pendingSave.fingerprint!==fingerprint)pendingSave={fingerprint,id:crypto.randomUUID()};
  saving=true;$('formError').hidden=true;$('saveRecord').disabled=true;$('saveRecord').textContent='Saving…';
  $('closeEditor').disabled=$('cancelEditor').disabled=true;
  try{
    const result=await rpc('workspace_save',{p_kind:editState.kind,p_data:data,p_request_id:pendingSave.id});
    $('editor').close();toast(`Saved ${editState.kind} ${result.code}.`);pendingSave=null;safeRefresh();
  }catch(error){showError($('formError'),error)}
  finally{saving=false;$('saveRecord').disabled=false;$('saveRecord').textContent='Save';$('closeEditor').disabled=$('cancelEditor').disabled=false}
}
function payloadFor(kind,r){
  const fields=kind==='client'?['id','version','code','name','contact','phone','email','address','notes','archived']:['id','version','code','client_id','site','scaffold_type','start_date','end_date','status','team','notes','archived'];
  const data=Object.fromEntries(fields.map(k=>[k,r[k]]));
  if(kind==='client')data.contacts=contactsFor(r.id).map(c=>Object.fromEntries(['id','name','role','phone','email','notes'].map(k=>[k,c[k]])));
  else data.contact_ids=assignmentsFor(r.id);
  return data;
}
function askArchive(kind,id){
  const r=(kind==='client'?workspaceData.clients:workspaceData.jobs).find(x=>x.id===id);if(!r)return;
  archiveState={kind,data:{...payloadFor(kind,r),archived:!r.archived},request:crypto.randomUUID()};
  $('confirmTitle').textContent=`${r.archived?'Restore':'Archive'} ${kind} ${r.code}?`;
  $('confirmText').textContent=r.archived?'This record will return to current records.':`This hides the ${kind} from current records, but keeps all its details. You can restore it from Archived records.${kind==='client'?' Its jobs must be archived first.':''}`;
  $('confirmAction').textContent=r.archived?'Restore record':'Archive record';$('confirmError').hidden=true;$('confirmDialog').showModal();
}
async function confirmArchive(){
  if(saving)return;saving=true;$('confirmAction').disabled=true;$('cancelConfirm').disabled=true;
  try{await rpc('workspace_save',{p_kind:archiveState.kind,p_data:archiveState.data,p_request_id:archiveState.request});$('confirmDialog').close();toast(archiveState.data.archived?'Record archived.':'Record restored.');safeRefresh()}
  catch(error){showError($('confirmError'),error)}finally{saving=false;$('confirmAction').disabled=false;$('cancelConfirm').disabled=false}
}
function transferBundle(){
  return {format:'construct360-transfer-v1',source:'company-workspace',organisation_id:workspaceData.organisation_id,company_name:c360Access.organisation.name,exported_at:new Date().toISOString(),
    clients:workspaceData.clients.map(c=>({...Object.fromEntries(['code','name','contact','phone','email','address','notes','archived'].map(k=>[k,c[k]])),contacts:contactsFor(c.id).map(t=>({...Object.fromEntries(['name','role','phone','email','notes'].map(k=>[k,t[k]])),key:t.id}))})),
    jobs:workspaceData.jobs.map(j=>({...Object.fromEntries(['code','site','scaffold_type','start_date','end_date','status','team','notes','archived'].map(k=>[k,j[k]])),client_code:clientFor(j.client_id).code,contact_keys:assignmentsFor(j.id)}))};
}
function downloadJson(data,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function exportRecords(){
  if(loading){toast('Wait for the current refresh to finish, then export.');return}
  $('exportButton').disabled=true;
  try{await loadWorkspace();downloadJson(transferBundle(),`Construct360-clients-jobs-${new Date().toISOString().slice(0,10)}.json`);toast('Download prepared. Keep this file private.')}catch(error){showError($('importError'),error)}finally{$('exportButton').disabled=false}
}
function openTransfer(){importState=null;$('importFile').value='';$('importPreview').replaceChildren();$('importError').hidden=true;$('importCheckLabel').hidden=true;$('importCheck').checked=false;$('importButton').disabled=true;$('transferCompany').textContent=c360Access.organisation.name;$('transferDialog').showModal()}
async function reviewImport(){
  importState=null;$('importButton').disabled=true;$('importError').hidden=true;$('importCheckLabel').hidden=true;$('importCheck').checked=false;$('importPreview').replaceChildren();
  const file=$('importFile').files[0];if(!file)return;
  try{
    if(file.size>5000000)throw new Error('Choose a file smaller than 5 MB.');
    const bundle=JSON.parse(await file.text());
    if(bundle.format!=='construct360-transfer-v1'||!Array.isArray(bundle.clients)||!Array.isArray(bundle.jobs))throw new Error('Choose a Construct360 Clients & Jobs transfer file, not a full prototype backup.');
    if(bundle.organisation_id!==c360Access.organisation.id)throw new Error('This file was exported for a different company. It cannot be imported here.');
    if(bundle.clients.length>500||bundle.jobs.length>500)throw new Error('Use no more than 500 clients and 500 jobs per import.');
    if(!bundle.clients.length&&!bundle.jobs.length)throw new Error('This file contains no records to import.');
    const codes=new Set();for(const c of bundle.clients){if(codes.has(c.code)||workspaceData.clients.some(x=>x.code===c.code))throw new Error(`Client code ${c.code} already exists or appears twice. No records imported.`);codes.add(c.code)}
    for(const j of bundle.jobs)if(!codes.has(j.client_code))throw new Error(`Job ${j.code} needs its client in this file.`);
    importState={bundle,request:crypto.randomUUID()};
    $('importPreview').innerHTML=`<p><strong>${bundle.clients.length} clients · ${bundle.jobs.length} jobs</strong><br>Destination: ${esc(c360Access.organisation.name)}</p>${bundle.source==='legacy-prototype'?'<div class="notice">Prototype export: may contain demonstration clients and jobs. Dates without a year are preserved as notes, not guessed. Review the file before importing.</div>':''}<ul>${bundle.clients.map(c=>`<li>Client ${esc(c.code)} · ${esc(c.name)}</li>`).join('')}${bundle.jobs.map(j=>`<li>Job ${esc(j.code)} · ${esc(j.site)}</li>`).join('')}</ul><p class="hint">Import is all-or-nothing. Invalid dates, missing contacts or duplicate codes stop the whole file.</p>`;$('importCheckLabel').hidden=false;
  }catch(error){showError($('importError'),error)}
}
async function importRecords(){
  if(!importState||!$('importCheck').checked||saving)return;
  saving=true;$('importButton').disabled=true;$('closeTransfer').disabled=true;$('importFile').disabled=true;
  try{const result=await rpc('workspace_import',{p_bundle:importState.bundle,p_request_id:importState.request});$('transferDialog').close();importState=null;toast(`Imported ${result.clients} clients and ${result.jobs} jobs.`);safeRefresh()}
  catch(error){showError($('importError'),error)}finally{saving=false;$('importButton').disabled=!importState||!$('importCheck').checked;$('closeTransfer').disabled=false;$('importFile').disabled=false}
}
$('statusFilter').innerHTML+=[...JOB_STATUSES].map(s=>`<option>${esc(s)}</option>`).join('');
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
$('records').onclick=e=>{const b=e.target.closest('button[data-action]');if(!b)return;const {action,kind,id}=b.dataset;if(action==='new')openEditor(kind);if(action==='edit')openEditor(kind,id);if(action==='new-job')openEditor('job',null,id);if(action==='archive')askArchive(kind,id)};
['recordSearch','archiveFilter','statusFilter','clientFilter'].forEach(id=>$(id).addEventListener(id==='recordSearch'?'input':'change',render));
$('addButton').onclick=()=>openEditor(currentPage==='clients'?'client':'job');$('refreshButton').onclick=safeRefresh;
$('recordForm').onsubmit=saveForm;['closeEditor','cancelEditor'].forEach(id=>$(id).onclick=()=>{if(!saving)$('editor').close()});
['editor','confirmDialog','transferDialog'].forEach(id=>$(id).addEventListener('cancel',event=>{if(saving)event.preventDefault()}));
$('confirmAction').onclick=confirmArchive;$('cancelConfirm').onclick=()=>$('confirmDialog').close();
$('transferButton').onclick=openTransfer;$('closeTransfer').onclick=()=>$('transferDialog').close();$('exportButton').onclick=exportRecords;
$('importFile').onchange=reviewImport;$('importCheck').onchange=()=>$('importButton').disabled=!importState||!$('importCheck').checked;$('importButton').onclick=importRecords;
$('platformAdminBtn').onclick=()=>location.href='/platform';$('adminUsersBtn').onclick=()=>openAdminUsers().catch(error=>toast(friendlyError(error)));$('accountButton').onclick=openAccountPanel;
$('signOut').onclick=()=>logoutUser().catch(error=>toast(friendlyError(error)));
// Reuse the existing account/user dialogs; make their overlay keyboard-contained.
let modalFocus;
new MutationObserver(()=>{if(modal.classList.contains('show')){modalFocus=document.activeElement;modalbox.querySelector('button,input,select')?.focus()}else if(modalFocus?.isConnected)modalFocus.focus()}).observe(modal,{attributes:true,attributeFilter:['class']});
new MutationObserver(()=>{const hint=modalbox.querySelector('.card .muted');if(hint&&hint.textContent.includes('Staff page'))hint.textContent='Operatives and Supervisors receive a linked staff record automatically. The Staff workspace will be enabled in a later release.'}).observe(modalbox,{childList:true,subtree:true});
modal.addEventListener('keydown',event=>{if(event.key==='Escape'){closeModal();return}if(event.key!=='Tab')return;const items=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(x=>x.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
if(authClient())authClient().auth.onAuthStateChange((event,session)=>{c360Session=session;if(event==='SIGNED_OUT'){showLogin()}if(event==='PASSWORD_RECOVERY')location.replace('/?auth=recovery');if(event==='SIGNED_IN'&&c360Access&&session?.user.id!==c360Access.user.id){clearWorkspace();setTimeout(safeRefresh,0)}});
safeRefresh();

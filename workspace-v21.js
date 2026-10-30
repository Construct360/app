/* v21 presentation, compact media and checked destructive actions. */
const QUALIFICATION_GROUPS=[
 {group:'Core Scaffolding',items:['Cots CISRS','Part 1 CISRS','Part 2 CISRS','Advanced Scaffolder CISRS','Accessing Operations and Rigging CISRS NVQ Level 2','Accessing Operations and Rigging CISRS NVQ Level 3','1-Day Skills Test']},
 {group:'System Scaffolding',items:['Part 1 (System Scaffold) CISRS','Part 2 (System Scaffold) CISRS','System Scaffolding Product Training Scheme CISRS SSPTS','Basic Access System Erector (BASE) CISRS']},
 {group:'Scaffold Inspection',items:['Basic Scaffold Inspection – SITS CISRS','Advanced Scaffold Inspection CISRS','System Scaffold Inspection CISRS']},
 {group:'Supervision & Management',items:['Site Supervision Safety Training Scheme CITB (SSSTS)','Site Management Safety Training Scheme CITB (SMSTS)']},
 {group:'Other',items:['Driving Licence','First Aid at Work / Emergency First Aid','Manual Handling','Working at Height','Harness inspection/use training','Rescue from Height','Asbestos Awareness','Confined Spaces','IPAF – MEWPs','PASMA – Mobile Access Towers','CPCS / NPORS – plant and lifting equipment where applicable','Lifting / Slinger Signaller training','Temporary Works Supervisor/Coordinator training','IOSH Managing Safely','NEBOSH']}
];
function qualificationNameField(id,name=''){
 const known=QUALIFICATION_GROUPS.some(g=>g.items.includes(name)),custom=!!name&&!known;
 return `<div class="field"><label for="q_choice_${id}">Qualification *</label><select id="q_choice_${id}" required><option value="">Select qualification…</option>${QUALIFICATION_GROUPS.map(g=>`<optgroup label="${esc(g.group)}">${g.items.map(n=>`<option value="${esc(n)}" ${n===name?'selected':''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}<option value="__custom" ${custom?'selected':''}>Other / custom qualification</option></select><div data-custom-qualification ${custom?'':'hidden'}><label for="f_q_name_${id}">Custom qualification name</label><input id="f_q_name_${id}" name="q_name_${id}" type="${custom?'text':'hidden'}" value="${esc(name)}" maxlength="160" ${custom?'required':''}></div></div>`;
}
function wireQualificationChoice(el,id){
 const select=el.querySelector('#q_choice_'+id),input=el.querySelector('#f_q_name_'+id),wrap=el.querySelector('[data-custom-qualification]');let customValue=select.value==='__custom'?input.value:'';
 input.addEventListener('input',()=>customValue=input.value);
 select.onchange=()=>{const custom=select.value==='__custom';wrap.hidden=!custom;input.type=custom?'text':'hidden';input.required=custom;input.value=custom?customValue:select.value;if(custom)input.focus()};
}

let notificationResizeObserver;
function limitNotificationHeight(){
 notificationResizeObserver?.disconnect();const list=document.querySelector('.notification-list');if(!list)return;
 const measure=()=>{const rows=[...list.children].filter(e=>e.classList.contains('notification'));list.style.maxHeight=rows.length>3?Math.ceil(rows.slice(0,3).reduce((sum,row)=>sum+row.getBoundingClientRect().height,0))+'px':'none';list.tabIndex=rows.length>3?0:-1;list.setAttribute('aria-label','Notifications'+(rows.length>3?' — scroll for more':''))};
 measure();notificationResizeObserver=new ResizeObserver(measure);notificationResizeObserver.observe(list);[...list.children].slice(0,3).forEach(row=>notificationResizeObserver.observe(row));
}

function plannerStaffOrder(staff,bookings){
 // Connected crews stay adjacent for this displayed period, independent of filters.
 const ids=new Set(staff.map(s=>s.id)),parent=new Map(staff.map(s=>[s.id,s.id]));
 const root=id=>{while(parent.get(id)!==id)id=parent.get(id);return id};
 for(const b of bookings){const crew=bookingCrew(b.id).filter(id=>ids.has(id));for(const id of crew.slice(1))parent.set(root(id),root(crew[0]))}
 const groups=new Map();for(const s of staff){const key=root(s.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)}
 return [...groups.values()].map(g=>g.sort((a,b)=>a.full_name.localeCompare(b.full_name))).sort((a,b)=>a[0].full_name.localeCompare(b[0].full_name)).flatMap((g,index)=>g.map((s,i)=>({...s,plannerGroup:index,groupStart:i===0,groupSize:g.length})));
}
function renderStaffPlanner(visible,days){
 const office=isManager(),start=days[0],end=addDays(days.at(-1),1),period=(workspaceData.bookings||[]).filter(b=>b.status==='scheduled'&&localStamp(b.starts_at)<end+'T00:00'&&localStamp(b.ends_at)>start+'T00:00');
 const staff=(workspaceData.staff||[]).filter(s=>(s.is_active!==false&&!s.archived||visible.some(b=>bookingCrew(b.id).includes(s.id)))&&(plannerStaff==='all'||plannerStaff===s.id));
 const rows=plannerStaffOrder(staff,period),workingDays=days.filter(d=>new Date(d+'T12:00Z').getUTCDay()%6!==0);
 const onDay=(b,day)=>localStamp(b.starts_at)<addDays(day,1)+'T00:00'&&localStamp(b.ends_at)>day+'T00:00';
 const labels=day=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00Z'));
 $('records').innerHTML=`<p class="hint">${office?'All current staff remain visible, including people with no tasks. People sharing tasks this period are grouped together. Names stay fixed as you scroll across.':'Only your own tasks and permitted shared crew information are shown—not everyone’s availability.'}${plannerJob!=='all'?' A job filter is active; blank cells do not necessarily mean free.':''}</p><div class="staff-planner-scroll" tabindex="0" role="region" aria-label="Staff calendar; scroll across to see all days"><table class="staff-planner ${days.length===1?'single-day':''}"><thead><tr><th scope="col" class="staff-column">Staff member</th>${days.map(day=>`<th scope="col"><div class="planner-day-title"><span>${esc(labels(day))}</span>${office?operationButton('book-day','+',day):''}</div><small>${visible.filter(b=>onDay(b,day)).length} tasks</small>${plannerLeave(day)}</th>`).join('')}</tr></thead><tbody>${rows.map(s=>{
 const booked=visible.filter(b=>bookingCrew(b.id).includes(s.id)),unscheduled=workingDays.filter(day=>!period.some(b=>bookingCrew(b.id).includes(s.id)&&onDay(b,day))&&!leaveForDay(day).some(l=>l.staff_id===s.id));
 return `<tr class="${s.groupStart?'crew-start':''} crew-${s.plannerGroup%2}" data-planner-staff="${esc(s.id)}"><th scope="row" class="staff-column"><strong>${esc(s.full_name)}</strong><small>${esc(s.position||s.employment_role||'Staff')}</small>${office?`<span class="${unscheduled.length?'unassigned-indicator':'fully-assigned'}">${unscheduled.length?unscheduled.length+' weekday'+(unscheduled.length===1?'':'s')+' without a task':'Weekdays covered'}</span>`:''}${s.groupSize>1?'<small class="crew-group-label">Grouped with shared crew</small>':''}</th>${days.map(day=>{
 const tasks=booked.filter(b=>onDay(b,day)).sort((a,b)=>localStamp(a.starts_at).localeCompare(localStamp(b.starts_at))||a.id.localeCompare(b.id)),leave=leaveForDay(day).some(l=>l.staff_id===s.id);
 return `<td>${leave?'<div class="staff-day-leave">Annual leave</div>':''}${tasks.map(bookingCard).join('')}${!tasks.length&&!leave?`<p class="day-empty">${office?(plannerJob==='all'?'No task assigned':'No matching task'):'No visible task'}</p>`:''}${office?`<button type="button" class="add-staff-task" data-new-staff-task="${esc(s.id)}" data-day="${day}" aria-label="Add task for ${esc(s.full_name)} on ${esc(labels(day))}">+ Task</button>`:''}</td>`;
 }).join('')}</tr>`;
 }).join('')||`<tr><td colspan="${days.length+1}">No staff visible for this view.</td></tr>`}</tbody></table></div><p class="hint">Tasks shared by several people appear on each person’s row. Deleting a task removes the whole task and all its crew assignments. Annual leave and recorded timesheets are not deleted.</p>`;
}

let inlineJobData=null,inlineJobGeneration=0,inlineJobUrls=[],permanentDeleteBusy=false;
const fileDeleteRequests=new Map();
function clearInlineJobFiles(){inlineJobGeneration++;inlineJobData=null;for(const url of inlineJobUrls)URL.revokeObjectURL(url);inlineJobUrls=[]}
function inlineFileCard(f,manage){
 const picture=f.mime_type.startsWith('image/');
 return `<article class="inline-file ${picture?'inline-photo':'inline-document'}" data-inline-file="${esc(f.id)}">${picture&&!f.deletion_pending?`<button type="button" class="inline-image" data-inline-preview="${esc(f.id)}" aria-label="Enlarge ${esc(f.name)}">Loading image…</button>`:''}<div class="inline-file-info"><strong>${esc(f.name)}</strong>${f.caption?`<p>${esc(f.caption)}</p>`:''}<small>${esc(vehicleTime(f.created_at))}</small><div class="actions">${f.deletion_pending?'<span class="warning-text">Deletion pending</span>':`<button type="button" class="text-button" data-inline-download="${esc(f.id)}">Download</button>`}${manage?`<button type="button" class="text-button danger-text" data-inline-delete="${esc(f.id)}">${f.deletion_pending?'Retry delete':'Delete'}</button>`:''}</div></div></article>`;
}
async function loadInlineJobFiles(jobId){
 const generation=++inlineJobGeneration,host=$('inlineJobFiles'),org=c360Access?.membership?.organisation_id;if(!host)return;
 try{
  const data=await rpc('job_resources_snapshot',{p_job_id:jobId});if(generation!==inlineJobGeneration||!host.isConnected)return;
  if(data.organisation_id!==org)throw new Error('Company check failed.');inlineJobData={...data,job_id:jobId};
  host.innerHTML=`<div class="inline-file-heading"><p class="hint">Shared photos and documents for this site.${data.can_manage?' Office-only files are marked below.':''}</p><button type="button" class="secondary" data-job-files="${esc(jobId)}">${data.can_manage?'Upload / manage files':'Upload progress photos'}</button></div><div class="inline-file-error" role="alert" hidden></div>${Object.entries(JOB_FILE_CATEGORIES).filter(([key])=>data.can_manage||key!=='private').map(([key,label])=>`<section class="inline-file-section" data-inline-category="${key}"><h3>${esc(label)}${key==='private'?' · Office only':''}</h3><div class="inline-file-grid">${data.files.filter(f=>f.category===key).map(f=>inlineFileCard(f,data.can_manage)).join('')||'<p class="hint">No '+esc(label.toLowerCase())+' added yet.</p>'}</div></section>`).join('')}`;
  // Bounded parallel downloads, authenticated; full image remains available on click.
  const images=data.files.filter(f=>f.mime_type.startsWith('image/')&&!f.deletion_pending);let next=0;
  await Promise.all(Array.from({length:Math.min(3,images.length)},async()=>{while(next<images.length){if(generation!==inlineJobGeneration)return;const f=images[next++],button=host.querySelector('[data-inline-preview="'+f.id+'"]');try{
   const {data:blob,error}=await authClient().storage.from('job-files').download(f.object_path);if(error)throw error;if(generation!==inlineJobGeneration)return;
   const url=URL.createObjectURL(new Blob([blob],{type:f.mime_type}));inlineJobUrls.push(url);f.previewUrl=url;const img=document.createElement('img');img.src=url;img.alt=f.caption||f.name;img.loading='lazy';button.replaceChildren(img);
  }catch{if(generation===inlineJobGeneration&&button)button.textContent='Preview unavailable — click to retry'}}}));
 }catch(e){if(generation===inlineJobGeneration&&host.isConnected)host.innerHTML=`<p role="alert">${esc(friendlyError(e))}</p><button type="button" class="secondary" data-inline-retry="${esc(jobId)}">Retry files</button>`}
}
async function useInlineJobFile(id,preview){
 const f=inlineJobData?.files.find(f=>f.id===id);if(!f||f.deletion_pending)return;const generation=inlineJobGeneration;
 try{if(preview&&f.previewUrl){enlargeQualification(f.previewUrl,f.name);return}
  const {data,error}=await authClient().storage.from('job-files').download(f.object_path);if(error)throw error;if(generation!==inlineJobGeneration)return;
  if(preview){const url=URL.createObjectURL(new Blob([data],{type:f.mime_type}));inlineJobUrls.push(url);f.previewUrl=url;enlargeQualification(url,f.name)}else downloadBlob(data,f.name);
 }catch(e){toast(friendlyError(e))}
}
async function permanentlyDeleteJobFile(id,button,source){
 if(permanentDeleteBusy||!isManager())return;const file=source?.files.find(f=>f.id===id);if(!file)return;
 if(!confirm(`Permanently delete “${file.name}”?\n\nThis deletes the stored file for everyone in your company and cannot be undone. Any copies already downloaded are unaffected.`))return;
 const org=c360Access.membership.organisation_id,jobId=source.job_id;permanentDeleteBusy=true;jobFileBusy=true;button.disabled=true;
 let request=fileDeleteRequests.get(id);if(!request){request={begin:crypto.randomUUID(),finish:crypto.randomUUID()};fileDeleteRequests.set(id,request)}
 try{
  const staged=await rpc('job_file_delete',{p_action:'begin',p_id:id,p_request_id:request.begin});
  const {error}=await authClient().storage.from('job-files').remove([staged.object_path]);if(error)throw error;
  await rpc('job_file_delete',{p_action:'finish',p_id:id,p_request_id:request.finish});fileDeleteRequests.delete(id);toast('File permanently deleted. It cannot be restored in the app.');
 }catch(error){toast('Deletion not confirmed. Use Retry delete to finish. '+friendlyError(error))}
 finally{
  permanentDeleteBusy=false;jobFileBusy=false;if(button.isConnected)button.disabled=false;
  if(c360Access?.membership?.organisation_id===org){if(recordView?.kind==='job'&&recordView.id===jobId)renderRecordView();else if(readPanel?.dialog.id==='jobFilesDialog'&&jobFileData?.job_id===jobId)await openJobFiles(jobId)}
 }
}
let plannerDeleteBusy=false;
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-delete-booking],[data-new-staff-task],[data-inline-preview],[data-inline-download],[data-inline-delete],[data-inline-retry]');if(!b)return;
 if(b.dataset.inlinePreview){useInlineJobFile(b.dataset.inlinePreview,true);return}
 if(b.dataset.inlineDownload){useInlineJobFile(b.dataset.inlineDownload,false);return}
 if(b.dataset.inlineRetry){loadInlineJobFiles(b.dataset.inlineRetry);return}
 if(b.dataset.inlineDelete){await permanentlyDeleteJobFile(b.dataset.inlineDelete,b,inlineJobData);return}
 if(!isManager())return;
 if(b.dataset.newStaffTask){openOperations('booking',null,{day:b.dataset.day,staff_id:b.dataset.newStaffTask});return}
 if(plannerDeleteBusy)return;const task=workspaceData.bookings.find(x=>x.id===b.dataset.deleteBooking);if(!task)return;
 if(!confirm(`Permanently delete “${task.task}” at ${jobBy(task.job_id)?.site||'this job'}?\n\nThis removes the whole task and all ${bookingCrew(task.id).length} staff assignments. It cannot be undone. Timesheets, job files and annual leave are not deleted.`))return;
 plannerDeleteBusy=true;b.disabled=true;
 try{await rpc('planner_delete',{p_id:task.id,p_version:task.version,p_confirmed:true,p_request_id:crypto.randomUUID()});clearRecordViews();currentPage='planner';await loadWorkspace();toast('Task permanently deleted. Crew assignments released.')}
 catch(error){toast(friendlyError(error))}finally{plannerDeleteBusy=false;if(b.isConnected)b.disabled=false}
});

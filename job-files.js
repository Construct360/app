/* Authenticated downloads only. Shared documents never use public bucket URLs. */
const JOB_FILE_CATEGORIES={images:'Images',rams:'RAMS',important:'Important documents',private:'Office-only documents'};
let jobResourceData=null,jobFileData=null,jobFileGeneration=0,jobFileBusy=false,jobUpload=null,jobFileUrls=[];
function clearJobFiles(){jobFileGeneration++;jobResourceData=null;jobFileData=null;jobUpload=null;for(const url of jobFileUrls)URL.revokeObjectURL(url);jobFileUrls=[];$('jobFilesDialog').close()}
async function loadJobResources(){
 const generation=jobFileGeneration,org=c360Access.membership.organisation_id;
 const data=await rpc('job_resources_snapshot',{p_job_id:null});if(generation!==jobFileGeneration)return;
 if(data.organisation_id!==org)throw new Error('Company check failed.');jobResourceData=data;return data;
}
async function renderSharedJobs(){
 $('pageTitle').textContent='Jobs';$('pageSubtitle').textContent='Shared job files and progress photos for your company. Your scheduled work remains in Planner.';
 $('addButton').hidden=true;$('filters').hidden=true;
 document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page==='jobs'));
 if(!jobResourceData){$('records').innerHTML='<div class="empty">Loading company jobs…</div>';try{if(await loadJobResources())if(currentPage==='jobs')renderSharedJobs()}catch(e){$('records').innerHTML='<div class="empty">'+esc(friendlyError(e))+'</div>'}return}
 const jobs=jobResourceData.jobs.filter(j=>!j.archived);
 $('records').innerHTML=jobs.length?'<div class="record-list">'+jobs.map(j=>`<article class="record"><div><p class="eyebrow">${esc(j.code)}</p><h3>${esc(j.site)}</h3></div><div class="record-actions">${workspaceData.jobs.some(assigned=>assigned.id===j.id)?operationButton('job-assignments','View assignments',j.id):''}<button class="secondary" data-job-files="${esc(j.id)}">Files &amp; photos</button><button class="secondary" data-scaffold-job="${esc(j.id)}">Scaffolds &amp; inspections</button></div></article>`).join('')+'</div>':'<div class="empty">No current jobs. Your office can create one.</div>';
}
async function openJobFiles(id){
 if(jobFileBusy)return;const generation=++jobFileGeneration,org=c360Access.membership.organisation_id;
 for(const url of jobFileUrls)URL.revokeObjectURL(url);jobFileUrls=[];
 jobUpload=null;$('jobFilesBody').innerHTML='<p>Loading job files…</p>';$('jobFilesError').hidden=true;
 if(!$('jobFilesDialog').open)$('jobFilesDialog').showModal();
 try{const data=await rpc('job_resources_snapshot',{p_job_id:id});if(generation!==jobFileGeneration)return;if(data.organisation_id!==org)throw new Error('Company check failed.');jobFileData={...data,job_id:id};renderJobFiles()}
 catch(e){if(generation===jobFileGeneration)showError($('jobFilesError'),e)}
}
function renderJobFiles(){
 const data=jobFileData,j=data.jobs.find(j=>j.id===data.job_id);$('jobFilesTitle').textContent=j.code+' · '+j.site;
 $('jobFilesBody').innerHTML=`<p class="hint">Images, RAMS and Important documents are shared with everyone in your company. Office-only files are visible to Admin and Operations only.</p>${!j.archived?`<form id="jobUploadForm" class="job-upload"><label>Category<select id="jobFileCategory">${Object.entries(JOB_FILE_CATEGORIES).filter(([key])=>data.can_manage||key==='images').map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>File<input type="file" id="jobFileInput" required accept="image/jpeg,image/png,image/webp"></label><label>Caption / description (optional)<input id="jobFileCaption" maxlength="1000"></label><p class="hint">Up to 20 MB. Images are optimised for viewing; PDF, DOCX, XLSX and TXT documents are also accepted in document categories.</p><button type="submit" id="jobFileUploadButton">Upload file</button><span id="jobFileUploadStatus" role="status"></span></form>`:'<div class="notice">Archived job: files remain available; new uploads are disabled.</div>'}${Object.entries(JOB_FILE_CATEGORIES).filter(([key])=>data.can_manage||key!=='private').map(([key,label])=>`<section class="job-file-section"><h3>${label}${key==='private'?' · Office only':''}</h3><div class="job-file-grid">${data.files.filter(f=>f.category===key).map(f=>`<article class="job-file-card">${key==='images'?`<button class="job-image-preview secondary" data-file-preview="${f.id}">View photo</button>`:''}<strong>${esc(f.name)}</strong><p>${esc(f.caption)}</p><small>${esc(vehicleTime(f.created_at))}</small><div class="actions"><button class="secondary" data-file-download="${f.id}">Download</button>${data.can_manage?`<button class="text-button" data-file-archive="${f.id}">Remove from view</button>`:''}</div></article>`).join('')||'<p class="hint">No files yet.</p>'}</div></section>`).join('')}`;
 if(!j.archived){$('jobFileCategory').onchange=()=>{$('jobFileInput').accept=$('jobFileCategory').value==='images'?'image/jpeg,image/png,image/webp':'.pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp';jobUpload=null};$('jobFileInput').onchange=$('jobFileCaption').oninput=()=>jobUpload=null;$('jobUploadForm').onsubmit=uploadJobFile}
 loadJobFileThumbnails().catch(()=>{});
}
async function loadJobFileThumbnails(){
 const generation=jobFileGeneration;
 for(const file of jobFileData.files.filter(f=>f.category==='images').slice(0,40)){
  const {data,error}=await authClient().storage.from('job-files').download(file.object_path);
  if(generation!==jobFileGeneration)return;if(error)continue;
  const button=$('jobFilesBody').querySelector('[data-file-preview="'+file.id+'"]');if(!button)continue;
  const url=URL.createObjectURL(new Blob([data],{type:file.mime_type}));jobFileUrls.push(url);
  const img=document.createElement('img');img.src=url;img.alt='';button.setAttribute('aria-label','View photo');button.replaceChildren(img);
 }
}
async function prepareJobFile(file,category){
 if(!file||file.size===0||file.size>20*1024*1024)throw new Error('Choose a file between 1 byte and 20 MB.');
 if(file.type.startsWith('image/')){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose JPG, PNG or WebP images.');
  const bitmap=await createImageBitmap(file);try{
   if(bitmap.width*bitmap.height>40000000)throw new Error('Use an image below 40 megapixels.');
   const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));if(!blob)throw new Error('Image could not be read.');
   return {blob,name:file.name.replace(/\.[^.]+$/,'').slice(0,170)+'.jpg',mime_type:'image/jpeg'};
  }finally{bitmap.close()}
 }
 if(category==='images')throw new Error('Choose a JPG, PNG or WebP progress photo.');
 const types={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',txt:'text/plain'},mime=types[file.name.split('.').pop().toLowerCase()];
 if(!mime)throw new Error('Use PDF, DOCX, XLSX or TXT documents.');
 return {blob:file,name:file.name.slice(0,180),mime_type:mime};
}
async function uploadJobFile(event){
 event.preventDefault();if(jobFileBusy)return;jobFileBusy=true;const generation=jobFileGeneration;
 $('jobFilesDialog').querySelectorAll('button,input,select').forEach(e=>e.disabled=true);$('jobFilesError').hidden=true;
 try{
  if(!jobUpload){const category=$('jobFileCategory').value,prepared=await prepareJobFile($('jobFileInput').files[0],category);jobUpload={...prepared,data:{job_id:jobFileData.job_id,category,name:prepared.name,mime_type:prepared.mime_type,byte_size:prepared.blob.size,caption:$('jobFileCaption').value.trim()},reserveId:crypto.randomUUID(),finishId:crypto.randomUUID()}}
  const upload=jobUpload;$('jobFileUploadStatus').textContent='Uploading…';
  upload.reservation??=await rpc('job_file_save',{p_action:'reserve',p_data:upload.data,p_request_id:upload.reserveId});
  if(!upload.sent){const {error}=await authClient().storage.from('job-files').upload(upload.reservation.object_path,upload.blob,{contentType:upload.mime_type,upsert:false});
   if(error){if(String(error.statusCode||error.status)==='409'||/already exists|duplicate/i.test(error.message||'')){
    const existing=await authClient().storage.from('job-files').download(upload.reservation.object_path);if(existing.error||existing.data.size!==upload.blob.size)throw new Error('Upload conflict. Choose the file again.');
   }else throw error}upload.sent=true;
  }
  await rpc('job_file_save',{p_action:'finish',p_data:{id:upload.reservation.id},p_request_id:upload.finishId});
  if(generation!==jobFileGeneration)return;jobUpload=null;const id=jobFileData.job_id;jobFileBusy=false;await openJobFiles(id);toast('File uploaded.');
 }catch(e){if(generation===jobFileGeneration){showError($('jobFilesError'),e);$('jobFileUploadStatus').textContent='Upload not confirmed. Keep this window open and retry.'}}
 finally{jobFileBusy=false;$('jobFilesDialog').querySelectorAll('button,input,select').forEach(e=>e.disabled=false)}
}
async function useJobFile(id,preview=false){
 const file=jobFileData?.files.find(f=>f.id===id);if(!file)return;const generation=jobFileGeneration;
 try{const {data,error}=await authClient().storage.from('job-files').download(file.object_path);if(error)throw error;if(generation!==jobFileGeneration)return;
  if(preview){const url=URL.createObjectURL(new Blob([data],{type:file.mime_type}));jobFileUrls.push(url);enlargeQualification(url,file.name)}
  else downloadBlob(data,file.name);
 }catch(e){showError($('jobFilesError'),e)}
}
function initialiseJobFiles(){
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-job-files],[data-file-download],[data-file-preview],[data-file-archive]');if(!button||jobFileBusy)return;
  if(button.dataset.jobFiles){openJobFiles(button.dataset.jobFiles);return}
  if(button.dataset.fileDownload){useJobFile(button.dataset.fileDownload);return}
  if(button.dataset.filePreview){useJobFile(button.dataset.filePreview,true);return}
  if(!confirm('Remove this file from the job view? It will be retained in storage for recovery.'))return;
  button.disabled=true;try{await rpc('job_file_save',{p_action:'archive',p_data:{id:button.dataset.fileArchive},p_request_id:crypto.randomUUID()});await openJobFiles(jobFileData.job_id)}catch(e){showError($('jobFilesError'),e)}finally{button.disabled=false}
 });
 $('jobFilesClose').onclick=()=>{if(!jobFileBusy){jobFileGeneration++;$('jobFilesDialog').close();jobUpload=null;for(const url of jobFileUrls)URL.revokeObjectURL(url);jobFileUrls=[]}};
 $('jobFilesDialog').addEventListener('cancel',e=>{e.preventDefault();$('jobFilesClose').click()});
}

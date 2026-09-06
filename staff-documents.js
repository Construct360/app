/* Private qualification images and client-side staff PDFs. No pay data in PDFs. */
const QUALIFICATION_BUCKET='staff-qualifications';
let staffDocumentUrls=new Set(),staffDocumentGeneration=0;
function rememberDocumentUrl(blob){const url=URL.createObjectURL(blob);staffDocumentUrls.add(url);return url}
function clearStaffDocuments(){staffDocumentGeneration++;for(const url of staffDocumentUrls)URL.revokeObjectURL(url);staffDocumentUrls.clear();document.getElementById('qualificationLightbox')?.remove()}
function setStaffFormBusy(busy){$('operationsForm').querySelectorAll('input,select,textarea,button').forEach(el=>{if(busy){el.dataset.documentDisabled=String(el.disabled);el.disabled=true}else if('documentDisabled' in el.dataset){el.disabled=el.dataset.documentDisabled==='true';delete el.dataset.documentDisabled}})}
function imageBlob(path){return authClient().storage.from(QUALIFICATION_BUCKET).download(path).then(({data,error})=>{if(error)throw new Error('Could not load a qualification image. Check access and try again.');return data})}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');a.hidden=true;(document.querySelector('dialog[open]')||document.body).append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function enlargeQualification(url,name){
  document.getElementById('qualificationLightbox')?.remove();const dialog=document.createElement('dialog');dialog.id='qualificationLightbox';dialog.className='qualification-lightbox';dialog.setAttribute('aria-label','Qualification image');
  const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='Close image';close.onclick=()=>dialog.close();
  const img=document.createElement('img');img.src=url;img.alt=name;dialog.append(close,img);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
function qualificationImageMetadata(el){return (el._images||[]).map(i=>({path:i.path,name:i.name}))}
function addQualificationImages(el,q){
  el._images=(q.images||[]).map(i=>({...i,saved:true}));
  const container=document.createElement('div');container.className='qualification-images';
  const label=document.createElement('label');label.className='image-upload-label';label.textContent='Qualification images (JPG, PNG or WebP)';
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=true;input.setAttribute('aria-label','Upload qualification images');
  label.append(input);const hint=document.createElement('p');hint.className='hint';hint.textContent='Up to 5 images per qualification, 30 per staff profile, 5 MB each. Images upload when you save. Photos are resized for the staff record; keep original certificates separately.';
  const grid=document.createElement('div');grid.className='qualification-image-grid';container.append(label,hint,grid);el.append(container);
  const generation=staffDocumentGeneration;
  async function redraw(){
    grid.replaceChildren();for(const item of el._images){
      const card=document.createElement('div');card.className='qualification-image';
      const preview=document.createElement('button');preview.type='button';preview.className='image-preview';preview.setAttribute('aria-label','Enlarge '+item.name);preview.textContent='Loading image…';
      const caption=document.createElement('span');caption.textContent=item.name;
      const download=document.createElement('button');download.type='button';download.className='text-button';download.textContent='Download';download.onclick=async()=>{download.disabled=true;try{downloadBlob(item.blob||await imageBlob(item.path),item.name)}catch(e){showError($('operationsError'),e)}finally{download.disabled=false}};
      const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Remove image';remove.onclick=()=>{el._images=el._images.filter(i=>i!==item);redraw()};
      card.append(preview,caption,download,remove);grid.append(card);
      try{if(!item.url){const blob=item.blob||await imageBlob(item.path);if(generation!==staffDocumentGeneration)return;item.url=rememberDocumentUrl(blob)}if(generation!==staffDocumentGeneration)return;const img=document.createElement('img');img.src=item.url;img.alt=item.name;preview.replaceChildren(img);preview.onclick=()=>enlargeQualification(item.url,item.name)}catch{preview.textContent='Image unavailable — reopen to retry';preview.disabled=true}
    }
  }
  input.onchange=async()=>{
    const files=[...input.files];if(!files.length)return;
    const total=[...$('qualificationFields').children].reduce((n,e)=>n+(e._images?.length||0),0);
    if(el._images.length+files.length>5||total+files.length>30){showError($('operationsError'),new Error('Maximum 5 images per qualification and 30 per staff member.'));input.value='';return}
    operationBusy=true;setStaffFormBusy(true);
    try{
      const prepared=[];
      for(const file of files){
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose JPG, PNG or WebP images no larger than 5 MB.');
        const bitmap=await createImageBitmap(file);
        try{if(bitmap.width*bitmap.height>40000000)throw new Error('Image dimensions are too large. Use a photo below 40 megapixels.');
          const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));if(!blob)throw new Error('Could not read this image.');
          const name=file.name.replace(/\.[^.]+$/,'').slice(0,170)+'.jpg';
          prepared.push({name,blob,path:`${c360Access.membership.organisation_id}/${operationEdit.draftId}/${el.dataset.qualification}/${crypto.randomUUID()}.jpg`});
        }finally{bitmap.close()}
      }
      if(generation===staffDocumentGeneration){el._images.push(...prepared);await redraw()}
    }catch(e){showError($('operationsError'),e)}finally{input.value='';operationBusy=false;setStaffFormBusy(false)}
  };redraw();
}
async function uploadQualificationImages(){
  for(const el of $('qualificationFields').children)for(const image of el._images||[]){
    if(image.saved)continue;
    const {error}=await authClient().storage.from(QUALIFICATION_BUCKET).upload(image.path,image.blob,{contentType:'image/jpeg',upsert:false});
    if(error){
      // A retry can encounter the immutable object from a lost successful response.
      if(String(error.statusCode||error.status)==='409'||String(error.statusCode)==='400'&&/already exists/i.test(error.message||'')){
        const existing=await imageBlob(image.path);if(existing.size!==image.blob.size)throw new Error('Image upload conflicted. Remove and re-add the image.');
      }else throw new Error('Image upload failed. Your draft is retained; check your connection and retry.');
    }
    image.saved=true;
  }
}
let pdfResources;
async function staffPdfResources(){if(!pdfResources)pdfResources=Promise.all(['/assets/construct360-logo-primary.png','/assets/vendor/NotoSans-Regular.ttf'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error('PDF branding files could not load.');return new Uint8Array(await r.arrayBuffer())})).catch(e=>{pdfResources=null;throw e});return pdfResources}
function base64Bytes(bytes){let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(str)}
async function buildStaffPdf(staff,company,loadImage=imageBlob){
  if(!window.jspdf?.jsPDF)throw new Error('PDF tools could not load. Refresh and try again.');
  const [logo,font]=await staffPdfResources(),pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
  pdf.addFileToVFS('NotoSans-Regular.ttf',base64Bytes(font));pdf.addFont('NotoSans-Regular.ttf','NotoSans','normal');pdf.setFont('NotoSans');
  const navy=[8,40,76],orange=[246,104,10],grey=[86,105,125];let y=0;
  function header(){pdf.setFillColor(...navy);pdf.rect(0,0,210,9,'F');pdf.addImage(logo,'PNG',16,17,76,16.7);pdf.setDrawColor(...orange);pdf.setLineWidth(0.8);pdf.line(16,41,194,41);y=53}
  function space(h){if(y+h>274){pdf.addPage();header()}}
  function text(value,size=11,color=navy){pdf.setFontSize(size);pdf.setTextColor(...color);const lines=pdf.splitTextToSize(String(value||''),178);for(const line of lines){space(size*0.45+2);pdf.text(line,16,y);y+=size*0.45+2}}
  header();text('STAFF RECORD',19);text(staff.full_name,16);text('Position: '+(staff.position||staff.employment_role));text(company,10,grey);text('Generated: '+new Date().toLocaleDateString('en-GB'),9,grey);y+=6;
  text('Qualifications',14);
  if(!staff.qualifications?.length)text('No qualifications recorded.',11,grey);
  for(const [index,q] of (staff.qualifications||[]).entries()){
    space(35);y+=4;text(`${index+1}. ${q.name}`,13);if(q.reference)text('Certificate reference: '+q.reference,10);text('Expiry: '+(q.expires?dateLabel(q.expires):'Not recorded'),10,grey);
    for(const image of q.images||[]){
      const blob=await loadImage(image.path),bytes=new Uint8Array(await blob.arrayBuffer()),props=pdf.getImageProperties(bytes);
      const scale=Math.min(178/props.width,160/props.height),width=props.width*scale,height=props.height*scale;
      pdf.setFontSize(9);const captionHeight=pdf.splitTextToSize(String(image.name||''),178).length*(9*0.45+2);
      space(height+captionHeight+7);text(image.name,9,grey);pdf.addImage(bytes,props.fileType,16,y,width,height);y+=height+7;
    }
  }
  const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setDrawColor(222,229,236);pdf.line(16,281,194,281);pdf.setFontSize(8);pdf.setTextColor(...grey);pdf.text('Construct360 | Staff qualification record | Keep confidential',16,288);pdf.text(`${i} / ${pages}`,194,288,{align:'right'})}
  return pdf.output('blob');
}
async function downloadStaffRecord(id,button){
  if(!isManager())return;button.disabled=true;const label=button.textContent;button.textContent='Preparing PDF…';const generation=staffDocumentGeneration;
  try{
    const snapshot=await rpc('operations_snapshot');if(snapshot.organisation_id!==c360Access.membership.organisation_id||!['admin','operations'].includes(snapshot.role))throw new Error('Staff record access unavailable.');
    const staff=snapshot.staff.find(s=>s.id===id);if(!staff)throw new Error('Save the staff member before downloading.');
    const blob=await buildStaffPdf(staff,c360Access.organisation.name);if(generation!==staffDocumentGeneration)return;
    downloadBlob(blob,`Construct360-staff-${staff.full_name}.pdf`);toast('Downloaded saved staff record. Unsaved edits are not included.');
  }catch(e){showError($('operationsError'),e)}finally{button.disabled=false;button.textContent=label}
}

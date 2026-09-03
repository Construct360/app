/* Explicit export only. Never clears, modifies or automatically imports prototype data. */
function exportLegacyClientsJobs(){
  if(c360Access?.membership?.role!=='admin'||c360Access?.organisation?.workspace_mode!=='prototype'){toast('Export requires this prototype company’s Admin.');return}
  try{
    loadClients();
    const bundle={format:'construct360-transfer-v1',source:'legacy-prototype',organisation_id:c360Access.organisation.id,company_name:c360Access.organisation.name,exported_at:new Date().toISOString(),
      warning:'May include demonstration records. Job changes from older page sessions were not persistently saved. Yearless date labels are kept in notes. Files and other modules are not included.',
      clients:clients.map(c=>({...Object.fromEntries(['code','name','contact','phone','email','address','notes'].map(k=>[k,String(c[k]||'')])),archived:false,contacts:getClientContacts(c.code).map((t,i)=>({...Object.fromEntries(['name','role','phone','email','notes'].map(k=>[k,String(t[k]||'')])),key:String(i)}))})),
      jobs:jobs.map(j=>({code:String(j.id),client_code:String(j.clientCode||''),site:j.site||'',scaffold_type:j.type||'',start_date:j.startDate||'',end_date:j.endDate||'',team:j.crew||'',status:j.status||'Quotation',notes:[j.notes||'',(!j.startDate&&!j.endDate&&j.dates)?'Legacy date label (year not recorded): '+j.dates:''].filter(Boolean).join('\n'),archived:false,contact_keys:(getSiteContactAssignments(j.clientCode)[j.id]||[]).map(String)}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='Construct360-legacy-clients-jobs-review.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Exported for review. Import only the records you want in the saved company workspace.');
  }catch(error){toast('Export could not be completed: '+error.message)}
}

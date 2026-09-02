/* Metadata-only platform console. Every operation is authorised server-side. */
let platformClient;
let platformCompanies = [];
let platformRequest = null;
let platformBusy = false;
let platformPendingStatus = null;
const platformEl = id => document.getElementById(id);
const platformEscape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function platformMessage(message, error = false) {
  const el = platformEl("platformMessage"); el.textContent = message;
  el.className = `message${error ? " error" : ""}`; el.hidden = !message;
}
async function platformCall(body) {
  const { data, error } = await platformClient.functions.invoke("platform-companies", { body });
  if (error) {
    let message = error.message;
    try { const result = await error.context?.json(); message = result?.error || message; } catch {}
    throw new Error(message || "The platform service could not be reached. Check deployment and sign in again.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function renderPlatformCompanies() {
  const search = platformEl("companySearch").value.trim().toLowerCase();
  const status = platformEl("companyFilter").value;
  const rows = platformCompanies.filter(c => (status === "all" || c.status === status) && `${c.name} ${c.admin_email || ""}`.toLowerCase().includes(search));
  platformEl("companyStats").innerHTML = [["Companies",platformCompanies.length],["Active",platformCompanies.filter(c=>c.status==='active').length],["Suspended",platformCompanies.filter(c=>c.status==='suspended').length]]
    .map(([label,count])=>`<div class="stat"><span>${label}</span><strong>${count}</strong></div>`).join("");
  platformEl("companyList").innerHTML = rows.length ? rows.map(c => {
    const resend = c.invitation_id && c.invitation_status !== "accepted" && c.status === "active";
    return `<article class="company-card"><div class="card-heading"><h2>${platformEscape(c.name)}</h2><span class="badge ${c.status === 'suspended' ? 'suspended' : ''}">${platformEscape(c.status)}</span></div>
      <dl class="company-details"><div><dt>First Admin</dt><dd>${platformEscape(c.admin_name || 'Existing company')}<br>${platformEscape(c.admin_email || 'Manage users in the company workspace')}</dd></div>
      <div><dt>Invitation</dt><dd>${platformEscape(c.invitation_status || 'Existing account')}</dd></div><div><dt>Users</dt><dd>${Number(c.user_count)}</dd></div>
      <div><dt>Workspace</dt><dd>${c.workspace_mode === 'prototype' ? 'Existing prototype' : 'Account setup only'}</dd></div></dl>
      ${c.last_error ? `<p class="message error">${platformEscape(c.last_error)}</p>` : ''}
      <div class="company-actions">${resend ? `<button class="secondary" data-action="resend" data-id="${platformEscape(c.id)}">Resend invitation</button>` : ''}
      ${!c.is_own_company ? `<button class="${c.status === 'active' ? 'danger' : 'secondary'}" data-action="status" data-id="${platformEscape(c.id)}">${c.status === 'active' ? 'Suspend company' : 'Activate company'}</button>` : '<span class="badge">Your company</span>'}</div></article>`;
  }).join("") : '<div class="empty">No companies match this search.</div>';
}
async function refreshPlatform() {
  const result = await platformCall({ action: "list" });
  platformCompanies = result.companies || []; renderPlatformCompanies();
  platformEl("activityList").innerHTML = (result.activity || []).map(a => `<li><time>${platformEscape(new Date(a.created_at).toLocaleString('en-GB'))}</time><span><strong>${platformEscape(a.company_name || 'Construct360')}</strong> · ${platformEscape(a.description)}</span></li>`).join("") || '<li>No platform activity yet.</li>';
}
async function initialisePlatform() {
  const cfg = window.CONSTRUCT360_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) throw new Error("Supabase configuration is missing. Check your Vercel environment variables.");
  platformClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const { data: { user }, error } = await platformClient.auth.getUser();
  if (error || !user) {
    platformEl("platformAccess").innerHTML = '<h1>Sign in to continue</h1><p>Use your Construct360 Platform Administrator account.</p><a href="/?next=platform">Go to sign in</a>'; return;
  }
  const { data: allowed, error: accessError } = await platformClient.rpc("is_platform_admin");
  if (accessError) throw new Error("Platform setup is incomplete. Apply migration 003 and the owner setup script first.");
  if (!allowed) {
    platformEl("platformAccess").innerHTML = '<h1>Platform access unavailable</h1><p>Your account does not have Platform Administrator access.</p><a href="/">Return to your company workspace</a>'; return;
  }
  await refreshPlatform();
  platformEl("platformAccess").hidden = true; platformEl("platformContent").hidden = false;
  platformClient.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") { platformEl("platformContent").hidden = true; platformEl("companyDialog").close(); location.replace('/?next=platform'); }
  });
}
platformEl("platformLogout").addEventListener("click", async () => { if (platformClient) await platformClient.auth.signOut(); location.replace('/'); });
platformEl("addCompany").addEventListener("click", () => {
  platformEl("companyForm").reset(); platformRequest = null; platformEl("companyFormError").hidden = true; platformEl("companyDialog").showModal();
});
platformEl("closeCompanyDialog").addEventListener("click", () => { if (!platformBusy) platformEl("companyDialog").close(); });
platformEl("companyDialog").addEventListener("cancel", e => { if (platformBusy) e.preventDefault(); });
platformEl("companySearch").addEventListener("input", renderPlatformCompanies);
platformEl("companyFilter").addEventListener("change", renderPlatformCompanies);
platformEl("refreshCompanies").addEventListener("click", async () => { try { await refreshPlatform(); } catch (e) { platformMessage(e.message,true); } });
platformEl("companyForm").addEventListener("submit", async e => {
  e.preventDefault(); if (platformBusy) return;
  const values = Object.fromEntries(new FormData(e.target));
  const details = { name: values.name.trim(), admin_name: values.admin_name.trim(), admin_email: values.admin_email.trim().toLowerCase() };
  const signature = JSON.stringify(details);
  // Retain the request ID after an uncertain network response; explicit changes
  // to the form start a different operation. Nothing sensitive is stored locally.
  if (platformRequest?.signature !== signature) platformRequest = { signature, id: crypto.randomUUID() };
  platformBusy = true; platformEl("createCompany").disabled = true; platformEl("closeCompanyDialog").disabled = true;
  platformEl("companyFormError").hidden = true; platformEl("createCompany").textContent = 'Creating company…';
  try {
    const result = await platformCall({ action: "create", ...details, request_id: platformRequest.id });
    platformEl("companyDialog").close();
    platformMessage(result.invitation_sent ? 'Company created. The first Admin invitation was sent.' : `Company created, but the invitation needs attention: ${result.warning}`, !result.invitation_sent);
    try { await refreshPlatform(); } catch (e) { platformMessage(`Company saved. Refresh the list when the connection returns. ${e.message}`,true); }
  } catch (error) { platformEl("companyFormError").textContent = error.message; platformEl("companyFormError").hidden = false; }
  finally { platformBusy = false; platformEl("createCompany").disabled = false; platformEl("closeCompanyDialog").disabled = false; platformEl("createCompany").textContent = 'Create company & send invitation'; }
});
platformEl("companyList").addEventListener("click", async e => {
  const button = e.target.closest('button[data-action]'); if (!button || platformBusy) return;
  const company = platformCompanies.find(c=>c.id===button.dataset.id); if (!company) return;
  const status = company.status === 'active' ? 'suspended' : 'active';
  if (button.dataset.action === 'status') {
    platformPendingStatus={id:company.id,status};
    platformEl('statusDialogMessage').textContent=`${status === 'suspended' ? 'Suspend' : 'Activate'} ${company.name}?`;
    platformEl('statusDialog').showModal();return;
  }
  platformBusy = true; button.disabled = true;
  try {
    await platformCall(button.dataset.action === 'resend' ? {action:'resend',organisation_id:company.id} : {action:'set-status',organisation_id:company.id,status});
    platformMessage(button.dataset.action === 'resend' ? 'Invitation sent. Ask the Admin to use the newest email.' : 'Company status updated.');
    await refreshPlatform();
  } catch(error) { platformMessage(error.message,true); }
  finally { platformBusy = false; button.disabled = false; }
});
platformEl('cancelStatus').addEventListener('click',()=>platformEl('statusDialog').close());
platformEl('statusDialog').addEventListener('cancel',event=>{if(platformBusy)event.preventDefault()});
platformEl('statusForm').addEventListener('submit',async event=>{
  event.preventDefault();if(platformBusy||!platformPendingStatus)return;
  platformBusy=true;platformEl('confirmStatus').disabled=true;platformEl('cancelStatus').disabled=true;
  try{
    await platformCall({action:'set-status',organisation_id:platformPendingStatus.id,status:platformPendingStatus.status});
    platformEl('statusDialog').close();platformMessage('Company status updated.');await refreshPlatform();
  }catch(error){platformEl('statusDialog').close();platformMessage(error.message,true)}
  finally{platformBusy=false;platformEl('confirmStatus').disabled=false;platformEl('cancelStatus').disabled=false}
});
initialisePlatform().catch(error => { platformEl("platformAccess").innerHTML = `<h1>Platform setup needs attention</h1><p>${platformEscape(error.message)}</p><a href="/">Return to sign in</a>`; });

/* Construct360 real authentication layer (Supabase) */
let c360Supabase=null;
let c360Session=null;
let c360Access=null;
let c360RecoveryMode=false;

function authUrlIntent(){
  return new URL(window.location.href).searchParams.get("auth")||"";
}
function authUrlError(){
  const u=new URL(window.location.href);
  const hash=new URLSearchParams(u.hash.replace(/^#/,""));
  return u.searchParams.get("error_description")||hash.get("error_description")||"";
}
function clearAuthCallbackUrl(){
  const u=new URL(window.location.href);
  ["auth","code","error","error_code","error_description","type","token_hash"].forEach(k=>u.searchParams.delete(k));
  u.hash="";
  window.history.replaceState({},document.title,`${u.pathname}${u.search}`);
}
function setInviteFormState(state,user=null,reason=""){
  const intro=document.getElementById("inviteIntro");
  const email=document.getElementById("inviteAccountEmail");
  const fields=[document.getElementById("invitePassword"),document.getElementById("invitePasswordConfirm")];
  const button=document.getElementById("completeInviteBtn");
  const acceptButton=document.getElementById("acceptInviteBtn");
  const help=document.getElementById("inviteHelp");
  if(state==="review"){
    if(intro)intro.innerHTML="<b>You have been invited to Construct360.</b><br>Select <b>Accept invitation</b> to verify the secure link. You will then create your password.";
    if(email)email.style.display="none";
    fields.forEach(x=>{if(x){x.disabled=true;x.value=""}});
    if(button){button.disabled=true;button.textContent="Create password and join workspace"}
    if(acceptButton){acceptButton.style.display="block";acceptButton.disabled=false;acceptButton.textContent="Accept invitation"}
    if(help)help.style.display="none";
    acceptButton?.focus();
    return;
  }
  if(state==="ready"){
    if(intro)intro.innerHTML="<b>Invitation accepted.</b><br>Choose a password, then select <b>Create password and join workspace</b>.";
    if(email){email.textContent=user?.email||"Your invited email";email.style.display="block"}
    fields.forEach(x=>{if(x)x.disabled=false});
    if(button){button.disabled=false;button.textContent="Create password and join workspace"}
    if(acceptButton)acceptButton.style.display="none";
    if(help)help.style.display="none";
    fields[0]?.focus();
    return;
  }
  if(state==="invalid"){
    if(intro)intro.innerHTML=`<b>This invitation link could not be verified.</b><br>${reason?escapeHtmlAttr(reason):"It may have expired, already been used, or opened in an unsupported email preview."} Ask your Construct360 administrator to send a new invitation.`;
    if(email)email.style.display="none";
    fields.forEach(x=>{if(x){x.disabled=true;x.value=""}});
    if(button){button.disabled=true;button.textContent="Invitation unavailable"}
    if(acceptButton)acceptButton.style.display="none";
    if(help)help.style.display="block";
    return;
  }
  if(intro)intro.innerHTML="<b>Accepting your invitation…</b><br>Please wait while Construct360 verifies the secure link.";
  if(email)email.style.display="none";
  fields.forEach(x=>{if(x)x.disabled=true});
  if(button){button.disabled=true;button.textContent="Verifying invitation…"}
  if(acceptButton)acceptButton.style.display="none";
  if(help)help.style.display="none";
}

function authConfigReady(){
  const c=window.CONSTRUCT360_CONFIG||{};
  return Boolean(c.supabaseUrl&&c.supabaseAnonKey&&!c.supabaseUrl.startsWith("YOUR_")&&!c.supabaseAnonKey.startsWith("YOUR_"));
}
function authClient(){
  if(c360Supabase)return c360Supabase;
  if(!authConfigReady())return null;
  c360Supabase=window.supabase.createClient(window.CONSTRUCT360_CONFIG.supabaseUrl,window.CONSTRUCT360_CONFIG.supabaseAnonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}
  });
  return c360Supabase;
}
function setAuthLoading(on,text="Working securely…"){
  const el=document.getElementById("authLoading");if(!el)return;
  el.textContent=text;el.classList.toggle("show",Boolean(on));
}
function setAuthMessage(message,type="error"){
  const el=document.getElementById("authMessage");if(!el)return;
  if(!message){el.className="auth-message";el.textContent="";return}
  el.textContent=message;el.className=`auth-message ${type} show`;
}
function switchAuthView(name){
  document.querySelectorAll(".auth-view").forEach(x=>x.classList.remove("active"));
  document.getElementById(`auth-${name}`)?.classList.add("active");
  document.querySelectorAll("#authTabs button").forEach(x=>x.classList.toggle("active",x.dataset.authView===name));
  const tabs=document.getElementById("authTabs");if(tabs)tabs.style.display=["signin","signup"].includes(name)?"flex":"none";
  const titles={signin:["Sign in to Construct360","Secure access to your company workspace."],signup:["Create your account","Start with a verified work email."],forgot:["Reset your password","We’ll email you a secure recovery link."],reset:["Choose a new password","Your recovery link has been verified."],"invite-password":["Secure your invited account","Choose a password for future sign-ins."],onboarding:["Create your company workspace","The first verified user becomes the company Admin."],disabled:["Access unavailable","Your account is signed in but not active."],verify:["Verify your email","One final step before using Construct360."]};
  const t=titles[name]||titles.signin;
  const h=document.getElementById("authHeading"),s=document.getElementById("authSubheading");if(h)h.textContent=t[0];if(s)s.textContent=t[1];
  setAuthMessage("");
}
function normaliseAuthError(error){
  const raw=String(error?.message||error||"Authentication failed");
  const map=[
    [/invalid login credentials/i,"Email or password is incorrect."],
    [/email not confirmed/i,"Verify your email before signing in."],
    [/user already registered/i,"An account already exists for that email."],
    [/password should be at least/i,"Your password does not meet the minimum length."],
    [/rate limit/i,"Too many attempts. Wait briefly and try again."]
  ];
  for(const [rx,msg] of map)if(rx.test(raw))return msg;
  return raw;
}
function passwordIsStrong(p){return typeof p==="string"&&p.length>=10}
function currentRedirectUrl(mode="auth"){
  const u=new URL(window.location.href);u.search="";u.hash="";u.searchParams.set("auth",mode);return u.toString();
}
async function loginUser(){
  const sb=authClient();if(!sb){showMissingAuthConfig();return}
  const email=document.getElementById("loginUser")?.value.trim();
  const password=document.getElementById("loginPassword")?.value||"";
  if(!email||!password){setAuthMessage("Enter your email address and password.");return}
  setAuthLoading(true,"Signing in securely…");setAuthMessage("");
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  setAuthLoading(false);
  if(error){setAuthMessage(normaliseAuthError(error));return}
  c360Session=data.session;await routeAuthenticatedUser();
}
async function signUpUser(){
  const sb=authClient();if(!sb){showMissingAuthConfig();return}
  const full_name=(document.getElementById("signupName")?.value||"").trim();
  const email=(document.getElementById("signupEmail")?.value||"").trim();
  const p=document.getElementById("signupPassword")?.value||"";
  const p2=document.getElementById("signupPasswordConfirm")?.value||"";
  if(!full_name||!email){setAuthMessage("Enter your name and work email.");return}
  if(!passwordIsStrong(p)){setAuthMessage("Use a password with at least 10 characters.");return}
  if(p!==p2){setAuthMessage("The passwords do not match.");return}
  setAuthLoading(true,"Creating your secure account…");
  const {data,error}=await sb.auth.signUp({email,password:p,options:{emailRedirectTo:currentRedirectUrl("confirm"),data:{full_name,needs_password_setup:false}}});
  setAuthLoading(false);
  if(error){setAuthMessage(normaliseAuthError(error));return}
  if(data.session){c360Session=data.session;await routeAuthenticatedUser();return}
  switchAuthView("verify");
}
async function sendPasswordReset(){
  const sb=authClient();if(!sb){showMissingAuthConfig();return}
  const email=(document.getElementById("forgotEmail")?.value||"").trim();
  if(!email){setAuthMessage("Enter your email address.");return}
  setAuthLoading(true,"Sending recovery email…");
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:currentRedirectUrl("recovery")});
  setAuthLoading(false);
  if(error){setAuthMessage(normaliseAuthError(error));return}
  setAuthMessage("If that account exists, a password-reset email has been sent.","success");
}
async function completePasswordReset(){
  const sb=authClient();if(!sb)return;
  const p=document.getElementById("resetPassword")?.value||"";const p2=document.getElementById("resetPasswordConfirm")?.value||"";
  if(!passwordIsStrong(p)){setAuthMessage("Use a password with at least 10 characters.");return}
  if(p!==p2){setAuthMessage("The passwords do not match.");return}
  setAuthLoading(true,"Updating password…");const {error}=await sb.auth.updateUser({password:p});setAuthLoading(false);
  if(error){setAuthMessage(normaliseAuthError(error));return}
  c360RecoveryMode=false;setAuthMessage("Password updated. You are signed in.","success");await routeAuthenticatedUser();
}
async function completeInvitePassword(){
  const sb=authClient();if(!sb)return;
  const p=document.getElementById("invitePassword")?.value||"";const p2=document.getElementById("invitePasswordConfirm")?.value||"";
  if(!passwordIsStrong(p)){setAuthMessage("Use a password with at least 10 characters.");return}
  if(p!==p2){setAuthMessage("The passwords do not match.");return}
  setAuthLoading(true,"Securing account…");
  const {error}=await sb.auth.updateUser({password:p,data:{needs_password_setup:false}});setAuthLoading(false);
  if(error){setAuthMessage(normaliseAuthError(error));return}
  clearAuthCallbackUrl();
  setAuthMessage("Your password is set. Opening your company workspace…","success");
  await routeAuthenticatedUser();
}
async function acceptEmailInvitation(){
  const sb=authClient();if(!sb)return;
  const u=new URL(window.location.href);const tokenHash=u.searchParams.get("token_hash")||"";
  if(!tokenHash){setInviteFormState("invalid",null,"The secure invitation token is missing.");return}
  const acceptButton=document.getElementById("acceptInviteBtn");
  if(acceptButton){acceptButton.disabled=true;acceptButton.textContent="Accepting invitation…"}
  setAuthLoading(true,"Accepting your invitation…");
  const {data,error}=await sb.auth.verifyOtp({token_hash:tokenHash,type:"invite"});
  setAuthLoading(false);
  if(error){setInviteFormState("invalid",null,normaliseAuthError(error));return}
  c360Session=data.session;
  u.searchParams.delete("token_hash");u.searchParams.delete("type");u.hash="";
  window.history.replaceState({},document.title,`${u.pathname}${u.search}`);
  setInviteFormState("ready",data.user);
}
async function logoutUser(){
  const sb=authClient();if(sb)await sb.auth.signOut();c360Session=null;c360Access=null;showLogin();switchAuthView("signin");
  const pw=document.getElementById("loginPassword");if(pw)pw.value="";
}
async function createCompanyWorkspace(){
  const sb=authClient();if(!sb)return;
  const name=(document.getElementById("onboardingCompany")?.value||"").trim();
  if(name.length<2){setAuthMessage("Enter your company name.");return}
  setAuthLoading(true,"Creating company workspace…");
  const {error}=await sb.rpc("create_organisation_and_admin",{p_name:name});setAuthLoading(false);
  if(error){setAuthMessage(normaliseAuthError(error));return}
  await routeAuthenticatedUser();
}
async function fetchCurrentAccess(){
  const sb=authClient();
  const {data:{user},error:ue}=await sb.auth.getUser();if(ue||!user)return {user:null};
  const [{data:profile,error:pe},{data:membership,error:me}]=await Promise.all([
    sb.from("profiles").select("id,email,full_name,avatar_url").eq("id",user.id).maybeSingle(),
    sb.from("organisation_memberships").select("id,organisation_id,role,is_active,organisations(id,name,slug)").eq("user_id",user.id).maybeSingle()
  ]);
  if(pe)throw pe;if(me)throw me;
  return {user,profile,membership,organisation:membership?.organisations||null};
}
async function syncLinkedStaffFromSupabase(){
  if(!c360Access?.membership?.organisation_id||!Array.isArray(window.staff||staff))return;
  const {data,error}=await authClient().from("staff_members").select("id,user_id,full_name,email,employment_role,team_name,qualification,availability,is_active").eq("organisation_id",c360Access.membership.organisation_id).order("created_at");
  if(error){console.warn("Linked staff could not be loaded",error);return}
  for(let i=staff.length-1;i>=0;i--)if(staff[i]._linkedUser)staff.splice(i,1);
  (data||[]).forEach(row=>staff.push({staffId:row.id,userId:row.user_id,name:row.full_name,role:row.employment_role,team:"",qual:row.qualification||"None",avail:row.is_active?(row.availability||"Available"):"Unavailable",driver:"No",hourlyRate:0,notes:`Linked Construct360 account · ${row.email}`,_linkedUser:true,isActive:row.is_active,credentials:[],leave:[],training:[]}));
  const state=getTeams();
  (data||[]).forEach(row=>state.assignments[row.id]=row.team_name||"Unassigned");
  saveTeams(state);
}
async function routeAuthenticatedUser(){
  const sb=authClient();if(!sb){showMissingAuthConfig();return}
  setAuthLoading(true,"Loading your company access…");
  try{
    const {data:{session}}=await sb.auth.getSession();c360Session=session;
    if(!session){setAuthLoading(false);showLogin();switchAuthView("signin");return}
    if(c360RecoveryMode){setAuthLoading(false);showLogin();switchAuthView("reset");return}
    if(session.user?.user_metadata?.needs_password_setup){setAuthLoading(false);showLogin();switchAuthView("invite-password");setInviteFormState("ready",session.user);return}
    c360Access=await fetchCurrentAccess();setAuthLoading(false);
    if(!c360Access.user){showLogin();switchAuthView("signin");return}
    if(!c360Access.membership){showLogin();switchAuthView("onboarding");return}
    if(!c360Access.membership.is_active){showLogin();switchAuthView("disabled");return}
    await syncLinkedStaffFromSupabase();
    applyAccessToUi();showApp(c360Access.profile?.full_name||c360Access.user.email);await logAppActivity("session_ready","Signed in to Construct360");
  }catch(e){setAuthLoading(false);console.error(e);showLogin();switchAuthView("signin");setAuthMessage("Your company access could not be loaded. Try signing in again.");}
}
function applyAccessToUi(){
  if(!c360Access)return;
  const display=c360Access.profile?.full_name||c360Access.user?.email||"User";
  document.getElementById("loggedInUser").textContent=display;
  const av=document.getElementById("userAvatar");if(av)av.textContent=display.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"U";
  const admin=document.getElementById("adminUsersBtn");if(admin)admin.style.display=c360Access.membership?.role==="admin"?"inline-block":"none";
}
async function logAppActivity(event_type,description,metadata={}){
  try{
    if(!c360Access?.membership?.organisation_id)return;
    await authClient().from("user_activity_log").insert({organisation_id:c360Access.membership.organisation_id,actor_user_id:c360Access.user.id,event_type,description,metadata});
  }catch(e){console.warn("Activity log not written",e)}
}
function showMissingAuthConfig(){
  showLogin();switchAuthView("signin");
  const w=document.getElementById("authSetupWarning");if(w)w.style.display="block";
  setAuthMessage("Supabase is not connected yet. Configure the Vercel Supabase environment variables, or use config.js for local development.","info");
  document.querySelectorAll("#auth-signin button.btn,#auth-signup button.btn,#auth-forgot button.btn").forEach(b=>b.disabled=true);
}
async function initialiseSupabaseAuth(){
  showLogin();
  if(!authConfigReady()){showMissingAuthConfig();return}
  const sb=authClient(),intent=authUrlIntent(),inviteTokenHash=new URL(window.location.href).searchParams.get("token_hash")||"";
  if(intent==="invite"){
    switchAuthView("invite-password");
    setInviteFormState(authUrlError()?"invalid":inviteTokenHash?"review":"checking");
  }
  setAuthLoading(!inviteTokenHash,intent==="invite"?"Verifying your invitation…":"Restoring your secure session…");
  sb.auth.onAuthStateChange(async(event,session)=>{
    c360Session=session;
    if(event==="PASSWORD_RECOVERY"){c360RecoveryMode=true;setAuthLoading(false);showLogin();switchAuthView("reset");return}
    if(event==="SIGNED_OUT"){c360Access=null;setAuthLoading(false);showLogin();switchAuthView("signin");return}
    if(event==="INITIAL_SESSION"&&!session&&intent==="invite")return;
    if((event==="SIGNED_IN"||event==="INITIAL_SESSION"||event==="USER_UPDATED")&&session){setTimeout(()=>routeAuthenticatedUser(),0)}
  });
  const {data:{session},error}=await sb.auth.getSession();
  if(error){setAuthLoading(false);setAuthMessage(normaliseAuthError(error));return}
  c360Session=session;
  if(!session&&intent==="invite"&&inviteTokenHash){
    setAuthLoading(false);showLogin();switchAuthView("invite-password");setInviteFormState("review");return;
  }
  if(!session&&intent==="invite"){
    if(authUrlError()){
      setAuthLoading(false);showLogin();switchAuthView("invite-password");setInviteFormState("invalid",null,authUrlError());
      return;
    }
    const started=Date.now();
    const waitForInviteSession=async()=>{
      const {data:{session:retrySession},error:retryError}=await sb.auth.getSession();
      if(retrySession){c360Session=retrySession;await routeAuthenticatedUser();return}
      if(retryError){setAuthLoading(false);showLogin();switchAuthView("invite-password");setInviteFormState("invalid",null,normaliseAuthError(retryError));return}
      if(Date.now()-started<15000){setTimeout(waitForInviteSession,500);return}
      setAuthLoading(false);showLogin();switchAuthView("invite-password");setInviteFormState("invalid");
    };
    setTimeout(waitForInviteSession,500);
    return;
  }
  if(!session){setAuthLoading(false);switchAuthView("signin")}
}
async function openAccountPanel(){
  if(!c360Access)return;
  const p=c360Access.profile||{};const org=c360Access.organisation||{};const role=c360Access.membership?.role||"";
  modalbox.innerHTML=`<div class="modalhead"><div><h2 style="margin:0">Account</h2><div class="sub">Your Construct360 identity and company access.</div></div><button class="close" onclick="closeModal()">✕</button></div>
  <div class="formgrid" style="margin-top:14px"><div class="field"><label>Email</label><input value="${escapeHtmlAttr(c360Access.user.email||"")}" disabled></div><div class="field"><label>Role</label><input value="${escapeHtmlAttr(role)}" disabled></div><div class="field full"><label>Company</label><input value="${escapeHtmlAttr(org.name||"")}" disabled></div><div class="field full"><label>Full name</label><input id="accountFullName" maxlength="120" value="${escapeHtmlAttr(p.full_name||"")}"></div></div>
  <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn" onclick="saveAccountProfile()">Save profile</button></div>`;modal.classList.add("show");
}
async function saveAccountProfile(){
  const name=(document.getElementById("accountFullName")?.value||"").trim();if(!name){toast("Enter your name");return}
  const {error}=await authClient().from("profiles").update({full_name:name,updated_at:new Date().toISOString()}).eq("id",c360Access.user.id);
  if(error){toast(normaliseAuthError(error));return}c360Access.profile.full_name=name;applyAccessToUi();closeModal();toast("Profile updated");await logAppActivity("profile_updated","Updated account profile");
}
async function callAdminFunction(body){
  const {data,error}=await authClient().functions.invoke(window.CONSTRUCT360_CONFIG.adminFunctionName||"admin-users",{body});
  if(data?.error)throw new Error(data.error);
  if(error){
    let message=error.message||"The request failed.";
    try{const details=await error.context?.json();if(details?.error)message=details.error}catch{}
    throw new Error(message);
  }
  return data;
}
async function openAdminUsers(){
  if(c360Access?.membership?.role!=="admin"){toast("Admin access required");return}
  modalbox.innerHTML=`<div class="modalhead"><div><h2 style="margin:0">Users & access</h2><div class="sub">Invite users, assign roles and control company access.</div></div><button class="close" onclick="closeModal()">✕</button></div><div id="adminUsersContent" style="margin-top:14px"><div class="muted">Loading users…</div></div>`;modal.classList.add("show");await refreshAdminUsers();
}
async function refreshAdminUsers(){
  const sb=authClient(),orgId=c360Access.membership.organisation_id;
  const {data:members,error}=await sb.from("organisation_memberships").select("user_id,role,is_active,created_at").eq("organisation_id",orgId).order("created_at");
  if(error){document.getElementById("adminUsersContent").innerHTML=`<div class="login-error show">${escapeHtmlAttr(normaliseAuthError(error))}</div>`;return}
  const ids=members.map(m=>m.user_id);let profiles=[];if(ids.length){const r=await sb.from("profiles").select("id,email,full_name").in("id",ids);if(r.error)throw r.error;profiles=r.data||[]}
  const pmap=Object.fromEntries(profiles.map(p=>[p.id,p]));
  document.getElementById("adminUsersContent").innerHTML=`<div class="card" style="padding:12px"><h3>Invite user</h3><div class="formgrid"><div class="field"><label>Full name</label><input id="inviteName" maxlength="120" placeholder="New user"></div><div class="field"><label>Email</label><input id="inviteEmail" type="email" placeholder="user@company.co.uk"></div><div class="field"><label>Role</label><select id="inviteRole"><option value="operations">Operations</option><option value="supervisor">Supervisor</option><option value="operative">Operative</option><option value="admin">Admin</option></select></div><div class="field" style="display:flex;align-items:end"><button class="btn" id="sendInviteBtn" style="width:100%" onclick="inviteCompanyUser()">Send invite</button></div></div><div class="muted" style="margin-top:9px">Operatives and Supervisors are also added automatically to the Staff page.</div></div>
  <div class="user-admin-list">${members.map(m=>{const p=pmap[m.user_id]||{};return `<div class="user-admin-row"><div><div class="user-admin-name">${escapeHtmlAttr(p.full_name||"User")}</div><div class="user-admin-email">${escapeHtmlAttr(p.email||m.user_id)}</div></div><select onchange="changeCompanyUserRole('${m.user_id}',this.value)" ${m.user_id===c360Access.user.id?'disabled':''}><option value="admin" ${m.role==='admin'?'selected':''}>Admin</option><option value="operations" ${m.role==='operations'?'selected':''}>Operations</option><option value="supervisor" ${m.role==='supervisor'?'selected':''}>Supervisor</option><option value="operative" ${m.role==='operative'?'selected':''}>Operative</option></select><button class="btn secondary" ${m.user_id===c360Access.user.id?'disabled':''} onclick="setCompanyUserActive('${m.user_id}',${!m.is_active})"><span class="status-dot ${m.is_active?'':'off'}"></span>${m.is_active?'Active':'Disabled'}</button><button class="btn danger" ${m.user_id===c360Access.user.id?'disabled':''} onclick="permanentlyDeleteCompanyUser('${m.user_id}')">Remove permanently</button></div>`}).join("")}</div>`;
}
async function inviteCompanyUser(){
  const full_name=(document.getElementById("inviteName")?.value||"").trim(),email=(document.getElementById("inviteEmail")?.value||"").trim(),role=document.getElementById("inviteRole")?.value;
  if(!full_name||!email){toast("Enter the user's name and email");return}
  const button=document.getElementById("sendInviteBtn");if(button){button.disabled=true;button.textContent="Sending…"}
  try{await callAdminFunction({action:"invite",full_name,email,role});toast("Invitation sent and user created");await refreshAdminUsers()}catch(e){toast(normaliseAuthError(e));if(button){button.disabled=false;button.textContent="Send invite"}}
}
async function changeCompanyUserRole(user_id,role){try{await callAdminFunction({action:"update-role",user_id,role});await syncLinkedStaffFromSupabase();toast("Role updated");await refreshAdminUsers()}catch(e){toast(normaliseAuthError(e));await refreshAdminUsers()}}
async function setCompanyUserActive(user_id,is_active){try{await callAdminFunction({action:"set-active",user_id,is_active});await syncLinkedStaffFromSupabase();toast(is_active?"User reactivated":"User disabled");await refreshAdminUsers()}catch(e){toast(normaliseAuthError(e));await refreshAdminUsers()}}
async function permanentlyDeleteCompanyUser(user_id){
  if(!confirm("Permanently delete this user?\n\nThis removes their login, company access and linked Staff record. This cannot be undone."))return;
  if(!confirm("Final confirmation: permanently delete this user?"))return;
  try{await callAdminFunction({action:"delete-user",user_id});await syncLinkedStaffFromSupabase();toast("User permanently deleted");await refreshAdminUsers()}catch(e){toast(normaliseAuthError(e));await refreshAdminUsers()}
}

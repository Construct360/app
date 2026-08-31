import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const roles=new Set(["admin","operations","supervisor","operative"]);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const staffRole=(role:string)=>role==="supervisor"?"Scaffold Supervisor":role==="operative"?"Operative":null;

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl=Deno.env.get("APP_URL")||req.headers.get("origin")||"";
    const authHeader=req.headers.get("Authorization")||"";
    const token=authHeader.replace(/^Bearer\s+/i,"");
    if(!token)return json({error:"Authentication required"},401);
    const admin=createClient(url,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user)return json({error:"Invalid or expired session"},401);
    const {data:caller,error:callerError}=await admin.from("organisation_memberships").select("organisation_id,role,is_active").eq("user_id",user.id).maybeSingle();
    if(callerError||!caller||!caller.is_active||caller.role!=="admin")return json({error:"Admin access required"},403);
    const body=await req.json();const action=String(body.action||"");

    if(action==="invite"){
      const email=String(body.email||"").trim().toLowerCase();const full_name=String(body.full_name||"").trim();const role=String(body.role||"operative");
      if(!email.includes("@")||!full_name||!roles.has(role))return json({error:"Valid name, email and role are required"},400);
      const {data:existingMembership}=await admin.from("organisation_memberships").select("user_id").eq("organisation_id",caller.organisation_id).eq("user_id",body.user_id||"00000000-0000-0000-0000-000000000000").maybeSingle();
      if(existingMembership)return json({error:"User already belongs to this company"},409);
      const redirectTo=appUrl?`${appUrl.replace(/\/$/,"")}/?auth=invite`:undefined;
      const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{full_name,needs_password_setup:true}});
      if(inviteError)throw inviteError;
      const invitedUser=invited.user;if(!invitedUser)return json({error:"Invite did not create a user"},500);
      await admin.from("profiles").upsert({id:invitedUser.id,email,full_name},{onConflict:"id"});
      const {error:membershipError}=await admin.from("organisation_memberships").insert({organisation_id:caller.organisation_id,user_id:invitedUser.id,role,is_active:true,created_by:user.id});
      if(membershipError)throw membershipError;
      const linkedRole=staffRole(role);
      if(linkedRole){
        const {error:staffError}=await admin.from("staff_members").upsert({organisation_id:caller.organisation_id,user_id:invitedUser.id,full_name,email,employment_role:linkedRole,team_name:"Unassigned",qualification:"None",availability:"Available",is_active:true,created_by:user.id},{onConflict:"user_id"});
        if(staffError)throw staffError;
      }
      await admin.from("user_activity_log").insert({organisation_id:caller.organisation_id,actor_user_id:user.id,event_type:"user_invited",description:`Invited ${email} as ${role}`,metadata:{target_user_id:invitedUser.id}});
      return json({ok:true,user_id:invitedUser.id});
    }

    if(action==="update-role"){
      const target=String(body.user_id||"");const role=String(body.role||"");if(!target||!roles.has(role))return json({error:"Valid user and role required"},400);
      const {data:m}=await admin.from("organisation_memberships").select("role,is_active").eq("organisation_id",caller.organisation_id).eq("user_id",target).maybeSingle();if(!m)return json({error:"User is not in this company"},404);
      if(m.role==="admin"&&role!=="admin"){
        const {count}=await admin.from("organisation_memberships").select("id",{count:"exact",head:true}).eq("organisation_id",caller.organisation_id).eq("role","admin").eq("is_active",true);
        if((count||0)<=1)return json({error:"A company must keep at least one active Admin"},400);
      }
      const {error}=await admin.from("organisation_memberships").update({role}).eq("organisation_id",caller.organisation_id).eq("user_id",target);if(error)throw error;
      const linkedRole=staffRole(role);
      if(linkedRole){
        const {data:profile}=await admin.from("profiles").select("email,full_name").eq("id",target).maybeSingle();
        const {error:staffError}=await admin.from("staff_members").upsert({organisation_id:caller.organisation_id,user_id:target,full_name:profile?.full_name||profile?.email||"Staff member",email:profile?.email||"",employment_role:linkedRole,is_active:m.is_active,created_by:user.id},{onConflict:"user_id"});
        if(staffError)throw staffError;
      }else{
        const {error:staffError}=await admin.from("staff_members").delete().eq("organisation_id",caller.organisation_id).eq("user_id",target);
        if(staffError)throw staffError;
      }
      await admin.from("user_activity_log").insert({organisation_id:caller.organisation_id,actor_user_id:user.id,event_type:"user_role_changed",description:`Changed user role to ${role}`,metadata:{target_user_id:target}});
      return json({ok:true});
    }

    if(action==="set-active"){
      const target=String(body.user_id||"");const is_active=Boolean(body.is_active);if(!target)return json({error:"User required"},400);if(target===user.id)return json({error:"You cannot disable your own Admin account"},400);
      const {data:m}=await admin.from("organisation_memberships").select("role,is_active").eq("organisation_id",caller.organisation_id).eq("user_id",target).maybeSingle();if(!m)return json({error:"User is not in this company"},404);
      if(!is_active&&m.role==="admin"){
        const {count}=await admin.from("organisation_memberships").select("id",{count:"exact",head:true}).eq("organisation_id",caller.organisation_id).eq("role","admin").eq("is_active",true);
        if((count||0)<=1)return json({error:"A company must keep at least one active Admin"},400);
      }
      const {error}=await admin.from("organisation_memberships").update({is_active}).eq("organisation_id",caller.organisation_id).eq("user_id",target);if(error)throw error;
      const {error:staffError}=await admin.from("staff_members").update({is_active,availability:is_active?"Available":"Unavailable"}).eq("organisation_id",caller.organisation_id).eq("user_id",target);if(staffError)throw staffError;
      const {error:banError}=await admin.auth.admin.updateUserById(target,{ban_duration:is_active?"none":"876000h"});if(banError)throw banError;
      await admin.from("user_activity_log").insert({organisation_id:caller.organisation_id,actor_user_id:user.id,event_type:is_active?"user_reactivated":"user_disabled",description:is_active?"Reactivated company user":"Disabled company user",metadata:{target_user_id:target}});
      return json({ok:true});
    }

    if(action==="delete-user"){
      const target=String(body.user_id||"");
      if(!target)return json({error:"User required"},400);
      if(target===user.id)return json({error:"You cannot permanently delete your own Admin account"},400);
      const {data:m,error:membershipError}=await admin.from("organisation_memberships").select("role,is_active").eq("organisation_id",caller.organisation_id).eq("user_id",target).maybeSingle();
      if(membershipError||!m)return json({error:"User is not in this company"},404);
      if(m.role==="admin"){
        const {count}=await admin.from("organisation_memberships").select("id",{count:"exact",head:true}).eq("organisation_id",caller.organisation_id).eq("role","admin").eq("is_active",true);
        if(m.is_active&&(count||0)<=1)return json({error:"A company must keep at least one active Admin"},400);
      }
      const {data:profile}=await admin.from("profiles").select("email,full_name").eq("id",target).maybeSingle();
      await admin.from("user_activity_log").insert({organisation_id:caller.organisation_id,actor_user_id:user.id,event_type:"user_permanently_deleted",description:`Permanently deleted ${profile?.email||target}`,metadata:{target_user_id:target,target_email:profile?.email||null,target_name:profile?.full_name||null}});
      const {error:deleteError}=await admin.auth.admin.deleteUser(target,false);
      if(deleteError)throw deleteError;
      return json({ok:true});
    }
    return json({error:"Unknown action"},400);
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Unexpected server error"},500)}
});

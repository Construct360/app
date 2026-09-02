import { context, response, rpc, sendReservedInvite, HttpError } from "../_shared/platform.ts";

const roles=new Set(["admin","operations","supervisor","operative"]);
const staffRole=(role:string)=>role==="supervisor"?"Scaffold Supervisor":role==="operative"?"Operative":null;

Deno.serve(async(req)=>{
  const json=(body:unknown,status=200)=>response(req,body,status);
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const ctx=await context(req);
    const {admin,user}=ctx;
    const organisation_id=await rpc(ctx,"current_organisation_id");
    if(!organisation_id||!await rpc(ctx,"is_org_admin",{p_org:organisation_id}))return json({error:"Active company Admin access required"},403);
    const caller={organisation_id};
    const body=await req.json();const action=String(body.action||"");

    if(action==="invite"){
      const invitationId=await rpc(ctx,"prepare_company_user_invite",{
        p_email:String(body.email||""),p_full_name:String(body.full_name||""),p_role:String(body.role||"operative")
      });
      const user_id=await sendReservedInvite(ctx,invitationId);
      return json({ok:true,user_id});
    }
    if(!["update-role","set-active","delete-user"].includes(action))return json({error:"Unknown action"},400);
    const targetUser=String(body.user_id||"");
    if(targetUser===user.id)return json({error:"You cannot change or delete your own Admin access"},400);
    const {data:targetMember,error:targetError}=await admin.from("organisation_memberships").select("user_id").eq("organisation_id",caller.organisation_id).eq("user_id",targetUser).maybeSingle();
    if(targetError)throw targetError;
    if(!targetMember)return json({error:"User is not in this company"},404);
    const {data:platformAdmin,error:platformError}=await admin.from("platform_admins").select("user_id").eq("user_id",targetUser).maybeSingle();
    if(platformError)throw platformError;
    if(platformAdmin)return json({error:"Platform Administrator accounts cannot be changed through company user management"},403);

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
      const target=String(body.user_id||"");const is_active=body.is_active;if(typeof is_active!=="boolean")return json({error:"Active status must be true or false"},400);if(!target)return json({error:"User required"},400);if(target===user.id)return json({error:"You cannot disable your own Admin account"},400);
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
      if(profile?.email){
        const {error:invitationError}=await admin.from("organisation_invitations").delete().eq("organisation_id",caller.organisation_id).eq("email",profile.email.toLowerCase()).eq("initial_admin",false);
        if(invitationError)throw invitationError;
      }
      return json({ok:true});
    }
    return json({error:"Unknown action"},400);
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Unexpected server error"},e instanceof HttpError?e.status:500)}
});

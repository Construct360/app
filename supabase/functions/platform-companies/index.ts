import { context, response, rpc, sendReservedInvite, HttpError } from "../_shared/platform.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response(req, { ok: true });
  if (req.method !== "POST") return response(req, { error: "Method not allowed" }, 405);
  try {
    const ctx = await context(req);
    if (!await rpc(ctx, "is_platform_admin")) throw new HttpError("Platform Administrator access required", 403);
    const body = await req.json();
    switch (body.action) {
      case "list": {
        const [companies, activity] = await Promise.all([
          rpc(ctx, "platform_list_companies"), rpc(ctx, "platform_recent_activity"),
        ]);
        return response(req, { companies, activity });
      }
      case "create": {
        const organisation_id = await rpc(ctx, "platform_create_company", {
          p_name: body.name, p_admin_name: body.admin_name,
          p_admin_email: body.admin_email, p_request_id: body.request_id,
        });
        const { data: invitation, error } = await ctx.admin.from("organisation_invitations")
          .select("id,last_sent_at").eq("organisation_id", organisation_id).eq("initial_admin", true).single();
        if (error || !invitation) throw new HttpError("Company created but invitation status could not be loaded. Refresh the companies list.", 503);
        // Replaying a create request never sends a duplicate email.
        if (invitation.last_sent_at) return response(req, { ok: true, organisation_id, invitation_sent: true });
        try {
          await sendReservedInvite(ctx, invitation.id);
          return response(req, { ok: true, organisation_id, invitation_sent: true });
        } catch (error) {
          return response(req, { ok: true, organisation_id, invitation_sent: false,
            warning: error instanceof Error ? error.message : "Email sending was not confirmed. Use Resend invitation." });
        }
      }
      case "resend": {
        const { data: invitation, error } = await ctx.admin.from("organisation_invitations")
          .select("id").eq("organisation_id", body.organisation_id).eq("initial_admin", true).single();
        if (error || !invitation) throw new HttpError("No first Admin invitation exists for this company");
        await sendReservedInvite(ctx, invitation.id);
        return response(req, { ok: true });
      }
      case "set-status":
        await rpc(ctx, "platform_set_company_status", { p_org: body.organisation_id, p_status: body.status });
        return response(req, { ok: true });
      default: throw new HttpError("Unknown action");
    }
  } catch (error) {
    console.error("platform-companies request failed", { message: error instanceof Error ? error.message : "Unexpected error" });
    return response(req, { error: error instanceof Error ? error.message : "Unexpected server error" },
      error instanceof HttpError ? error.status : 500);
  }
});

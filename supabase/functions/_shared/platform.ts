import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function response(req: Request, body: unknown, status = 200) {
  const allowed = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  } });
}
export async function context(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const configured = Deno.env.get("APP_URL");
  if (!url || !serviceKey || !anonKey || !configured) throw new HttpError("Server setup is incomplete. Check APP_URL and Supabase secrets.", 503);
  const app = new URL(configured);
  if (app.protocol !== "https:" || app.username || app.password || app.search || app.hash || app.pathname !== "/") {
    throw new HttpError("APP_URL must be your HTTPS application origin, without a path or wildcard.", 503);
  }
  if (req.headers.get("origin") && req.headers.get("origin") !== app.origin) throw new HttpError("This application origin is not allowed", 403);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError("Sign in to continue", 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user || !user.email_confirmed_at) throw new HttpError("A verified, signed-in account is required", 401);
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { admin, caller, user, appUrl: app.origin };
}
export type Context = Awaited<ReturnType<typeof context>>;
export async function rpc(ctx: Context, name: string, args = {}) {
  const { data, error } = await ctx.caller.rpc(name, args);
  if (error) throw new HttpError(error.message, error.code === "42501" ? 403 : 400);
  return data;
}
export async function sendReservedInvite(ctx: Context, id: string) {
  const reservation = await rpc(ctx, "claim_company_invitation", { p_id: id });
  try {
    const { data, error } = await ctx.admin.auth.admin.inviteUserByEmail(reservation.email, {
      redirectTo: `${ctx.appUrl}/?auth=invite`,
      data: { full_name: reservation.full_name, needs_password_setup: true },
    });
    if (error) throw new HttpError(error.message, 502);
    if (!data.user) throw new HttpError("Invitation sending was not confirmed", 502);
    const { data: membership, error: membershipError } = await ctx.admin.from("organisation_memberships")
      .select("organisation_id").eq("user_id", data.user.id).maybeSingle();
    if (membershipError || membership?.organisation_id !== reservation.organisation_id) {
      throw new HttpError("Invitation access is not ready. Check migration 003 before retrying.", 503);
    }
    return data.user.id;
  } catch (error) {
    // Never delete an account after a timeout or failed send.
    try { await rpc(ctx, "mark_company_invitation_failed", { p_id: id, p_attempt_id: reservation.attempt_id }); }
    catch { console.error("Invitation failure status could not be recorded", { invitation_id: id }); }
    throw error;
  }
}

export default function handler(req, res) {
  const config = {
    supabaseUrl: process.env.CONSTRUCT360_SUPABASE_URL || "",
    supabaseAnonKey: process.env.CONSTRUCT360_SUPABASE_PUBLISHABLE_KEY || "",
    adminFunctionName: process.env.CONSTRUCT360_ADMIN_FUNCTION_NAME || "admin-users",
    productionAppUrl: "https://app.construct-360.co.uk",
    marketingSiteUrl: "https://construct-360.co.uk"
  };

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).send(`window.CONSTRUCT360_CONFIG = ${JSON.stringify(config)};`);
}

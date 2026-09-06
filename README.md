# Construct360 · Client, Staff & Weather Release · v14

Start with **[START_HERE_v14.md](START_HERE_v14.md)** for installation and acceptance checks. Local results and limits are in **[VERIFICATION_v14.md](VERIFICATION_v14.md)**.

This update adds client contact positions and site links, staff positions and hourly rates, private qualification images, branded staff PDFs, and a location-changeable weather panel. It retains v13 Staff, Teams, Planner and company/role permissions.

- Company workspace: `/workspace`
- Platform Administration: `/platform`
- Prerequisite: working v13 installation, including migration `006_staff_teams_planner.sql`.
- New migration: `supabase/migrations/20260906180341_client_staff_documents_v14.sql`.
- New server-only Vercel variable: `WEATHER_API_KEY`.
- Existing Supabase Edge Functions, invitations, SMTP and domains remain unchanged.

Apply only the new migration to an existing v13 installation, then deploy this frontend/server update together. Do not rerun earlier migrations or the bootstrap script. Upload the extracted package contents to the existing GitHub repository root, not a containing folder or ZIP. Never upload live keys, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

This is a prepared release, not proof of deployment. Live Storage uploads and provider weather still need post-deployment verification. Continue using test companies until release acceptance and the remaining business workflows are complete.

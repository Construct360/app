# Construct360 · Combined Operations Release · v13

Start with **[START_HERE_v13.md](START_HERE_v13.md)** for the complete deployment order and one acceptance checklist. Verification results are in **[VERIFICATION_v13.md](VERIFICATION_v13.md)**.

This release connects company-specific Staff, Teams, Permissions and Planner with existing Clients and Jobs. It includes qualification expiry records, manual and invited staff, crew assignments, overlap protection and restricted field-user workspaces. Timesheets, inspections, RAMS, documents, photos, vehicles and equipment remain outside this release.

- Company workspace: `/workspace`
- Platform Administration: `/platform`
- Preserved legacy prototype (only previously enabled companies): `/?legacy=1`
- Prerequisite migration: `supabase/migrations/005_clients_jobs.sql`
- New migration: `supabase/migrations/006_staff_teams_planner.sql`
- Updated Edge Function: `supabase/functions/admin-users/index.ts`

Deploy the SQL and updated `admin-users` function before uploading this frontend. Keep existing Vercel configuration, SMTP, invitation template and domains. Never upload live keys, `.env`, `.vercel`, `node_modules` or `supabase/.temp`. Upload the extracted package contents to the existing GitHub repository root.

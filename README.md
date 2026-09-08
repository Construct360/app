# Construct360 · Timesheets · v16

Start with **[START_HERE_v16.md](START_HERE_v16.md)** for installation and acceptance checks. Local results and limits are in **[VERIFICATION_v16.md](VERIFICATION_v16.md)**.

This update adds daily saved drafts, explicit weekly timesheet submission, office approval/return, protected pay snapshots and Construct-360-branded PDF reports. It retains Vehicles, Staff, Clients, Planner, invitations and the compact weather widget.

- Company workspace: `/workspace`
- Platform Administration: `/platform`
- Prerequisite: working v15 installation, including the vehicle inspections migration.
- New migration: `supabase/migrations/20260908200027_timesheets_v16.sql`.
- No new environment variables or dependencies. Keep the existing server-only `WEATHER_API_KEY`.
- Existing Supabase Edge Functions, invitations, SMTP and domains remain unchanged.

Apply only the new migration to an existing v15 installation, then deploy this frontend update. Do not rerun earlier migrations or the bootstrap script. Upload the extracted package contents to the existing GitHub repository root, not a containing folder or ZIP. Never upload live keys, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

This is a prepared release, not proof of deployment. Complete the v16 live acceptance checks in two test companies after deployment. Timesheets require connectivity. Pay figures are base-pay estimates, not payroll calculations or payslips.

# Construct360 · Vehicles & Inspections · v15

Start with **[START_HERE_v15.md](START_HERE_v15.md)** for installation and acceptance checks. Local results and limits are in **[VERIFICATION_v15.md](VERIFICATION_v15.md)**.

This update adds a company vehicle register, inspections for every company role, defect resolution for Admin/Operations and retained inspection history. It includes all previous functionality and the compact Overview weather widget.

- Company workspace: `/workspace`
- Platform Administration: `/platform`
- Prerequisite: working v14 installation, including its client/staff documents migration.
- New migration: `supabase/migrations/20260907195118_vehicle_inspections_v15.sql`.
- No new environment variables or dependencies. Keep the existing server-only `WEATHER_API_KEY`.
- Existing Supabase Edge Functions, invitations, SMTP and domains remain unchanged.

Apply only the new migration to an existing v14 installation, then deploy this frontend update. Do not rerun earlier migrations or the bootstrap script. Upload the extracted package contents to the existing GitHub repository root, not a containing folder or ZIP. Never upload live keys, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

This is a prepared release, not proof of deployment. Complete the v15 live acceptance checks in two test companies after deployment. Inspections require connectivity and use a general checklist, not a vehicle-specific roadworthiness certification system.

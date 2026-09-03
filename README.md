# Construct360 · Clients & Jobs · v12

Start with **[START_HERE_v12.md](START_HERE_v12.md)** for the update instructions and acceptance checks.

This package builds on the tested v11 Platform Administration foundation. It adds organisation-owned Clients, contacts and Jobs for active company Admins and Operations users. Other operational modules are not yet migrated.

- Company workspace: `/workspace`
- Platform Administration: `/platform`
- Preserved legacy prototype (only previously enabled companies): `/?legacy=1`
- New database migration: `supabase/migrations/005_clients_jobs.sql`

No new Vercel variables, Edge Functions, SMTP configuration or invitation template are required when updating from v11. Read the guide before uploading. Never commit credentials or the local Supabase `.temp` folder.

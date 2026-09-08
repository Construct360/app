# Construct360 · Job files and scaffold inspections · v18

Start with **[START_HERE_v18.md](START_HERE_v18.md)**. Local results and limitations are in **[VERIFICATION_v18.md](VERIFICATION_v18.md)**.

This release adds company-wide shared job Images, RAMS and Important documents, office-only documents, worker progress uploads, and a common scaffold inspection page grouped by job. Each scaffold has its own initial/event-triggered requirements, seven-day deadlines and immutable branded reports. Unsupported timesheet input is now blocked as it is entered.

Everyone can submit scaffold inspections. Qualification rules are not yet configured: all reports are explicitly marked unverified, with in-app office warnings. Physical tag pairing and purchase entitlements remain future work, reusing the same stable scaffold identities and histories.

- Prerequisite: v16 timesheets plus the v17 half-hour SQL update.
- New migration: `supabase/migrations/20260908214340_job_files_scaffold_inspections_v18.sql`.
- Run SQL first, then upload the extracted package contents to the existing GitHub repository root.
- The migration creates a PRIVATE `job-files` bucket. Keep it private.
- No new API keys, environment variables, dependencies or Edge Function deployment.

No live deployment was performed during preparation. Complete the live acceptance checks and obtain review from a competent scaffold inspection lead before operational use. The app is a recording aid, not verification of inspector competence or a compliance certificate.

Earlier release guides remain for installation history; START_HERE_v18.md describes the current behaviour. Never upload live secrets, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

# Construct360 · Simpler timesheets · v17

Start with **[START_HERE_v17.md](START_HERE_v17.md)** for installation and acceptance checks. Local results and limitations are in **[VERIFICATION_v17.md](VERIFICATION_v17.md)**.

This update simplifies timesheets to one hours input per day, removes job selection, enforces whole/half-hour entries, renames pay figures Gross pay, and adds daily gross rates/pay to office PDFs. Save draft, Submit week, approvals, company separation and private pay remain unchanged.

- Company workspace: `/workspace`
- Platform Administration: `/platform`
- Prerequisite: working v16 timesheets.
- New migration: `supabase/migrations/20260908210129_timesheets_simplified_v17.sql`.
- No new configuration, dependencies or Edge Function deployment.

Apply the v17 SQL update first, then upload the extracted package contents to the existing GitHub repository root. If v16 SQL has not been installed, follow the prerequisite in START_HERE_v17.md; do not rerun migrations that have already succeeded. Never upload live keys, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

This is a prepared release, not proof of deployment. Gross pay is hours multiplied by the hourly rate, not a payslip or a full payroll calculation. Earlier release guides are included only for installation history; v17 supersedes their timesheet entry and report instructions.

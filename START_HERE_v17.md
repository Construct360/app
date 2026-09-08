# Simpler timesheets — v17

Prepared 8 September 2026. This is an upload-ready package, not a live deployment.

## Install: SQL first, GitHub second

1. Confirm the v16 timesheet migration has already succeeded. If timesheets are already working, do not rerun v16. If upgrading from v15, run the included `supabase/migrations/20260908200027_timesheets_v16.sql` once first. Earlier prerequisites remain in START_HERE_v16.md.
2. Confirm a current database backup is available. Open your existing Supabase project → SQL Editor → New query.
3. Paste the entire contents of **`supabase/migrations/20260908210129_timesheets_simplified_v17.sql`**, then Run as the project database owner. Wait for success before uploading. This update replaces only the timesheet save function and restates its permissions; it does not rewrite or delete existing records.
4. Extract **Construct360_GitHub_Ready_Timesheets_v17.zip**. Upload the extracted files and folders to your existing GitHub repository root, replacing matching files. Do not upload the ZIP itself or an extra containing folder. Include the dotfiles already provided.
5. Wait for Vercel's normal Git deployment to succeed. Refresh the app and check that the sidebar says **v17**.
6. No new API keys, environment variables, packages, email settings or Edge Function deployment are needed.

If SQL fails, stop and share the exact error. Do not delete tables, rerun older migrations or run a full CLI db push: some earlier migrations were installed manually. Record this SQL Editor installation for future migration-history reconciliation. Run the Supabase security/performance advisors after installation and review any new findings.

## What changed

- **Gross pay** replaces the previous pay label in the timesheet page and PDF reports. Unapproved figures remain marked provisional; approval still captures the rate and amount.
- A simple daily list has **one hours box per day**. Optional notes expand when needed.
- Use whole or half hours, such as **8** or **8.5**. At most two digits before the decimal; the existing **24-hour daily maximum** remains. Invalid values are not rounded automatically: correct them before saving.
- Job selection and extra time-entry buttons have been removed. Detailed job-cost reporting is reserved for a later update.
- **Save draft** keeps the week editable without submitting it. **Submit week** still requires confirmation and sends the week for office approval.
- Office individual and company PDFs show the **gross hourly rate and daily gross pay beneath each worked day**.
- Supervisors and Operatives still get only their own hours-only PDFs, with no rates or pay. Admin and Operations retain company-wide timesheet, pay and approval access.

## Existing records

Approved and submitted records, frozen pay and original audit history are unchanged by the migration. Historical job descriptions remain visible on existing records and reports.

When an older draft contains several entries or job links, the form explains that saving combines those entries into one unallocated daily total. Notes are joined without truncation; review them and keep each day's notes within 1,000 characters. Original entries remain in the office audit history. Existing quarter-hour draft totals must be corrected to whole/half hours before the next save; they are never silently rounded.

Gross pay is hours multiplied by the gross hourly rate. This is not a payslip: there are no overtime uplifts, tax, pension, deductions or employer-cost calculations. Approved weekly totals are still rounded once. Daily displayed amounts are rounded separately and may differ from the weekly total by a few pence when added together.

## Quick live check after upload

1. As an Operative, open a week and confirm seven hours boxes, optional notes and no Job selector.
2. Try 8, 8.5 and 23.5. Try 7.25, 24.5 and 100 and confirm saving is blocked until corrected.
3. Save Monday, close and reopen. Add Tuesday and save again. Confirm the status is still Draft.
4. Submit the week; as Operations, return with a reason. Correct and resubmit as the owner, then approve as Admin.
5. Confirm the office page says Gross pay. Download both office PDF types and check the rate beneath each worked day.
6. Download as Supervisor/Operative: no other staff, pay or rates should appear. Check a second company remains isolated.
7. Confirm an existing approved week's captured rate and gross pay have not changed. Briefly check other existing pages.

If the frontend is rolled back to v16, the new server-side half-hour restriction still applies. Keep database records and history; do not drop tables or rerun old migrations to undo this update.

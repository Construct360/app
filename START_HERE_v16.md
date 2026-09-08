# Timesheets — v16

Prepared 8 September 2026. No live upload or migration was performed during preparation.

## Install — SQL first, GitHub second

1. Confirm v15 is working, including Vehicles. If its SQL migration has not yet run, complete v15 before continuing. Check that a current database backup is available in your Supabase project.
2. Open your existing Supabase project → SQL Editor → New query. Paste the **entire contents** of `supabase/migrations/20260908200027_timesheets_v16.sql` and run it **once**, as the project database owner. Wait for success. This is the only new SQL file for v16. It adds tables and functions without replacing existing company data or account settings.
3. Extract `Construct360_GitHub_Ready_Timesheets_v16.zip`. Upload the extracted contents into your existing GitHub repository root, replacing matching files. Do not upload the ZIP or a containing folder as the website.
4. Wait for the normal Vercel Git deployment to succeed. Reload `/workspace`; the sidebar should say v16 and include Timesheets.
5. No new environment variables, API keys, SMTP edits, Edge Function deployments or runtime dependencies are needed. Keep existing configuration unchanged.
6. Run Supabase security/performance advisors after the live migration, distinguish existing findings from new ones, and complete the acceptance checks below.

If an SQL error appears, stop and provide the exact error. Do not rerun earlier migrations, delete tables or run a bootstrap script to repair it. Earlier migrations were partly installed through SQL Editor and the hosted migration history is not fully reconciled; do not blindly run a full CLI `db push`. Record this SQL Editor installation so migration history can be reconciled before a future CLI deployment.

## Staff workflow

- Open Timesheets and choose the week (Monday–Sunday).
- Choose Start my week. Enter total daily hours, e.g. `7.5` for seven and a half hours, not start/finish times. Up to two decimal places are accepted.
- Choose **Save draft** whenever needed. The dialog stays open and says **Draft saved — not submitted**. You can close it, return another day, and continue the same week. This is a manual save, not autosave.
- A job is optional. Leave Daily total / not allocated selected for a simple daily total. If splitting a day between jobs, add another entry and do not count the same hours twice. Supervisors and Operatives are offered only their assigned jobs for that week. Previously saved job links remain usable if the assignment later changes.
- When the week is complete, tick the confirmation and choose **Submit week**. This saves the current form and submits it together. You cannot edit it while it is awaiting approval.
- If returned, the office reason is shown. Choose Continue / submit, correct the hours, Save draft if needed, then submit again.
- Approved weeks remain read-only. An approved timesheet is not automatically marked as paid.

## Permissions

| Role | Own drafts/submission | Other timesheets | Rates and pay | Approval/return | Reports |
|---|---|---|---|---|---|
| Operative | Yes | No | No | No | Own hours-only PDF |
| Supervisor | Yes | No | No | No | Own hours-only PDF |
| Operations | With active linked Staff profile | All in own company | All in own company | Yes | Individual and company weekly PDFs |
| Company Admin | With active linked Staff profile | All in own company | All in own company | Yes | Individual and company weekly PDFs |

Platform Administrator status alone does not grant access to a company's timesheets. Existing permissions in unrelated modules have not been expanded.

Draft editing and submission are owner-only, including for office roles. Admin and Operations review colleagues' hours rather than silently rewriting them. Unlinked Staff records are shown as having no active linked login; this release does not submit on their behalf. Supervisor and Operative invitations already create linked Staff profiles. Admin/Operations do not need a Staff profile to review or approve colleagues' timesheets.

## Office review and reports

Select a week to see saved drafts, submitted weeks, approved weeks and staff without a saved timesheet. Drafts are visible to the office but are **not** submissions. Choose Review / approve on a submitted week. Return for correction requires a reason. Approve week requires confirmation that the hours and hourly rate were reviewed.

Set each person's Hourly rate in Staff before approval. Missing rates block approval; an explicitly entered £0.00 rate is allowed. Approval captures the rate and rounded total for that week. Later Staff rate edits do not recalculate approved weeks. A rate changed during review requires refresh before approval.

Pay estimates are total hours × base hourly rate, rounded to pence. There are no overtime uplifts, deductions, tax, pension or employer-cost calculations. Provisional and approved figures are labelled separately. They are not payslips or payroll exports.

Every download is a Construct-360-branded PDF with the app logo, navy/orange styling, week, status and page numbers. Individual reports contain daily entries and notes. Office weekly reports list the week's saved timesheets with hours, rates and pay estimates, clearly distinguishing drafts and approved totals. Field-role reports contain only their own hours and no pay. Downloads fetch fresh saved records; unsaved form edits are not included.

## Live acceptance checks

1. Operative: save Monday's hours without submitting. Close, refresh or sign out/in; reopen the correct week and verify they persist. Add Tuesday and save again. Status must remain Draft.
2. Supervisor: save a separate timesheet. Verify neither person can see the other's name, hours, records or pay on Timesheets or their PDF.
3. Operative: confirm and Submit week. Verify editing is locked. Office: verify it now appears as Awaiting approval.
4. Operations: return it with a reason. Operative: correct, save, and resubmit. Admin: approve it after checking the rate.
5. Change the Staff hourly rate after approval. Verify the approved week and PDF still show the captured rate and amount.
6. Download an individual PDF as a field user and a weekly report as office. Check branding, correct company/week and appropriate pay visibility.
7. Use a different test company and confirm none of the first company's timesheets or pay appears.
8. Check required confirmations, maximum 24 hours per day across entries, decimal hours, close-with-unsaved-change warning and phone scrolling.
9. Briefly retest login/invitations, Clients, Staff, Planner, Vehicles and weather.

## Limits and recovery

- Online only. A failed save retains the form for retry. Unchanged retries cannot create duplicate timesheets or approvals. If refresh fails after a confirmed save, the message explicitly says the draft was saved and asks you to refresh the list.
- There is one timesheet per Staff record per week. Future positive hours are rejected because these are records of work already completed. Empty drafts and explicit zero-hour entries can be saved; submission requires some worked hours.
- Up to ten entries per day, seventy per week, with notes up to 1,000 characters per entry. Daily totals cannot exceed 24 hours. Dates must fall within the selected week.
- This release has no leave/absence codes, clock-in/out, offline queue, reminder emails, overtime policy, payroll integration, or bulk approval. Historical prototype browser-only hours are not automatically imported.
- Approved timesheets cannot be reopened, overwritten or deleted through the app. If an approved record needs correction, agree an audited correction process before changing database records. Account deletion preserves historical timesheet/pay records while unlinking the deleted login identity.
- Existing Clients & Jobs import/export does not include timesheets. Use database backups for recovery. If rolling back the frontend, retain the additive v16 tables and history; do not drop them or rerun old migrations.

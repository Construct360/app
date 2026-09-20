# Construct360 v19 — profiles, planner and Handover

Complete frontend package plus one incremental SQL update. Tested locally; NOT uploaded to GitHub, applied to live Supabase or deployed to Vercel.

## Installation

1. Your database must already have the v18 job-files/scaffold-inspections migration and its earlier prerequisites. See START_HERE_v18.md if unsure. Do not create a fresh database or delete existing data. Take your normal backup and keep the current GitHub release.
2. In Supabase → your Construct360 project → SQL Editor → New query, paste the ENTIRE contents of `supabase/migrations/20260919183227_profiles_planner_handover_v19.sql`. Run it once as `postgres`. Wait for success. The transaction rolls back on error; if it fails, stop and share the error text, not secrets.
3. Do not rerun all SQL files. Older scripts can overwrite new functions. Do not use a blanket database push unless previous SQL Editor installations have been reconciled with the CLI migration history.
4. Extract the v19 ZIP. Upload the files/folders INSIDE it to the root of the existing `Construct360/app` GitHub repository on `main`, replacing matching files. Do not upload the ZIP or create a second enclosing folder. Include `record-details.js` and `record-details.css` beside `workspace.html`.
5. Wait for the existing Vercel Git integration to show a Ready deployment, then refresh the app and check the footer says v19. Preserve your current Vercel settings and environment variables. No new keys, dependencies, workflow or Edge Function deployment is required.

The SQL creates a PRIVATE `staff-profiles` Storage bucket and its policies. Keep it private. Never upload live secrets, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

## Jobs and inspections

- “Handover & Initial Inspection” becomes “Handover”. “Completed” is removed; existing Completed jobs become “Completion/Closed”, which remains available. No jobs/reports are deleted.
- Team label disappears from the job form/card. Historical text remains in the database/export; it is not converted into actual crew assignments.
- Creating a job in Handover, or changing from another status to Handover, flags EVERY non-dismantled scaffold on that job for inspection. The database enforces this and records an event in scaffold history. Old reports remain unchanged; a report dated before the handover event cannot clear the new requirement.
- Without an active registered scaffold, the job still appears on Inspections with a Register scaffold button. Register every scaffold separately. Registering one clears the empty-register placeholder; each scaffold still requires its own inspection.
- Saving an already-Handover job does not repeatedly reset inspections. Leaving and re-entering Handover creates a fresh requirement.
- Installation only renames EXISTING Handover records: it does not invent historical handover events or invalidate existing inspections. Review those jobs manually, register missing scaffolds and use Require inspection where needed.
- Existing role permissions and unverified-qualification warnings are unchanged. The app does not establish competence or authorise scaffold use.

## Record pages and staff profiles

Click client, job, team, staff, planner-task and vehicle cards to open information in the normal workspace. Scaffold history, saved timesheet viewing and job files also use full pages. Edit opens a dialog. New records, inspection submissions, approvals, leave and confirmations still use dialogs; image enlargement remains a lightbox. Account/user-invitation tools are unchanged.

Client/job/team/staff/task pages support browser Back and reloadable record addresses. File/history panels return to their list on Refresh. Viewing a page never expands permissions.

Staff pages show a branded cover, photo or initials, name, position, contact details, address, qualifications/certificate previews, teams, availability, private notes, hourly rate and annual leave. Edit profile → Personal profile adds the address/photo. JPG, PNG or WebP up to 5 MB; the app privately stores an optimised JPEG. Replacing/removing a photo removes its association but does not purge old Storage objects.

Admin and Operations alone retain access to staff profiles, addresses, photos, private notes and pay. Field roles do not gain access to colleagues’ profiles. Add staff member remains available; a profile alone does not create a login. Qualification preview/download and the existing branded staff PDF remain available. That PDF still contains name, position and qualifications, not the new address/photo or pay information.

## Planner and annual leave

- New booking becomes New task. Job name is the bold card heading; task description remains beneath it.
- Days show all visible tasks in time order with a count. Saving a task opens its date and clears job/staff filters. Show all tasks also clears filters, preventing a newly created task being hidden by a previous job selection.
- One person can work on several jobs in a day: use separate times, such as 08:00–12:00 and 12:00–16:00. Actual overlapping assignments for that person remain blocked; simultaneous tasks with different people are allowed.
- Admin/Operations can add full-day leave from a staff profile or Planner. Both endpoint dates are included; select the same date for one day. Overlapping leave ranges are rejected.
- Leave names appear beneath every corresponding day. Office users see company leave; Supervisors/Operatives see only their own leave beside their own tasks.
- Adding leave retains existing tasks and flags conflicts for rescheduling. New/edited tasks cannot assign someone during recorded leave. Cancelling leave preserves the original audit record.
- This is a planning calendar, not leave-request approval, holiday entitlement or holiday-pay calculation. Leave adds no automatic timesheet hours. Half-day leave is not included.

## Live acceptance checks

Use test-company accounts before operational use:

1. Open client/job/team cards: normal page view; Edit opens a dialog.
2. Save a staff photo/address; refresh. Test qualification preview/download and staff PDF. Other companies and field roles must not gain private profile/pay access.
3. Create two tasks for one person on different jobs in one day using separate times. Verify both are visible to office and that person, including when a job filter was selected before creating the second.
4. Add leave across several days/week boundaries. Names must appear only on the appropriate days. Existing conflicts must be flagged and new assignments during leave rejected. Cancel leave and refresh.
5. Move a job with two active scaffolds to Handover: both require inspections; dismantled scaffolds stay dismantled. Repeat with no registered scaffold and verify the job placeholder, registration and actual inspection flow. Old reports must remain available.
6. Test vehicle history/edit and timesheet view/edit/submit/approve after the navigation changes.

Local tests use isolated PostgreSQL and emulated Auth/Storage transport. Hosted Storage, Supabase security advisors and Vercel still need live acceptance checks after installation. Never share secret keys or invitation tokens.

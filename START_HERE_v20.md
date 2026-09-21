# Construct360 v20 — Dashboard, notifications and assignments

## Install in this order

1. Confirm your database has v19 installed (`20260919183227_profiles_planner_handover_v19.sql`). If not, follow the missing release guides in order first. Do not rerun migrations already installed. Keep a current database backup and your last working GitHub revision before a production migration.
2. Open Supabase → your Construct360 project → SQL Editor → New query. Open `supabase/migrations/20260921181503_dashboard_assignments_notifications_v20.sql` from this package, copy **all** its contents into the query and run once using the database-owner/postgres role. Wait for success. The migration is one transaction. If there is an error, stop and share the error text, not secrets.
3. Extract `Construct360_GitHub_Ready_Dashboard_Assignments_v20.zip`. Upload **the extracted contents**, including folders and dotfiles, to the root of your existing GitHub repository on `main`. Do not upload the ZIP itself or add another enclosing folder. Preserve the existing project connection and Vercel settings.
4. Wait for the existing Vercel Git integration to produce a Ready deployment. Refresh the app; the menu should say **Dashboard** and the footer **v20**.
5. Complete the test-company checks below before operational use. Hosted Supabase security advisors and production access/storage checks remain necessary; local tests do not replace them.

No new API key, environment variable, bucket or Edge Function deployment is needed. Existing weather configuration is unchanged. Keep all current Storage buckets private. Never upload `.env`, secrets, `.vercel`, `node_modules`, local validation folders or `supabase/.temp`.

## Dashboard and notifications

- Admin and Operations see every notification generated for their company—not other companies. Operatives and Supervisors receive events relevant to their own records and assignments.
- Read/unread status is personal. Marking an item read does not affect colleagues. “Mark all as read” only affects the viewer’s accessible events up to the latest loaded notification.
- The newest 25 events appear first; Load older notifications adds another page. The newest page refreshes every minute while visible. While reading older pages, automatic refresh pauses; Refresh feed returns to the newest page. The main Refresh button also reloads jobs and vehicle assignments.
- Notifications begin when v20 is installed. Existing history is not backfilled. Existing vehicle assignments and current jobs still appear on the Dashboard immediately.
- These are **in-app notifications only**, not email, push alerts or a scheduled reminder service. No automatic deadline/qualification-expiry notification engine is added.

| Activity | Admin / Operations | Field users |
| --- | --- | --- |
| Shared job details, address, status or assignments changed | Company-wide | Job supervisor and assigned individuals; relevant active/future Planner crew. Removed job assignees receive the removal update, not later updates. |
| RAMS, shared documents or progress photos added/removed | Company-wide | Relevant job recipients |
| Private notes / office-only documents changed | Company-wide, labelled Office only | No notification, including for the job supervisor |
| Scaffold registration, inspection or requirement update | Company-wide | Relevant job recipients |
| Planner task saved or cancelled | Company-wide | Its crew and relevant job recipients |
| Vehicle record/assignment changes | Company-wide | Assigned person; former assignee receives reassignment/removal update |
| Vehicle inspection or defect resolution | Company-wide | Assigned person and inspector/reporting user |
| Timesheet submitted, returned or approved | Company-wide | Owner only; no pay or private notes in notification text |
| Annual leave added/cancelled | Company-wide | That staff member only |

Daily timesheet drafts and incomplete file uploads do not produce notifications. This is a focused activity feed, not a copy of every audit-log entry. Existing inspection-review alerts and vehicle status warnings remain separate.

## Assign a job supervisor and individuals

Admin or Operations → Jobs → open a job → Edit job:

1. Fill in **Site address**. Existing addresses start blank; enter the actual site address, not automatically the client’s billing address.
2. Choose an optional **Job supervisor**.
3. Tick the **Assigned individuals** who work on that job.
4. Save.

The supervisor is a job responsibility, not an account-role change. You can nominate an active staff member without granting office access. A staff record must be linked to an active login to receive in-app notifications; the form flags profiles without a login. These assignments do not create dated Planner tasks. Keep using Planner to book times and check availability.

Assignments and site addresses survive saves from an older v19 browser tab. Supervisor selection does not grant access to private notes, private documents, personal staff profiles or pay. New selections must belong to the same company.

## Assigned vehicles

Admin or Operations → Vehicles → open vehicle → Edit → Assigned staff member. Choose someone, or leave **Unassigned**.

This existing optional assignment is now prominent on that person’s Dashboard, with a **Start inspection** button. Their vehicles appear first in the fleet with an “Assigned to you” badge. A person may have multiple assigned vehicles; each vehicle has at most one assigned staff member.

All active company users can still inspect other current company vehicles. Assignment does not prove someone is qualified/authorised to drive, and inspection submission does not clear an existing defect. Company safety procedures remain necessary.

## Live-job access

A live job is not archived and has one of these statuses:

- Delivery & Erection
- Handover
- Dismantling & Removal

All active company staff can view the site name, site address, status and RAMS regardless of job or Planner assignment. Field-user lists put live jobs first. Existing wider access to shared company job files is retained, including non-live jobs; office-only files and notes remain excluded. Shared RAMS use authenticated downloads, not public links.

The Clients & Jobs transfer export includes the new site address. It is still not a full workspace backup: job-staff assignments, staff profiles, notifications, Planner, Storage files and other modules are not transferred by that tool.

## Test-company acceptance checklist

1. As Admin, set a site address, supervisor and individual on a test live job. Refresh and check they remain saved. Repeat as Operations.
2. As that Supervisor, confirm a notification arrives after an office user changes the address/status or adds RAMS. Open it: the job should use a full page, not a viewing popup.
3. Change only office notes and upload an office-only document. Admin/Operations should see an office-only event; neither Supervisor nor Operative should see it or private content.
4. As an unassigned Operative, verify the live job’s name, address and RAMS remain accessible, without staff profiles, pay or private files.
5. Assign a vehicle to that Operative. Refresh their Dashboard, start its inspection, then try a different vehicle through All vehicles. Both must remain possible. Leave another vehicle unassigned.
6. Mark a notification read and sign in as a colleague: their unread state must be unchanged. Reload your own page: your read state must persist.
7. Confirm another company cannot see these jobs, vehicles or notifications. Verify disabled users and suspended companies lose access.
8. Check the Dashboard and job editor on a phone. Verify Planner, timesheets, inspections, invitations and file downloads still work in the hosted environment.

If the app was uploaded before running the SQL, run the required v20 migration after confirming v19, then refresh. Do not reset your database or replay all old migrations. Nothing has been deployed live as part of preparing this package.

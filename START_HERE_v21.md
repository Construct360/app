# Construct360 v21 — compact workspace and staff Planner

## Install in this order

1. Confirm v20 is installed: `20260921181503_dashboard_assignments_notifications_v20.sql`. If releases are missing, follow their guides in order; do not rerun already-installed migrations. Keep a current database backup and the previous working GitHub revision. The Clients & Jobs export is not a full backup and does not include Storage files.
2. Supabase → your Construct360 project → SQL Editor → New query. Copy the **entire contents** of `supabase/migrations/20260922033518_job_media_staff_planner_v21.sql` into the editor. Run **once**, using the database-owner/postgres role. Wait for success before uploading the app. This migration is one transaction and does not delete existing tasks or files. If it fails, stop and share the error text, not credentials.
3. Extract `Construct360_GitHub_Ready_Compact_Workspace_Planner_v21.zip`. Upload **the extracted files and folders** to your existing GitHub repository's root on `main`. Include `.gitignore` and `.env.example`. Do not upload the ZIP or create an extra enclosing folder.
4. Wait for the existing Vercel Git deployment to become Ready. Refresh any old app tabs (Ctrl+F5); the footer should show **v21**.
5. Complete the test-company checks below before operational use. Review Supabase security/performance advisors after migration, especially any existing broad Storage policies. Keep all existing buckets private.

No new environment variables, API keys, buckets or Edge Function deployments are needed. Do not reset Supabase. No GitHub upload or hosted migration/deployment was performed while preparing this package.

## What changed

- Staff qualifications: 31 choices in the prototype's five groups, plus Other / custom qualification. Existing entries, references, expiry dates and images are retained. No demonstration people or qualifications are assigned to real staff automatically. The existing limit remains 30 qualifications per person.
- Job pages show authenticated photo thumbnails, RAMS and important documents directly. Click a photo to enlarge it; use Download to save a copy. Compact cards keep photos visible while reducing padding. Admin/Operations also see a clearly labelled office-only documents section. Workers never receive those private files or office notes.
- Files & photos remains available for uploading/managing files; it is no longer necessary simply to see them. Existing shared-file access remains company-wide.
- Dashboard notifications show up to three items in the panel, then scroll. Read/unread state, access filtering, older-page loading and refresh behaviour are unchanged.
- Teams and Access Guide navigation/deep links are hidden. Existing teams and saved crew assignments are retained; existing team templates can still be used when scheduling. This is not a data deletion or a role-permission change.
- Sidebar: Dashboard; divider; Planner, Jobs, Staff, Timesheets; divider; Clients; divider; Inspections, Vehicles. Each has a consistent, relevant icon. Staff/Clients remain office-only.

## Staff-row Planner

Each visible staff member has a row with a fixed left-hand name column. The calendar itself scrolls horizontally on smaller screens; its day headings also stay fixed when scrolling vertically.

Admin and Operations see current staff, including those without tasks. People sharing tasks in the displayed period are placed together; connected crews are grouped rather than creating duplicate staff rows. Names are alphabetical within groups. A weekday indicator shows days without a task, excluding annual leave. It does **not** guarantee a full day's hours are covered: any task that day counts. Job filters can hide tasks, so a blank filtered cell does not necessarily mean free.

Multiple tasks appear in time order within each day/person cell. A shared task appears on each assigned person's row. Use the row's **+ Task** to preselect that person and date, or the main New task button. Existing overlap and annual-leave checks remain enforced. Annual leave stays visible in the day headings and affected staff cells.

Operatives and Supervisors keep their existing restricted Planner access. The new layout does not reveal everybody else's availability or personal information.

## Permanent deletion

**Admin and Operations only. Test with disposable records first.**

- Job files: Delete replaces Remove from view. After the warning is accepted, the exact file is marked for deletion, removed through Supabase Storage, and its job-file record is deleted. If Storage or the connection fails, office users see **Retry delete**. Retry until confirmed; do not assume a failed attempt completed. Pending files are hidden from field users. Incomplete uploads cannot be deleted through this control.
- Planner: the small **×** removes the whole selected task and all its crew assignments after an explicit cannot-be-undone warning. Other tasks, job records, annual leave and recorded timesheets are not deleted. A stale browser draft cannot recreate the deleted task ID.
- Minimal audit/notification records and retry/deletion markers remain for accountability and safe retries. Copies already downloaded or retained in external backups are not recalled. There is no app undo or recycle bin for these deletions.
- Files hidden with the old Remove from view feature are not automatically purged. This release does not bulk-delete historical content. Existing qualification-image removal behaviour is unchanged.

## Test-company acceptance checklist

1. Add a listed qualification and a custom one to a test staff profile; save, reopen and verify names, dates and existing images remain.
2. Upload a disposable photo, RAMS file, important document and private document to a test job. Reopen the job: see the thumbnail/documents directly, enlarge the image and download a file.
3. As an unassigned Operative/Supervisor in that company, check shared live-job content remains available. Confirm private files/notes and delete buttons are absent. Check another company sees none of these records.
4. Cancel a Delete confirmation and verify the file remains. Confirm deletion on a disposable file, refresh and verify removal in both the app and Supabase Storage. If Retry delete appears, finish it and check again.
5. Give one person two non-overlapping tasks on the same day, with a second person on one task. Confirm both tasks, adjacent shared crew, unassigned staff and annual leave are visible. Scroll horizontally and check names remain fixed.
6. Cancel a task's × warning, then confirm it on disposable data. Confirm it disappears from every crew row while other tasks, timesheets and leave remain.
7. Generate more than three notifications. Check only three fit in the panel, scrolling reveals the rest and read marking still works. Test on a phone as well as desktop.
8. Check the navigation order and hidden pages. Smoke-test invitations, timesheets, inspections, weather and staff reports on the hosted deployment.

If you uploaded the app first, install this migration after confirming v20 and refresh. Do not replay old migrations or rebuild the database. If rollback is needed, preserve data and investigate first: restoring an old app build cannot restore permanently deleted files/tasks.

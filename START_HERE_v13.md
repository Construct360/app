# Construct360 v13 — one combined operations release

This package connects **Staff, Teams, Permissions and Planner** with saved Clients and Jobs. Use this guide for the whole update; do not repeat the old v11/v12 installation guides.

## Included

- Company-specific Staff with manual/non-login profiles and automatically linked invited Supervisors/Operatives.
- Phone, private office notes, availability, archive status, qualifications, certificate references and expiry dates.
- Teams with supervisors and crew, plus archive/restore.
- Week/day Planner with job/staff filters, team or individual assignments, times, tasks and instructions.
- Booking editing, cancellation, restoration, overlap rejection, stale-edit protection and safe retries.
- Restricted assignment views for Supervisors and Operatives, and responsive forms including Users.

## One deployment session

### 1. Prepare

Keep the previous v12 ZIP and take a Supabase database backup using your existing backup method. Extract `Construct360_GitHub_Ready_Operations_v13.zip` to a new folder. Avoid invitations, role changes and staff/booking edits until the database, function and frontend updates below are all complete.

### 2. Update Supabase

Open your existing project → **SQL Editor → New query** as the project owner/postgres role.

- If **005_clients_jobs.sql** is already installed, run only **006_staff_teams_planner.sql** from this package.
- If you only installed the v11 company/user foundation, run the entire **005_clients_jobs.sql** file first, wait for success, then run the entire **006_staff_teams_planner.sql** file in a separate query.
- To check prerequisite presence, run `select to_regprocedure('public.workspace_save(text,jsonb,uuid)');`. A function signature means 005 is present; `NULL` means it is missing. This is a presence check, not a full schema audit.

Copy each whole file, including `begin;` and its final `commit;`, and run it. Saving the query is optional. Wait for success before continuing.

**Do not rerun 001, 002, 003 or bootstrap step 004.** Older files can restore older permissions or invitation behaviour. Migration 006 is rerunnable and retains existing staff details and bookings.

If a migration fails, stop and keep the exact error. Do not delete tables or disable permissions. A failed complete transaction does not leave a partial migration. If the editor reports an aborted transaction, run `rollback;` before retrying the corrected whole file.

### 3. Deploy the updated admin-users function

Open the extracted v13 folder in File Explorer (the folder containing `supabase` and `workspace.html`). Click the address bar, type `powershell`, and press Enter.

Run:

```powershell
npx.cmd supabase@latest functions deploy admin-users --project-ref mvfadkpisvxnszryrcgy
```

If login is requested, first run:

```powershell
npx.cmd supabase@latest login
```

Then repeat the deployment command. Wait for `Deployed Functions ... admin-users`. Keep the existing gateway/JWT settings; do not add `--no-verify-jwt` for this update.

This update is required: linked staff now synchronize within the database membership transaction, and user-role changes must preserve staffing history. `platform-companies` and shared configuration are unchanged and need no redeployment.

### 4. Upload to GitHub

Upload the **contents of the extracted folder** to your existing repository root on `main`, replacing matching files. Do not upload the ZIP or put the app inside a new v13 subfolder.

The root now includes `operations.js` alongside `workspace.html`, `workspace.js`, `workspace.css`, `auth.js`, `index.html`, `platform.*`, `legacy-transfer.js`, `package.json`, `vercel.json`, the guides, `.env.example`, `.gitignore`, and the `api`, `assets`, `supabase`, `tests` folders.

Wait for Vercel's successful production deployment. No framework, root-directory, environment-variable or domain changes are needed. Keep the working `APP_URL`, public Supabase configuration, SMTP, redirect URLs and invitation template.

Sign out and back in. Hard-refresh if the old menu remains. All four company roles now enter `/workspace`; field users no longer enter the legacy prototype.

## Use the joined-up workflow

1. Create a **Client** and **Job**, or use existing saved records.
2. Open **Staff**. Existing invited Supervisors and Operatives should appear. Add manual staff only for people without a login.
3. Record qualifications and expiry dates. Warnings help planning but do not certify competence or enforce site-specific qualification requirements.
4. Open **Teams → New team**, choose an active Scaffold Supervisor and crew. The supervisor is included automatically.
5. Open **Planner → New booking**, or **Schedule crew** on a job card. Choose the job, times, task and team, with optional extra staff.
6. Review the crew preview, add instructions for assigned users and save.
7. Sign in as the assigned Supervisor and Operative to see their work. Supervisors also see crew names and working roles on their own assignments.

Times are **UK site-local wall-clock times**, without conversion to the viewer's device timezone. Each booking is a continuous interval of up to seven days and reserves staff overnight too. For daytime work across several days, create one booking per day. Recurrence, shift templates and dated leave calendars are not included.

Bookings must fit within any dates set on the Job. Jobs without dates can be scheduled. Cancel/move future bookings before closing or archiving their job. Historical bookings can remain when a finished job is closed. Narrowing job dates must preserve all scheduled bookings.

The old Job **team label** remains a note for compatibility; actual staff assignments are created through the Planner.

## Staff, teams and accounts

| Action | Behaviour |
|---|---|
| Invite a Supervisor/Operative | Creates one linked Staff profile through the existing invitation flow. |
| Add manual staff | Staff profile only; no login or email. |
| Edit linked staff | Admin/Operations manage phone, notes, qualifications, availability and archives. Identity, login role/status are controlled by the account/membership. |
| Disable a login in Users | Blocks new workspace requests and marks linked staff inactive. Existing bookings remain and display an office warning. |
| Re-enable a login | Restores account activity without overriding a staff archive or manually chosen unavailability. |
| Archive staff | Retains history and removes assignment access without deleting the login. Restore through Staff → Archived records → View / edit → untick Archive. |
| Move a field user to Admin/Operations | Archives the old Staff profile, retains bookings and opens the management workspace. |
| Move an office user to Supervisor/Operative | Creates/updates linked staff. Restore an already archived profile explicitly before scheduling. |
| Permanently remove a user | Deletes Auth login and company access. Staff becomes archived and unlinked; email/phone are cleared. Name, qualifications, private notes and booking history remain as business records. |
| Change a team roster | Existing bookings keep their saved crew. New bookings use the new roster. |
| Edit a team booking | Saving uses the team's current roster plus selected extras. Review the preview. Select Individual staff only for a custom crew. |

People may belong to several teams; booking checks prevent double-booking. Cancelled bookings release their staff, and restoring a booking checks conflicts again.

Manual and invited profiles are not automatically merged by email. If someone needs a login, invite them first and use that profile. If a manual profile already exists, archive the duplicate and review/move its bookings to the linked profile. Do not delete database rows manually.

## Permissions

| Area | Company Admin | Operations | Supervisor | Operative |
|---|---|---|---|---|
| Clients/contact directory | Manage | Manage | No | No |
| Jobs/private job notes | Manage | Manage | Assigned job summary only | Assigned job summary only |
| Staff/qualifications | Manage | Manage | Crew names/roles on own assignments | Own name/role only |
| Teams/Planner | Manage | Manage | View own assignments and crew | View own assignments |
| Site instructions | Manage | Manage | Read on own assignments | Read on own assignments |
| Login accounts/Users | Manage | No | No | No |
| Clients & Jobs import/export | Manage | No | No | No |

Platform Administration requires its separate platform role. Platform status alone does not reveal company operational records. The in-app Access guide is informational, not a permission editor. Field-user inspections, timesheets, photos and job updates will arrive with those later modules.

## One acceptance checklist

Use independent sessions for the two companies: Chrome normal + Incognito, separate Chrome profiles, or Edge InPrivate. Two Chrome Incognito windows share a session.

1. **Clients/Jobs:** create a client and dated job in A, refresh and reopen. Neither should appear in B. Create B's own records too.
2. **Invitations:** invite an A Supervisor and Operative, accept and set passwords. Confirm one correctly named Staff profile per user. Check email delivery separately if the mailbox still filters invitations.
3. **Staff:** add manual staff with a qualification and expiry date. Refresh and check persistence, including an expired-qualification warning.
4. **Teams:** create a team with the Supervisor and Operative. Check persistence and company separation. Disabled/archived people cannot be saved in an active team.
5. **Planner:** book the team on A's job within its dates. Confirm both people in the preview and saved booking. Also schedule a manual staff member individually.
6. **Conflicts:** try overlapping bookings for the same person, including through another team. Save must be rejected and the draft retained. Back-to-back bookings should work. Invalid date order must fail.
7. **Operations:** create/edit Staff, Teams, bookings, Clients and Jobs. No Users, import/export or Platform controls should appear unless separately appointed as a platform administrator.
8. **Field users:** open the booking week as Supervisor and Operative. See assigned jobs/instructions, without edits or private office notes. Only the Supervisor sees the other crew names. Unassigned jobs must not appear.
9. **History/stale edits:** change a team roster; confirm an earlier booking keeps its crew. Edit that booking and review the roster preview. Open the same record in two office sessions: save one, then verify the older form rejects a stale save.
10. **Cancellation:** cancel with its confirmation checkbox. Check it disappears and staff are freed. Include cancelled, reopen and restore; conflicts must be checked again.
11. **Lifecycle:** archive or mark staff unavailable and check Planner warnings. Disable a login and refresh its session: access must fail. Re-enable it. Use a disposable account for deletion testing: login disappears, archived staffing history remains. Suspend B and verify new data requests fail, then reactivate it.
12. **Phone/regression:** check Staff, Teams, bookings and Users without horizontal form scrolling. Confirm login, invitation password setup, password recovery, user management and Platform Administration still work.

## Verification, recovery and limits

Read [VERIFICATION_v13.md](VERIFICATION_v13.md) for checks completed locally. No live database or email changes were made while preparing this package. Complete the checklist above after installation.

- Data refreshes on demand; updates do not stream live. Refresh before planning. Disabling access cannot recall information already displayed or downloaded.
- Failed saves retain drafts. For a stale-record error, copy unsaved text, close, refresh and reopen.
- Clients & Jobs export is still limited to those modules. It is not a backup of Staff, Teams or Planner. Use a database backup for the combined workspace.
- If the frontend fails after SQL/function updates, keep the new database/function and investigate. A temporary v12 frontend can restore the office Clients/Jobs view but cannot show the new modules. Do not restore the older `admin-users` function or rerun older migrations while staffing history depends on v13.
- Existing Supabase-linked staff are reused. Browser-local prototype Staff, teams and Planner data are not imported or synchronized automatically.
- Timesheets, inspections, RAMS, documents, photos, vehicles and equipment remain outside this release. Continue using test companies until release acceptance and the remaining workflows are complete.

Implementation references: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [PostgreSQL transaction/advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html). Full records are company/role restricted; limited field-user projections and checked save functions enforce assignment access.

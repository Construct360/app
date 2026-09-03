# Construct360 v12 — company-specific Clients & Jobs

This is the next development/testing stage after v11. It is **not the complete production release** of all Construct360 modules.

## What changes

- Company Admins and Operations users can create, view, edit, archive and restore their own Clients and Jobs.
- Client records include primary contact details, address, notes and multiple site contacts.
- Jobs include the client, site, scaffold type, real start/end dates, status, notes, a team label and assigned site contacts.
- Records persist in Supabase and can be opened from another signed-in device. Refresh to fetch other users' latest changes; this release does not stream updates automatically.
- Client codes start at 123 within each company. Job codes combine the client code with a sequence starting at 001 for that client, preserving the existing 123001 / 124001 convention. Codes cannot be changed after creation.
- Company ownership is checked in the database, including the relationships between clients, jobs and contacts. Platform Administrator status alone does not expose another company's operational records.
- Duplicate save retries do not create extra records. An outdated edit is rejected instead of silently overwriting someone else's changes.
- Admins have an explicit, reviewed Clients & Jobs import/export tool. An invalid import rolls back in full and never overwrites an existing code.
- The new forms and Users pop-up fit narrow screens without a horizontal scrollbar.

Supervisor and Operative access remains unchanged. Their access to the new Clients & Jobs tables is not enabled. Operations cannot manage users, use Platform Administration, or import data through the Admin-only import tool.

## Install in this order

### 1. Keep a recovery copy

Keep the v11 ZIP and take a Supabase database backup using your existing backup method. Export any important browser-local prototype data using its existing **Data & Audit → Export backup** before changing the frontend.

This update does not delete or import data automatically. The old prototype remains separately available to the company already enabled for it. Other companies are not given access to that prototype.

### 2. Run only the new database migration

Your tested v11 setup already includes migrations 001, 002 and 003 and the separate Platform Admin bootstrap step 004. Do **not** rerun these as part of this update, particularly 001, which would restore older grants.

1. Open your existing Supabase project, then **SQL Editor → New query**.
2. Open `supabase/migrations/005_clients_jobs.sql` from this package in a text editor.
3. Copy the **whole file**, including `begin;` and the final `commit;`.
4. Paste into the SQL Editor and run as the project owner / postgres role.
5. Wait for success. Saving the query is optional; running it is what applies the change.

This migration is additive and can be rerun. It adds Clients, contacts, Jobs, their relationships, private retry receipts, access policies and checked save/import functions. It does not change company memberships, platform roles, invitations or existing prototype data.

If it fails, stop and share the exact error. Do not delete tables or change permissions to work around it. A failed complete migration transaction does not leave a partially installed v12 schema.

### 3. Upload the frontend files to your existing GitHub repository

Extract `Construct360_GitHub_Ready_Clients_Jobs_v12.zip`.

Upload the **contents of the extracted folder to the repository root**, replacing files with the same names. Do not upload the ZIP itself or put the application inside a new `v12` folder.

The root should contain `index.html`, `auth.js`, `workspace.html`, `workspace.js`, `workspace.css`, `legacy-transfer.js`, `platform.html`, `platform.js`, `platform.css`, `package.json`, `vercel.json`, the `api`, `assets`, `supabase` folders and the two dotfiles.

The included `.env.example` contains placeholders. Do not upload a real `.env`, a private key, `config.js`, `node_modules`, `.vercel` or `supabase/.temp`. The supplied ZIP excludes those.

Wait for Vercel to show a successful production deployment from your existing `main` branch. No framework, root-directory, environment-variable or domain changes are needed. No GitHub Actions workflow is needed.

### 4. Keep your working authentication configuration

When updating from the tested v11 package:

- No Edge Function redeployment is required: `admin-users`, `platform-companies` and their shared code are unchanged.
- Keep the existing `APP_URL`, Vercel Supabase variables, redirect URLs, SMTP settings and invitation template.
- Sign out and back in, or hard-refresh after Vercel finishes deploying.

### 5. Open the new workspace

An active company Admin or Operations user now lands at `/workspace` after signing in. It shows that company’s name and only its saved Clients & Jobs.

**An empty client/job list is expected initially.** Browser-local demonstration records are not uploaded automatically. Add fresh test data or use the optional import below.

Sam's Platform button still opens `/platform`. The legacy prototype link is shown only for the company that was already enabled for the prototype. You can also open `/?legacy=1` on your app domain while signed into that company.

## Test before moving to the next stage

Use separate browser sessions for Test Company A and Test Company B (for example, Chrome normal + Incognito, or Chrome Incognito + Edge InPrivate). Two Chrome Incognito windows share their session.

1. **Client and contacts:** in A, add a client, its primary contact and a site contact. Refresh and reopen it; every detail should remain.
2. **Job:** add a job for that client, set dates/status and select the site contact. Refresh and reopen it; dates and contact selections should remain.
3. **Company separation:** in B, neither A's client nor its job should appear. Add B's own records; A should not see them.
4. **Operations:** invite an Operations user to A using the working Users pop-up. After accepting, that user should see A's saved data and be able to add/edit Clients and Jobs. They should not have Users or Platform controls.
5. **Conflicting edits:** open the same job in an Admin session and an Operations session. Save one change, then try saving the older form in the other session. It should tell you to close, refresh and try again. Copy any draft notes you want to keep before closing.
6. **Archive/restore:** archive a job, select Archived records, and restore it. Archiving is reversible, not permanent deletion. A client with unarchived jobs cannot be archived. Restore an archived client before restoring its jobs.
7. **Contact protection:** try removing a site contact still assigned to a job. The save should be rejected without changing the client. Unassign it from every job, including archived jobs, before removing it.
8. **Disabled/suspended access:** disable the Operations test user or suspend B from Platform Administration. New data requests must be rejected. On refresh the user should lose workspace access. Re-enable/reactivate after the check.
9. **Small screen:** test the Client/Job and Users pop-ups on a phone or narrow window. Vertical scrolling is expected for long forms; horizontal scrolling is not.
10. **Regression:** confirm existing sign-in, invitation password setup, user management and the Platform company list still work.

Already displayed or downloaded information cannot be recalled when an account is disabled. Database requests recheck company status and role; refreshing or signing out clears the workspace screen. Do not share browser profiles containing sensitive legacy prototype data.

## Optional: bring reviewed prototype Clients & Jobs across

Use fresh test records if you do not need the old demonstration data. There is no need to import it to test this release.

1. Sign in as the Admin of your existing prototype company, then open `/?legacy=1` on the same app domain and in the same browser profile where the old data is stored.
2. Open **Data & Audit → Export Clients & Jobs for v12**. This downloads a transfer JSON file for that company. It does not modify the prototype.
3. Review the file before importing. It may contain demonstration clients/jobs. Keep only the records you actually want, preserving each job's client and site-contact references. If unsure, leave the file untouched and ask for help reviewing it.
4. Open **saved company workspace → Import / export → Choose file** and choose that transfer file.
5. Check the company name, counts and record list, tick the review confirmation, then choose **Import reviewed records**.
6. Reopen the imported records and verify dates, contacts and details.

Important limits:

- Old prototype job edits were held in page memory, not persistently stored. This package cannot recover edits lost from a closed or refreshed older page session. The export captures only jobs present in the current prototype page.
- Old labels such as “17–20 Aug” lack a year. They are preserved in notes, not converted into guessed dates. Fill in the real dates after import.
- Files, photos, RAMS, drawings, staff, teams, timesheets and other modules are **not** included. Keep your full prototype backup for those.
- The import requires the same company ID as the export. It does not move records between companies or transfer users.
- Existing client/job codes cause the whole import to stop. There is no merge or overwrite option. If you have already added test records using the same codes, ask for help reconciling them; do not delete database records manually.
- Maximum per import: 500 clients, 500 jobs, 100 site contacts per client and 5 MB. Split larger sets only with their client/job/contact relationships intact.
- Downloaded JSON contains business/contact data. Keep it private. Do not upload it to GitHub or place it in the public app folder.

**Download Clients & Jobs** exports the current saved records, including archives. It is not a full Supabase backup and is not an overwrite/restore mechanism. Reimporting it into a workspace already containing those codes is intentionally blocked.

## What is still unfinished

The new workspace does not yet connect Staff/teams, Planner, timesheets, inspections, RAMS, files/photos, vehicles, equipment or other prototype modules. A job's team label is free text, not a staff assignment or booking. Invitations still create linked staff rows, but the company-specific Staff screen comes in a later release.

Keep using test company data until the remaining workflows, role permissions and production checks are complete. The next planned stage is Staff/teams and the agreed role-access matrix, followed by dependent scheduling and document workflows.

## Local verification and its limits

The included automated tests execute the SQL in an isolated PostgreSQL-compatible PGlite engine. They cover migration/rerun, company ownership, Admin/Operations access, contact relationships, archive rules, conflicting edits, safe retries, import rollback and export/import round trips. The earlier platform/invitation regression tests also pass.

Browser checks exercise the actual workspace forms through a local transport adapter into that database. They verify saved client/job persistence after reload, assigned contacts, Operations editing, another company's empty view, conflict warnings and narrow-screen dialogs.

The local adapter replaces the hosted Supabase Auth/PostgREST transport. These checks do not verify your live deployment, actual email delivery, hosted gateway settings or production-scale performance. Complete the acceptance tests above in your test companies after installing.

Developers can run the included tests from `tests` with `npm.cmd install --ignore-scripts` then `npm.cmd test`. No live credentials are required. The local browser fixture server is not included in the ZIP.

## If an update fails

If a save fails, the form stays open. Read the error, correct the issue or retry after the connection returns. If it says someone changed the record, copy any draft text you need, close the form, refresh and reopen it. A save is atomic: a rejected contact/job validation does not partially alter the record.

If the frontend fails after migration 005 succeeds, restoring the v11 frontend does not require deleting the new tables. Keep the saved data and investigate the deployment error. Do not rerun old migrations to undo this release.

Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database functions](https://supabase.com/docs/guides/database/functions).

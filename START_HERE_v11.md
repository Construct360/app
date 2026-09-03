# Construct360 v11 — Platform Administration foundation

Historical v11 instructions. If v11 is already installed and tested, follow **START_HERE_v12.md** instead. Do not repeat the foundation setup to install v12.

Prepared for sam.gerrie@construct-360.co.uk. One company workspace per user account.

## What this release does

- Adds a private Platform Administration screen at `/platform`.
- Creates companies and invites their first Admin using your existing Supabase SMTP/template.
- Lists company metadata, invitation status, user counts and recent platform activity.
- Lets the Platform Administrator suspend/reactivate other companies.
- Enforces company isolation for existing Supabase memberships, linked staff and activity records.
- Uses trusted invitation reservations: retries do not delete accounts or transfer users between companies.
- Preserves the existing password-creation flow and branded logos.
- Gives new companies an account setup page with their own user management.

## Important: this is NOT the complete multi-company operational release

Clients, jobs, planner, timesheets, documents and other prototype modules still need migration to Supabase.
New companies and pre-existing test companies are deliberately kept in **Account setup only**.
Activation changes access status; it does not unlock operational modules.
The one-time owner script allows Sam's current organisation to retain the existing prototype.
No company, user or local browser record is deleted, renamed or moved by this package.
If Sam has no company membership yet, the Platform Administration area still works, but no prototype is enabled.

Browser-local prototype data is not a multi-company security boundary. Do not share browsers containing sensitive prototype data with customer users. Do not onboard real customer operational data until the module migration is finished. Do not manually set other companies to `prototype` to bypass setup.

## Install in this order

Use the current project as development. Keep the v10 ZIP and take a Supabase database backup before applying the migration. Do this during a short maintenance window: the old invitation function must not be used between steps 1 and 3.

### 1. Run the new migration

In Supabase → SQL Editor → New query, paste the complete contents of:

`supabase/migrations/003_platform_foundation.sql`

Run as the project owner/postgres role. It requires migrations 001 and 002 to have already been applied. Do **not** rerun 001 afterwards: it restores the old grants/functions. Migration 003 is rerunnable.

This adds platform tables, invitation reservations and status-aware RLS, and removes direct self-service company creation. Public registration can create an identity, but cannot create a company or grant a role. Company creation now goes through Platform Administration.

### 2. Appoint Sam as the first Platform Administrator

Confirm that `sam.gerrie@construct-360.co.uk` already exists in Supabase Authentication → Users and has a verified email. Do not create a second account if it already exists.

In a separate SQL Editor query, paste and run:

`supabase/setup/004_bootstrap_sam_platform_admin.sql`     

This explicitly grants that existing account platform access. It does not store a password and does not automatically promote future sign-ups with that email. If the account is absent or unverified, it stops without applying changes.

It also preserves prototype access for that account's current company. Check the company name shown in Account after signing in; the script does not guess a company by name or rename it.

### 3. Deploy both Edge Functions

Open PowerShell in the extracted package folder (the folder containing `index.html` and `supabase`).

The existing project reference is `mvfadkpisvxnszryrcgy`. If testing in a new Supabase project, replace it in both commands.

```powershell
npx.cmd supabase@latest functions deploy admin-users --project-ref mvfadkpisvxnszryrcgy
npx.cmd supabase@latest functions deploy platform-companies --project-ref mvfadkpisvxnszryrcgy
```

The `_shared` folder is required and is uploaded automatically with the imports. Do not deploy only `platform-companies`: the updated `admin-users` removes the unsafe legacy invitation retry logic.

Keep JWT verification enabled. Both functions also verify the caller and enforce permissions themselves. Do not add `--no-verify-jwt` as a workaround; report any 401 error for investigation.

In Supabase Edge Functions → Secrets, confirm `APP_URL` is the **exact HTTPS origin where you use the app**, for example `https://app.construct-360.co.uk`. No trailing path, query string or `/**`. Both functions reject other browser origins. If using a Vercel test hostname instead, use that exact origin and ensure it is allowed in Supabase Auth redirect URLs.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to hosted Supabase Edge Functions. Never put the service-role key in GitHub, browser code or Vercel public variables.

### 4. Upload the frontend package to GitHub

Extract the ZIP and upload its **contents to the existing repository root**, replacing matching files. Do not upload the ZIP or an enclosing version folder. Include the new `platform.html`, `platform.js`, `platform.css`, `supabase` subfolders and dotfiles.

Vercel's existing Git integration can deploy it. No new project, domain, framework or GitHub Actions workflow is needed. No new Vercel environment variables are required for this release.

The Supabase invite template and Resend configuration are unchanged; do not replace a working dashboard template just for this release.

### 5. Sign in and check Platform Administration

Sign out and back in as Sam. Your current prototype header should show a **Platform** button. Alternatively visit `/platform` on your app domain. Users without the separately assigned platform role get an access-denied page and their API requests are rejected.

Use **Add company** with a company name, first Admin name, and a fresh email address you control for testing. The email cannot already belong to another company/account. Keep each user in one company; do not change memberships manually to move users.

If email sending fails, the company stays in the list. Correct SMTP/configuration, wait at least 60 seconds and use **Resend invitation**. Do not delete the company or user to retry. Once an invitation has been accepted, use normal sign-in or password reset instead of resending it.

## Acceptance checks in your Supabase project

1. Sam can open Platform Administration; an ordinary company Admin cannot.
2. Add Test Company A and B using two distinct test inboxes.
3. Each first Admin receives the invitation, accepts it and creates a password.
4. Each lands on their own named account setup page, not the prototype dashboard.
5. Each company Admin can manage only their own users and invite an Operative or Supervisor. A linked staff record is created in Supabase; the operational Staff page will become available with the later module migration.
6. Repeat an unaccepted invitation: the same account/membership remains and no other company is affected.
7. Suspend company B from Platform Administration. Refresh B: it shows access unavailable; company-management and database requests are denied. A remains active. Reactivate B: its setup access returns.
8. The final active company Admin cannot be demoted, disabled or deleted. Platform Administrator accounts cannot be changed through company user management.
9. Your existing Construct360 prototype and invitation flow still work.

Existing login sessions may keep displaying previously loaded information until refreshed. RLS and Edge Functions recheck active company status on requests. Previously downloaded or browser-local data cannot be recalled by suspension.

## Verification already performed locally

- Migrations 001, 002 and 003 execute in an isolated PGlite PostgreSQL engine; 003 reruns successfully.
- 56 database assertions cover cross-company reads/writes, platform-only access, disabled/suspended users, invitation ownership, retry/rollback behaviour, one-company constraint, and last-Admin protection.
- JavaScript and inline scripts parse; Edge Function TypeScript syntax checks pass.
- Mock-transport Edge tests cover invalid sessions, rejected origins/configuration, SMTP failure retention and cross-company user-deletion denial.
- Browser UI checks cover company creation, search, confirmation/status update, signed-out/access-denied screens and a phone-width dialog with no horizontal overflow. Test records/emails are local fixtures only.

Local tests model Supabase's Auth tables and `invited_at` transaction; they do not run the hosted Auth service, its email delivery or deployment gateway. Live invitation/password setup and Supabase deployment still require the acceptance checks above. No hosted project has been changed or tested by preparing this ZIP.

Developers can rerun the included isolated regression suite from the `tests` folder with `npm.cmd install --ignore-scripts` followed by `npm.cmd test`. No live Supabase credentials are required. The browser fixture server used during development is not shipped.

## Next development stage

Move Clients and Jobs to organisation-owned Supabase tables with RLS and data migration/import tools. Then migrate the remaining operational modules and implement the agreed role matrix. The Platform Administration screen is not a substitute for those migrations.

## Recovery note

Keep backups. Frontend rollback alone is not a full rollback: v10 expects the old database/invitation behaviour. If installation fails, stop and share the exact error before restoring or rerunning older SQL. Do not rerun migration 001 over migration 003 or re-enable self-service provisioning/grants to bypass an error.

## Technical references

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth)
- [Supabase Auth invite implementation](https://github.com/supabase/auth/blob/master/internal/api/invite.go)

# v20 verification — 21 September 2026

Prepared locally. No GitHub push, production SQL execution, Vercel deployment, live account changes or emails were performed.

## Verified

- **64 v20 database checks** against isolated PostgreSQL (PGlite): office/company notifications, individual and supervisor job assignments, unassigned live-job access, safe job projections, private-note and private-document exclusion, upload completion/removal, vehicle assignment/removal and inspections of other vehicles, defect resolution, Planner changes/cancellations, scaffold events, own timesheet/leave updates, pagination, independent read state, idempotent retries, invalid edits, direct-table RLS, disabled accounts, role downgrade and company isolation.
- **17 v19 → v20 upgrade checks**: existing job data/versions and vehicle assignments preserved, no fabricated historical notifications, old save receipts still valid, old-browser saves retain new address/assignments, archived jobs not live, fixed function search paths, exact RPC grants, private helper execution revoked, RLS enabled, accidental rerun rollback, anonymous/platform-only denial and company suspension.
- **27 end-to-end browser checks** using Chrome and the actual UI, a local request adapter and real isolated PostgreSQL: Dashboard navigation/weather shell, job edit→save→snapshot, vehicle assignment→personal Dashboard→inspection form, supervisor notification→full job page, private change exclusion, RAMS upload→notification→unassigned-worker access, individual read state and reload, second-company isolation, desktop/mobile rendering and job editor overflow. No browser JavaScript errors occurred.
- The existing complete regression runner passed for earlier releases, then Clients & Jobs (95), Operations (102), client/staff/storage (48), vehicles (72), timesheets (85), job files/inspections (67) and profiles/planner/Handover (46) passed again with **v20 installed**. Syntax checks for app JavaScript/inline scripts and Edge Function TypeScript passed as part of the suite; weather API tests used mocked external responses.
- Supabase security guidance informed explicit tenant/role checks, RLS on every new table, restricted column/function grants and server-authored notifications. Browser verification traced UI → request → database → response rather than testing appearance alone.

## Scope and remaining hosted checks

Auth claims and Storage HTTP transport are local fixtures. PostgreSQL runs the actual migrations, triggers, permission checks and policies; uploaded test bytes are held by the local adapter. These checks do not validate hosted PostgREST schema cache, live Storage transport, real sessions, email delivery, Vercel build output or live weather credentials.

Hosted Supabase security/performance advisors were not run against this uninstalled migration. Run/review those after installation, and complete START_HERE_v20.md’s test-company acceptance checklist. No claim is made about production state.

Notifications cover the listed activity types, not every audit entry or automatic date-based reminders. No email/push delivery was added. Existing company-wide shared-file access remains; private staff/pay/office data is not broadened. The Clients & Jobs transfer file is not a full database or Storage backup.

## Reproduce locally

From the package’s tests directory, install its pinned test dependencies and run `npm test`. The test runner creates disposable PostgreSQL databases and includes both historical and v20 scenarios; no live Supabase credentials are required. The local browser adapter and screenshots are intentionally excluded from the deployment ZIP.

The release packaging script checks all ZIP entries byte-for-byte against source, requires the migration and new Dashboard files, includes `.gitignore` and `.env.example`, and excludes private environment/runtime folders.

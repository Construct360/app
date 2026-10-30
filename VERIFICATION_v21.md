# v21 verification — 22 September 2026

Prepared locally. No GitHub push, production SQL, hosted deployment, live account changes or real file/task deletions were performed.

## Verified

- 38 new database/catalogue checks using isolated PostgreSQL (PGlite): company/role denial, checked Storage deletion, exact-object policy, no deletion without confirmation, pending-state privacy/recovery, begin/finish retries, incomplete-upload protection, legacy archived-file handling, selected-task-only deletion, crew removal, stale-draft rejection, affected-worker notification, private marker-table grants, anonymous denial and fixed function search paths. The 31 qualification names match the prototype.
- 7 v20 → v21 upgrade checks: existing operational data and files retained, no automatic purge, old mutation receipts retained, accidental rerun safely rolled back and suspended companies denied deletion.
- 33 Chrome end-to-end browser checks against the actual UI and isolated PostgreSQL via a local request adapter. Covered navigation/icons, qualification selection/custom persistence, uploads, inline thumbnails/enlargement/download, worker privacy, cancellation warnings, simulated Storage failure → Retry delete → successful removal, task rows/grouping/sticky column, preselected staff, multi-row task deletion, three-item notification height, mobile overflow and hidden-page routing. No browser JavaScript errors in the completed run.
- Visually inspected desktop job/Planner and mobile Dashboard/Planner screenshots. Horizontal calendar scrolling is contained within the calendar, not the page.
- Complete historical regression runner passed. Existing Dashboard (64), Clients & Jobs (95), Operations (102), client/staff/storage (48), vehicles (72), timesheets (85), job files/inspections (67) and profiles/planner/Handover (46) checks also passed with v21 installed. Existing auth, Edge Function, weather and earlier upgrade tests passed in the historical runs.

Supabase security guidance informed company/role checks, fixed function search paths, restricted grants, RLS and the Storage API deletion workflow. Actual file deletion uses the Storage API; production SQL does not delete Storage metadata to pretend the underlying object is gone.

## Limits and hosted checks

Auth claims and Storage HTTP are local fixtures; the adapter holds dummy uploaded bytes and emulates the Storage service while applying real PostgreSQL policies. These tests do not establish hosted Storage/PostgREST behaviour, real sessions, email delivery, Vercel build state or production backup retention. The simulated Storage outage tests the client recovery path, not a real Supabase outage.

Review hosted Supabase security/performance advisors after installation and run the START_HERE_v21.md acceptance checklist using disposable records. Existing broad/custom Storage policies may need separate review. No live deployment state is claimed.

Existing inspection competence warnings are unchanged; the imported list is a set of staff-form choices, not automatic qualification verification. Teams are hidden without deleting their records. Minimal deletion markers/audit/notifications remain; copies held outside the app cannot be recalled.

## Reproduce

In `tests`, install the pinned test dependencies and run `npm test`. Tests use disposable PostgreSQL databases and require no live credentials. Browser adapter, screenshots and local runtime dependencies are intentionally excluded from the deployment ZIP.

Packaging verifies each ZIP entry against source, requires both new frontend files and the v21 migration/guide, includes dotfiles and excludes secrets and private runtime folders. Earlier release ZIPs are not overwritten.

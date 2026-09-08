# v16 verification — 8 September 2026

Status: prepared locally, not deployed. No live company records, account permissions or SMTP settings changed.

Story: staff save daily hours through a checked database function without submission, explicitly submit their week, office returns or approves it, and fresh role-filtered data produces branded reports.

## Verified

- 81 isolated PostgreSQL assertions: daily draft persistence, separate submission, weekly uniqueness and retries, stale versions, locked submissions/approvals, reasoned returns, resubmission, Admin/Operations approval, missing/zero/changed rates, frozen approved pay, job assignment restrictions, other-company rejection, hidden colleague records and private pay, sanitised status history, RLS/grants, disabled/suspended/platform-only denial, and retention after account deletion.
- Existing 56 platform foundation assertions and Edge handler checks; JavaScript syntax and Edge Function TypeScript syntax.
- Existing 95 Clients & Jobs, 102 Operations, 48 client/staff/storage and 72 Vehicles assertions against v16; weather endpoint tests.
- Browser smoke check using agent-browser: the app loads, Timesheets navigation and controls render, no JavaScript page errors reported.
- Installed Chrome → local RPC transport → real PostgreSQL engine → rendered result: Operative saves on separate days and reopens a draft, explicit submission locks edits, Supervisor has a distinct private sheet, Operations returns then approves the corrected week, Admin sees company records, another company sees none.
- Simulated lost response after a committed save: form retained, unchanged retry succeeds without a duplicate or stale-version failure.
- Desktop and 390-pixel mobile screenshots inspected. Timesheet dialog and page have no horizontal overflow; sticky Save draft / Submit week controls remain available while scrolling.
- Branded PDF downloads generated through the actual app buttons. Text checks confirm the own-hours PDF excludes the colleague's name and rate/pay, while the office report includes both staff and pay estimates. Logo, spacing, fonts, page numbers and long-text pagination rendered and visually checked. Compact individual sample is one A4 page; long-name/long-notes stress report spans four pages without clipping.
- Existing Vehicles browser workflow and compact weather widget regression passed on the v16 fixture.

## Security design

Company identity and owner are derived from the authenticated membership, never accepted from the client. Supervisor/Operative queries are owner-scoped, including direct table reads. Pay is in a separately protected table and omitted entirely from field-role responses. Internal audit snapshots are office-only; owners receive status, time and return reasons without colleague identities or pay. All writes are through explicit authenticated-only RPCs with empty search paths, current membership checks, validation and transactional receipt/version handling. No browser update/delete grants allow rewriting submitted or approved records.

The regression harness was updated to recognise v16 as a post-v14 schema; it must not rerun the old v13 staff validation over a newer schema. This was a test-harness correction, not a change to earlier deployed migrations.

## Limits of this verification

Tests use PGlite's PostgreSQL engine and local Supabase Auth/Storage/transport fixtures, not the hosted Supabase gateway or real live JWT sessions. No live Vercel deployment or production load test was performed. PDF samples and browser fixtures contain test data only and are excluded from the release ZIP.

Hosted Supabase advisors remain a post-install check because the new migration has not been installed there. Run the live acceptance checklist in START_HERE_v16.md with two test companies after installation. Pay figures are intentionally limited to base-pay estimates; no payroll/tax correctness or overtime policy is claimed.

## Files and repeatability

New: timesheets.js, timesheet-pdf.js, supabase/migrations/20260908200027_timesheets_v16.sql, tests/timesheets.test.mjs, START_HERE_v16.md and this report. Updated: workspace.html/js/css, operations.js access guide, README, package version 1.6.0 (no dependency changes), test fixture/runner and the Operations regression's schema detection.

Install the pinned test dependencies in tests/ and run npm test. Local browser/PDF fixtures are under validation-v11 and are not deployed. Existing auth.js, Edge Functions, prior migrations and the legacy prototype are unchanged.

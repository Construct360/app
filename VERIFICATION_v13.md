# v13 verification — 6 September 2026

## Automated checks

- **102 combined operations assertions passed:** tenancy, role projections, private fields, staff/profile sync, reserved invitations/retries, frozen booking crews, cross-company foreign keys, overlap/date rules, stale edits, safe retries, suspension, Auth deletion/history retention and migration rerun.
- **95 Clients & Jobs assertions passed against the new schema:** ownership, permissions, contacts, versions/retries, archives, atomic imports and export/import round trips.
- **56 original platform/invitation assertions passed:** one company per user, platform administration, invitation rollback/retry, last-Admin protection, suspension and grants.
- Existing Edge-handler checks passed for invalid authentication/origin/configuration, platform access, SMTP-failure handling and cross-company deletion denial, using mocked transport.
- Frontend JavaScript parsed successfully; Edge Function TypeScript syntax was checked. This is not a full hosted Deno type check.

## Browser checks

The actual HTML/JS forms ran locally through a test transport adapter backed by an isolated PostgreSQL-compatible database. No real accounts, messages or company records were used.

- Created a Client and Job, manual staff with qualifications, a two-person team and a Planner booking.
- Verified expiry warnings, crew previews and database rejection of overlapping bookings with the draft retained.
- Verified Staff and bookings persisted between sessions.
- Verified Operative/Supervisor assignment views and role-specific crew visibility without private office notes.
- Verified Operations editing without Users/import-export controls, and Company B isolation from A's staff/team/bookings.
- Edited, cancelled and restored a booking.
- Visually inspected desktop Planner and phone-width booking screenshots.
- Checked Staff, Teams, booking/assignment details and Users at 390-pixel width; no horizontal dialog overflow.
- No page JavaScript errors were reported during these flows.

## Limits and reproduction

PGlite exercises PostgreSQL-compatible SQL in a single process. These checks do not exercise the hosted Auth gateway/PostgREST, SMTP delivery, Microsoft spam filtering or production multi-connection performance. The shared transaction lock and checked saves serialize company writes by design, but the local fixture is not a load/concurrency test.

No live deployment was performed. Run the one hosted acceptance checklist in START_HERE_v13.md after installation.

For clean local tests, open PowerShell in `tests`, run `npm.cmd install --ignore-scripts`, then `npm.cmd test`. To run Clients & Jobs against migration 006 too, set `$env:C360_TEST_OPERATIONS='1'` and run `node clients-jobs.test.mjs`.

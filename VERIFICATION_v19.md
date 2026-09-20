# v19 verification

No live migration, GitHub upload, Vercel deployment, email or customer-data changes were performed.

## Passed locally

- 46 new database assertions: Handover normalisation, event-driven inspection requirements, stale report rejection, repeat saves/statuses, no-scaffold placeholders, tenancy, multiple daily tasks, time conflicts, leave boundaries/overlaps/roles/cancellation/audit/idempotency, rollback on leave conflicts, private profile-photo policies, safe personal-field projection and old request retries not overwriting newer profile details.
- 11 upgrade assertions: existing status/data retention without fabricated historical events, both active scaffolds flagged, dismantled exclusion, history, restricted function grants and fixed search paths.
- Full previous regression suite: platform/Auth, Clients/Jobs, Staff/Teams/Planner, qualifications, weather, Vehicles, Timesheets/Gross pay, job files and inspections. Modern runs include v19. Historical migration-rerun tests are not permission to rerun older migrations in production.
- 33 main browser checks: client/job pages, status choices, Team label removal, Handover placeholder/registration, scaffold history, staff address/photo/credentials upload and authenticated previews, refresh, team profiles, two tasks after filtered creation, headings, leave rendering/conflicts, worker own tasks/leave, shared files and cross-company profile denial.
- Additional browser checks: vehicle history/edit, timesheet view → edit → save → view, leave cancellation, profile edit cancellation with images intact and browser Back.
- Desktop/mobile profile and Planner screenshots inspected; no horizontal page overflow at 390px; no browser page errors. Frontend scripts pass syntax checks.
- PDF generators are unchanged. Existing branded downloads remain; staff PDFs are still name/position/qualification records.

## Limits

The browser fixture uses dummy identities and emulates Storage HTTP transport against actual local PostgreSQL policies. It does not prove hosted Auth, Storage MIME/size enforcement, SMTP or Vercel. No live security-advisor result is claimed. Complete the live checklist after migration/deployment.

The reported one-task symptom was not a database one-task limit: two non-overlapping assignments for one person persist. The update removes inherited filtering after save, opens the saved date, adds a filter reset and shows ordered cards/counts. Overlapping default times still require correction; double-booking protection is intentionally retained.

Guidance checked: [Supabase Postgres triggers](https://supabase.com/docs/guides/database/postgres/triggers), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and the changelog. Supabase/Postgres skills informed tenant and role checks, private Storage, RLS, leave indexes and grants. Browser-verification skills informed UI-to-database checks.

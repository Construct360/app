# v15 verification — 7 September 2026

Status: prepared locally; no live database or deployment changes in this preparation.

Story: a company member opens Vehicles → submits the checklist through the Supabase RPC interface → PostgreSQL validates company/role/input and saves the inspection atomically → the UI shows the saved result and history. Operations can append a defect resolution without changing the original inspection.

## Passed

- 72 Vehicles PostgreSQL assertions: all four roles can inspect; company isolation; platform-only/disabled/unverified/suspended access denied; duplicate request protection; required checks, mileage and date constraints; mandatory defect descriptions; immutable browser records; office-only management/resolution; stale edits; archive/restore; history pagination and retained open defects; explicit grants, RLS and secured function configuration.
- 56 platform foundation assertions and existing Edge handler/auth/invitation tests.
- 95 Clients & Jobs and 102 Operations assertions on earlier schemas, v14 and v15; 48 client/staff/storage assertions on v14 and v15.
- Weather endpoint tests and compact weather widget browser regression passed.
- Browser verification first with agent-browser: workspace loads, Vehicles navigation/empty state displays expected controls; no page errors reported.
- Installed Chrome → local transport adapter → real isolated PostgreSQL → UI: create vehicle, assign staff, mandatory checklist, Operative defect reporting, Supervisor clear inspection retaining defect, Operations resolution with original history, second-company isolation, refresh and archive/restore.
- Desktop and 390-pixel mobile screenshots reviewed. Register and inspection popup have no horizontal overflow. Browser scenario completed with no JavaScript page errors.
- Vehicle editor also checked at 320 pixels wide. Opening a Client form before a Vehicle form produced no duplicate element IDs; vehicle labels and fields remained correctly associated.
- Lost-response browser test: the server committed the inspection but the response was deliberately replaced with a connection error; form contents remained, retry succeeded, and exactly one inspection was persisted.
- JavaScript syntax checks passed. No runtime dependency changes.

## Evidence and limitations

The automated DB tests use PGlite (PostgreSQL engine) with local Supabase Auth/Storage fixtures. Browser requests use the app's RPC interface but a local transport shim. This is not verification of hosted Supabase's gateway, live JWT sessions, Vercel deployment or real SMTP/provider weather.

Security review: new tables enable RLS with indexed company predicates; browser roles receive SELECT only; writes are through explicit authenticated-only functions with empty search paths, active membership checks and server-derived company/actor. No user-editable metadata grants privileges. Existing password-setup gating is retained by the membership helper. No direct update/delete grants allow rewriting inspections. Vehicle notes are explicitly company-visible.

Hosted Supabase advisors have not been run for this uninstalled migration. Run them and perform the live acceptance steps after deployment. No production performance/load or legal vehicle-compliance certification is claimed.

Local-only browser scripts, screenshots and fixture server remain outside the deployment package in `validation-v11`. Repeatable database tests are included in `tests`; install that folder's pinned dependencies and run `npm test`.

Files changed/added for v15: workspace.html, workspace.js, workspace.css, operations.js, vehicles.js, package.json/package-lock.json version only, README.md, START_HERE_v15.md, VERIFICATION_v15.md, the new migration, tests/workspace-db.mjs, tests/run-tests.mjs, tests/vehicles.test.mjs. No Edge Function or auth.js changes.

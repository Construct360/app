# v18 local verification

No live migration, GitHub upload, Vercel deployment, real email or live customer-data changes were made.

## Verified

- 67 new database assertions cover all-company minimal job access, shared Images/RAMS/Important documents, office-only metadata and exact-path Storage access, worker upload restrictions, archive retention, file types/sizes, ownership, company isolation, disabled accounts and suspended companies.
- Scaffold assertions cover initial requirements, everyone submitting, required checklist/outcome/declaration, immutable history, identity assigned by the server, explicit unverified qualification status, office alert counts, failed-check outcomes, exact 168-hour deadlines, stale versions, duplicate request retry, event-triggered reinspections, dismantling, RLS and restricted RPC grants/search paths.
- Existing regression suite passes for platform/auth, Clients/Jobs, Operations/Staff/Planner, qualifications, Vehicles, Timesheets, Gross pay and weather. Modern test runs include the v18 migration.
- Browser → transport → isolated PostgreSQL → UI passed for creating a job, automatic file-window opening, office shared/private uploads, unassigned worker access, progress image conversion/preview/download controls, scaffold creation, Operative inspection submission, qualification alerts, PDF download, Supervisor event flags and company isolation.
- Real typing and input-fallback tests cover 8.5, 0.5, 24, selection replacement, clearing, trailing decimal points, letters, exponent notation, 7.25, 100 and 24.5. Invalid input is blocked/restored immediately. Existing save/submit/return/approve browser regression passed.
- Due-state boundary tests cover current, due within 24 hours, exactly due/overdue, unsafe and dismantled.
- Mobile views have no horizontal overflow. Screenshots of the files gallery, inspection form and office schedule were reviewed. Authenticated thumbnails rendered successfully. Browser runs had no page errors.
- The application generated a two-page inspection PDF and a four-page long-text stress PDF. Every page was rendered and visually checked. Extracted text confirms report fields and qualification warnings, with no private-file/pay data.

## Limits of verification

Tests use PGlite (PostgreSQL) with auth fixtures. Supabase Storage transport is emulated while real storage.objects RLS is exercised; live Storage byte/MIME enforcement, hosted Auth, network behaviour and Vercel delivery still need acceptance testing. Security/performance advisors must be run against the actual project after installation.

No claim is made that inspector competence is verified, that a generic checklist is sufficient for all scaffold configurations, or that app submission alone fulfils statutory report delivery/retention duties. Obtain competent operational review before use.

## Deliberate design boundaries

- Shared access is company-wide as requested. Existing staff/pay/client confidentiality remains.
- Private documents use a private bucket, reserved immutable paths and policy checks, not merely hidden UI.
- Submitted reports preserve identity snapshots and are not editable. Qualification matching is intentionally deferred; all current reports are explicitly unverified.
- Physical tag pairing is not built or exposed. Future tags should link to stable scaffold IDs with server-checked company entitlements and pairing history, reusing the existing core.
- Browser-only legacy attachments, offline drafts, email/push notifications, report-signoff workflows and malware scanning are not included.

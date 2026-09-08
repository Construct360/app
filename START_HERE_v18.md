# Job files, scaffold inspections and restricted hours entry — v18

Prepared locally on 8 September 2026. This package has NOT been uploaded or deployed.

## Install: SQL first, GitHub second

1. Confirm v16 timesheets are installed and working, and ensure a current database backup is available.
2. If you have not run the v17 SQL update yet, run the entire included `supabase/migrations/20260908210129_timesheets_simplified_v17.sql` first. That update is safe to rerun and changes only timesheet validation.
3. Open your existing Supabase project → SQL Editor → New query. Paste the entire contents of **`supabase/migrations/20260908214340_job_files_scaffold_inspections_v18.sql`** and run it **once**, as the project database owner. Wait for success. It adds private file storage and inspection tables/functions without changing existing company records.
4. Extract **Construct360_GitHub_Ready_Job_Files_Inspections_v18.zip**. Upload its extracted files/folders into the existing GitHub repository root, replacing matching files. Do not upload the ZIP itself or an extra containing folder.
5. Wait for the normal Vercel Git deployment to succeed. Refresh the workspace and check that the sidebar says **v18**.
6. No new API keys, SMTP settings, environment variables, packages or Edge Function deployments are required. The migration creates the private `job-files` Storage bucket. Do not make it public.
7. Run Supabase security/performance advisors, review new findings, and perform the live checks below before operational use.

If SQL fails, stop and share the exact error. The v18 migration runs in a transaction; do not delete tables or rerun older foundation migrations. Some earlier versions were installed manually, so do not run a full CLI db push without reconciling migration history. Record this SQL Editor installation.

## Timesheets

The hours box now blocks unsupported typing and pasted values immediately, rather than accepting them until Save. Whole and half hours remain supported, with at most two digits before the decimal and a maximum of 24 hours per day. Typing the decimal point is temporarily allowed while entering 8.5; leaving a trailing point converts 8. to 8. Values are not rounded to a nearby half-hour. Older saved quarter-hour drafts must be corrected before saving.

Daily Save draft, weekly Submit, office approval, Gross pay and existing private-pay rules are unchanged.

## Job files

Save a new job first; its file window then opens automatically. Existing job cards have **Files & photos**. File uploads are separate from saving the job: a failed upload does not undo the job.

| Category | Who can view/download? | Who can upload? |
|---|---|---|
| Images | Everyone in that company | Everyone in that company |
| RAMS | Everyone in that company | Admin and Operations |
| Important documents | Everyone in that company | Admin and Operations |
| Office-only documents | Admin and Operations only | Admin and Operations |

Workers now see a minimal company job directory for shared files, regardless of Planner assignments. Planner still shows their own assignments. Client directories, private job notes, staff/pay information and office-only files have not been opened to workers.

- Images show thumbnails, enlarge when clicked and can be downloaded. Worker uploads can include progress photos.
- Images: JPG, PNG or WebP, up to 20 MB and below 40 megapixels. They are converted to JPEG and resized to a maximum dimension of 2,400 pixels; keep originals separately if needed for evidence.
- Document categories accept PDF, DOCX, XLSX, TXT and supported images up to 20 MB.
- Files require an authenticated, active company session; there are no public share links.
- Admin/Operations can remove files from the job view. The object and metadata are retained for recovery, not permanently deleted.
- Uploads are immutable. Upload a new version as a new file; do not assume an older RAMS document has been superseded automatically.
- Archived jobs retain their files but disallow new uploads. Workers' Jobs page lists current jobs.
- This release has no document approval/sign-off, mandatory RAMS acknowledgement, automatic malware scanning or bulk upload. Download only documents you trust.
- Unfinished upload reservations and already-uploaded objects can remain after cancellation. They do not become shared until finalisation. A future storage-cleanup process must distinguish these from retained records; do not manually delete arbitrary objects.
- Existing prototype-only attachments are not automatically imported.

## Inspections: one page for everyone

**Job → individual scaffold → inspection reports**

Admin and Operations register each erected scaffold separately: job, unique reference, exact location, description/design reference and erection date. Initial inspection is required before first use. Scaffold identities are retained; this release does not edit or delete a registered scaffold. Contact the office to resolve an incorrectly entered identity rather than claiming it has been dismantled.

Everyone can:

- View company scaffolds, status, due dates and report history.
- Submit an inspection, with checklist, findings, action taken, further action, actual inspection time, inspector position and the name/address of the party inspected for.
- Flag a scaffold as requiring another inspection after adverse weather, alteration, damage or another event.
- Download a Construct-360-branded inspection PDF.

Admin/Operations can mark a scaffold dismantled after confirming physical dismantling. This stops deadlines but keeps history. Archiving or closing a job does not stop its active scaffolds' inspection requirements.

Statuses distinguish initial/event-triggered inspection requirements, **Do not use**, overdue, due within 24 hours, within the seven-day interval, and dismantled. Deadlines are calculated from the actual inspection time, not the time the report was entered, using 168 hours. A late-entered report can therefore already be overdue.

Unsafe outcomes require a subsequent satisfactory inspection. A failed checklist item cannot accompany a satisfactory outcome. A report cannot precede the latest report or a newly flagged event. Submitted reports are read-only and retain scaffold/job identity as recorded at the time; no report deletion or silent overwriting is provided.

The screen recalculates due-state colours every minute using the last server time, but does not fetch colleagues' changes automatically. Use **Refresh**; a view older than five minutes warns that it is stale.

## Qualification warnings — agreed temporary behaviour

All four company roles can submit inspections. Every report is currently recorded as **Qualifications not verified — office review required**, because the qualification catalogue and matching rules have not yet been defined.

Admin/Operations see an in-app warning with the number of unverified reports when the workspace loads or refreshes. The inspection page and PDFs also show the warning. These are not email, push or offline notifications, and there is no acknowledgement/clear-warning workflow yet. No automatic judgment that a named person is unqualified is made.

When the qualification catalogue is added, define accepted qualifications for each scaffold type/complexity, validity dates and how qualifications at the actual inspection time are assessed. Current unverified reports should remain honestly labelled unless an audited review supports a change.

## Physical tag add-on — reserved for later

Both tagged and untagged users will keep this same core page, scaffold IDs, reports and deadlines. The intended later extension is a separate tag registry/pairing history linked to `job_scaffolds.id`, plus company-level purchase entitlements checked on the server.

No pairing, QR/NFC scanning, purchase/billing, tag activation or public tag lookup is enabled in v18. Do not print permanent app links onto production tags until the tag URL, identity/replacement and access rules are agreed.

## Safety and operating limits

Have your competent scaffolding/inspection lead review the prompts, reports and operating procedure before relying on this module operationally. The checklist is a general recording aid, not a complete inspection method or a compliance certificate.

HSE guidance includes inspection before first use, at intervals no longer than seven days, and after conditions likely to cause deterioration; inspections must be carried out by a person competent for the scaffold's type/complexity. Tagging does not replace an inspection report. See [HSE scaffold guidance](https://www.hse.gov.uk/construction/safetytopics/scaffoldinginfo.htm) and [HSE scaffold inspection FAQs](https://www.hse.gov.uk/construction/faq-height.htm).

Online access is required. This release has no offline inspection queue or server-saved inspection draft. Keep the form open if submission fails and retry unchanged. Reports are not automatically emailed to the responsible person. Follow your reporting, notification, site-access control and record-retention procedures; downloading a PDF alone does not fulfil those responsibilities.

## Live acceptance checks

1. Type and paste invalid hours; confirm they never remain in the box. Enter 8.5, clear, replace a selection and save a timesheet draft.
2. Create a job. Upload one RAMS file, Important document, Office-only document and photo.
3. As Operative and Supervisor, confirm the job/shared files are visible without assignment, each can upload a photo, and office-only files and private job notes are inaccessible.
4. Create two scaffolds on one job and one on another. Confirm separate histories, filters and deadlines.
5. Submit an initial report as an Operative. Verify its unverified-qualification warning appears to the office after Refresh.
6. Submit an unsafe report; verify Do not use. Flag an event, then confirm only an inspection after the event can clear the requirement.
7. Test upcoming and overdue dates. Verify backdating a report does not reset the clock to today.
8. Download a report, check all fields, branding and qualification warning. Confirm history cannot be edited or deleted.
9. Test another company: none of the first company's jobs, files, scaffolds or reports should appear.
10. Mark a test scaffold physically dismantled using an office account; confirm history remains and future inspection entry is disabled.
11. Check the phone experience and existing authentication, Staff, Planner, Vehicles, Timesheets and weather.

Back up the database AND Storage objects. Database-only backups do not replace a separate file-object backup. A frontend rollback should retain the additive v18 data and storage; do not drop the new tables or bucket.

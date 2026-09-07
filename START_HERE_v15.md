# Vehicles & inspections — v15

Prepared locally on 7 September 2026. Not deployed as part of preparation.

## What everyone can do

All active, verified company Admin, Operations, Supervisor and Operative accounts can view their own company's vehicles, notes and inspection history, inspect any current vehicle (not just their assigned vehicle), and report defects through an inspection. Platform Administrator status alone does not grant vehicle access.

Only company Admin and Operations can create/edit vehicles, assign staff, archive/restore records and resolve defect reports. Vehicle notes are company-wide, not private office notes. No staff pay, staff notes or other company records are included in vehicle responses.

The register contains registration, fleet name, type, make/model, mileage, assigned staff, availability, MOT/tax/insurance/service dates and notes. It displays missing dates, overdue dates and dates due within 30 days. Dates are manually maintained; this is not linked to DVLA or an insurer.

## Deployment order for the existing Construct360 installation

1. Confirm v14 is already installed and the current app works. Check a current backup is available using your Supabase project's backup facilities before changing the live schema.
2. Apply **only** `supabase/migrations/20260907195118_vehicle_inspections_v15.sql`, in full, once, as the project database owner. Prefer a tracked Supabase migration deployment. This adds three tables and three RPCs without modifying accounts or existing operational records.
3. Upload the **extracted contents** of the v15 ZIP to the existing GitHub repository root, or push the equivalent reviewed changes. Do not upload the ZIP or its containing folder as the website.
4. Let the existing Vercel Git integration deploy the main branch. Confirm the deployment succeeds, then reload `/workspace` and check the sidebar says v15 and includes Vehicles.
5. No Edge Function redeployment, additional API keys, SMTP edits, new Storage buckets or new dependency installation is needed for Vehicles. Keep all existing environment variables unchanged.
6. Run Supabase security/performance advisors after the live migration; review any new findings separately from existing ones.
7. Complete the checks below using test accounts, not operational vehicle records.

Important: old migrations were partly run manually in SQL Editor. Their hosted migration history is not fully reconciled. Do not blindly run a full `db push`, rerun 001–006, rerun v14, or run a platform bootstrap script. If SQL Editor is used for this new migration, record that fact and reconcile migration history before later CLI deployment. Do not run this same new migration twice.

The prior compact weather widget is included in this package. Existing invitations, Callum's access and company memberships are unchanged.

## Acceptance check

1. Admin: add a vehicle, assign a staff member, set mileage and due dates, save, refresh and reopen. Confirm every field persists.
2. Operative: Vehicles is visible. Complete all checklist results, mark one Defect, explain it and submit. Confirm the inspector, UK time and mileage appear in history and the vehicle shows “Do not use—review required”.
3. Supervisor: submit a later clear inspection. Confirm it does not remove the previous defect.
4. Operations: open Details / history → Record resolution. Enter the repair/action taken and confirm. Check the original failed inspection still shows its original results and the appended resolution, actor and date.
5. Check neither Supervisor nor Operative can add/edit/archive vehicles or resolve defects. Check a second company cannot see the first company's fleet or history.
6. Archive and restore a test vehicle; all history and open defects must remain. Archived vehicles cannot receive new inspections.
7. On a phone, check the full checklist, required fields, scrolling, history and close buttons. Refresh after colleagues make changes.
8. Briefly check login/invites, Clients, Staff, Planner and the compact weather widget still behave normally.

## Scope and limits

- Submitted inspections cannot be edited or deleted through the app. Every failed checklist creates one defect report containing the description of all failures from that inspection. A manager resolves that report as a whole; separate repair tasks per checklist item are not included.
- At least one check must be assessed; all-N/A submissions are rejected. The general checklist must be used alongside your vehicle-specific checks and company procedures. A clear result is not approval to drive or certification of legal compliance.
- Open defects override the visible availability message. Resolving them does not change a vehicle marked Unavailable. A clear inspection does not resolve earlier defects.
- History is paginated in groups of 25; old open defects remain visible regardless of page. Mileage increases are stored in inspection history. Accidental inflated readings need a deliberate, audited correction outside this first-release UI; historical readings cannot silently be reduced.
- Dates are supported between 1900 and 2199. Reminders use UK calendar days and are in-app only; there are no scheduled email/push alerts.
- Online submission only. If a connection fails, the form stays open for retry; nothing is marked saved until a successful server response. An unchanged retry is protected against duplicate records.
- No photo uploads, inspection PDFs, offline queue, automated DVLA lookup, separate servicing records, or automatic import of legacy demonstration vehicles in this version.
- Vehicle data is not included in the existing Clients & Jobs import/export tool. Database backups remain important.
- Rollback: revert the frontend commit if necessary and retain the additive tables/history. Do not drop inspection records or rerun old migrations to undo this release.

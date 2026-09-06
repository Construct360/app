# Construct360 v14 — Clients, Staff documents and Weather

This guide updates an existing working v13 installation. Older files are included for source completeness; do not repeat their installation steps.

## Included

- Primary client contact has Position / role alongside it.
- Site contacts become Additional contacts, each with a Site dropdown containing that client's Jobs. Save a new client and create its Job before selecting a Site. Existing multiple links are preserved unless you change that contact's Site selection.
- Staff status dropdown is removed. Login Active/Disabled remains in Users; staff Availability and Archive remain separate.
- Working role becomes Position, including Operations. Admin and Operations may edit positions and hourly rates, with pence, from £0.00 to £999.99. Blank means not recorded; zero is valid.
- Qualification image uploads, thumbnails, enlarged previews and downloads. Saved staff profiles have Download staff record: a branded PDF with name, position, qualifications and images. Pay and private notes are excluded; unsaved edits are not included.
- Overview retains Open jobs as its only statistic and adds weather with a changeable town, city or postcode.

Position does not grant login permissions. Changing a linked user's Position to Operations does not change their account role. Existing team supervisor eligibility still follows the linked account's working category. Manual staff profiles do not create logins.

## One update session

1. Keep the previous v13 ZIP and take a database backup using your established procedure. Pause staff, client and job edits during installation.
2. In Supabase project `mvfadkpisvxnszryrcgy`, open SQL Editor → New query as project owner/postgres. Paste and run the **whole** file `supabase/migrations/20260906180341_client_staff_documents_v14.sql`, including BEGIN and COMMIT. It extends the schema and creates the private Storage bucket/policies. It is rerunnable and retains existing data. **Do not rerun 001–006 or the bootstrap script.**
3. Wait for success. On failure, stop and retain the exact error; do not delete tables or disable RLS. If the session reports an aborted transaction, run `rollback;` before retrying the corrected whole migration. Saving the query is optional. If using CLI migration tracking later, reconcile history after a manual SQL Editor application before `db push`; do not blindly push older migrations.
4. In Vercel → Construct360 project → Settings → Environment Variables, confirm `WEATHER_API_KEY` exists for Production. Its value is your private WeatherAPI.com key. If already done, do not create another key. Keep the existing public Supabase URL/key variables. Never put the weather key in GitHub, browser scripts, `api/config.js`, or a `NEXT_PUBLIC_`/`VITE_` variable. Enable it for Preview separately if needed there.
5. Extract `Construct360_GitHub_Ready_Client_Staff_Weather_v14.zip`. Upload its **contents** to the existing repository root on `main`, replacing matching files. Include new `staff-documents.js`, `weather.js`, `api/weather.js`, vendor assets, package/lock files and migration. Do not upload the ZIP or nest the app in a new folder. Dotfiles are included; `.env.example` contains placeholders only.
6. Wait for a successful Vercel production deployment. A deployment after setting the variable picks it up. Keep existing framework/root/domain settings. **No Supabase Edge Function redeployment is needed for v14.** Invitations, SMTP and JWT settings are unchanged.
7. Sign out/back in, refresh, and complete the acceptance checks below.

If you have not registered with WeatherAPI, create an account at https://www.weatherapi.com/ and copy its API key privately into Vercel as above. Check current provider terms and quota. The widget shows attribution, timestamp and a safety disclaimer. It is not a substitute for site-specific safety checks or on-site wind measurement.

## Acceptance checks

Use separate company sessions, such as normal Chrome and Incognito. Two Incognito windows share a session.

1. As Admin and Operations, edit primary contact Position / role, add an Additional contact, select its Site and save. Refresh/reopen. Other clients' and companies' Jobs must not appear in the dropdown. Check links on the Job too. Stale open forms must reject conflicting saves.
2. Confirm no Staff status dropdown. Save Position and £25.50, refresh and reopen. Check £999.99 works and higher values are rejected. Position changes must not grant new account access.
3. Add a qualification and image, save, refresh and reopen. Check thumbnail, enlarge and Download. Download a staff PDF with multiple qualifications/images and check content, branding and page breaks. No pay/private notes should appear.
4. Check the other company cannot see these records/images. Supervisors and Operatives retain restricted assignment views without rates/documents. Platform status alone must not grant company document access.
5. Change weather location twice and confirm real data/timestamps after deployment. Test an unknown location. If setup is reported missing, check the Production variable and redeploy; never paste the key into chat.
6. Check client/staff forms, image viewer and weather on a phone without horizontal scrolling. Recheck invitations, password setup/recovery, login, Teams and Planner.

## Images and retention

- Private bucket `staff-qualifications`: only active company Admin/Operations may read or upload their own company's qualification images. No public image URLs.
- Up to 5 images per qualification, 30 per staff profile; input JPG/PNG/WebP up to 5 MB and 40 megapixels each. Images are resized to a 2400-pixel maximum long edge and stored as JPEG, stripping metadata. Downloads/PDFs use processed copies. Keep original certificates separately.
- Uploads happen on Save. Failed saves retain the draft for retry. Immutable paths prevent overwriting files referenced by saved records.
- Remove image removes its profile reference after Save, **not the private stored file**. Abandoned uploads also remain private. Permanent cleanup/retention needs a separate reviewed maintenance process and is not automated here.
- Disabling access cannot recall files already downloaded or displayed. Account deletion retains archived business records under existing v13 behaviour.

## Recovery and limits

Read VERIFICATION_v14.md. No production changes were made while preparing this ZIP. Live Storage, email and weather cannot be proven by local fixtures.

If deployment fails after the migration, pause staff editing and fix/redeploy v14. Older frontends do not understand image metadata and may drop it when saving qualifications. Keep the updated database; do not run old migrations to roll back.

Weather caching and request limits are best-effort per server instance, not distributed quota guarantees. Monitor provider usage and add shared rate limiting if demand requires it. The widget refreshes approximately every ten minutes while visible, not as a safety-critical live feed.

Timesheets, inspections, RAMS, equipment and other unfinished modules remain outside this update.

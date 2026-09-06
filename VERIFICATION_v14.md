# v14 verification — 6 September 2026

Status: prepared and tested locally; not deployed during this release preparation.

## Passed

- 56 platform foundation database assertions and existing Edge handler tests. Auth/invitation transport is mocked; no emails sent.
- 95 Clients & Jobs assertions and 102 operations assertions against both their earlier schemas and v14. Covers tenant boundaries, role projections, retries, contact links, stale edits, scheduling conflicts and lifecycle handling.
- 48 new v14 assertions: contact positions and same-client Site links; hourly rate validation/persistence; independent staff Position; restricted pay/document access; private same-company Storage policies; missing/malformed image paths rejected; rerunning migration preserves data.
- Weather endpoint tests: authentication, active membership, missing-key setup, input/method validation, cache with rechecked access, provider errors and no key leakage. Provider responses mocked.
- Installed Chrome against an isolated local fixture: save/reopen client and staff data; upload/reload images; enlarge and image/PDF downloads; mobile client/staff/weather without horizontal overflow; weather location changes. Final run had no page JavaScript errors.
- Actual app-generated A4 staff PDF rendered for visual inspection: branding, accented name, qualification details and image. Additional long-text/portrait-image multi-page PDF generated and reviewed.
- JavaScript syntax checks; npm audit reported zero vulnerabilities at verification time. jsPDF 4.2.1 and Noto Sans are bundled with licences. PDF generation stays in the browser.

## Remaining live checks

PGlite runs isolated PostgreSQL with Supabase Auth/Storage shims. This validates SQL and policies under the model, not hosted Storage, gateway or SMTP behaviour. Browser weather and uploads used local fixtures.

The user reported weather setup completed. No private key was retrieved and no live WeatherAPI request was verified. Real weather requires the Production variable and deployment containing api/weather.js.

No real company edits, Storage uploads, invitation emails or production migrations were performed for v14. Complete START_HERE_v14.md acceptance checks after deployment, including both office roles, two companies, restricted field users, live Storage and real weather.

Image retention and per-instance weather limiting tradeoffs are documented in that guide.

## Reproduce database/API checks

With Node.js 24 or later, open the package's tests folder and run `npm install`, then `npm test`. Tests use throwaway databases and fake transport, not production credentials. Test dependencies are separate from the app; never upload node_modules. Development browser fixtures are not shipped as production routes.

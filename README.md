# Construct360 · Dashboard & assignments · v20

Start with **[START_HERE_v20.md](START_HERE_v20.md)**. Test results: **[VERIFICATION_v20.md](VERIFICATION_v20.md)**.

v20 renames Overview to Dashboard, adds company-scoped personal notifications, job supervisors and individual assignments, site addresses and prominent assigned-vehicle inspection shortcuts. Run only `supabase/migrations/20260921181503_dashboard_assignments_notifications_v20.sql` after the v19 prerequisite, then upload this package’s extracted contents to your repository root. No new environment variables, dependencies or Edge Function deployment. Nothing has been deployed live during preparation.

Do not rerun earlier migrations after v20; they can overwrite newer functions.

Existing shared/private job files, progress images, inspection history, half-hour timesheets and branded reports remain included. Everyone can submit scaffold inspections; qualification checks and physical tag pairing remain future work. Competence warnings are unchanged.

Earlier release guides remain for installation history. Use START_HERE_v20.md for this update. Never upload secrets, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

# Construct360 · Compact workspace & staff Planner · v21

Start with **[START_HERE_v21.md](START_HERE_v21.md)**. Test results: **[VERIFICATION_v21.md](VERIFICATION_v21.md)**.

v21 adds the prototype's qualification choices, inline job photos/RAMS/documents, checked permanent file/task deletion, a staff-row Planner with fixed names, a three-notification scrolling Dashboard and reordered navigation with meaningful icons. Teams and Access Guide are hidden; underlying data is retained. Run only `supabase/migrations/20260922033518_job_media_staff_planner_v21.sql` after the v20 prerequisite, then upload this package’s extracted contents to your repository root. No new environment variables, dependencies or Edge Function deployment. Nothing has been deployed live during preparation.

Do not rerun earlier migrations after v21; they can overwrite newer functions.

Existing shared/private job files, progress images, inspection history, half-hour timesheets and branded reports remain included. Everyone can submit scaffold inspections; qualification checks and physical tag pairing remain future work. Competence warnings are unchanged.

Earlier release guides remain for installation history. Use START_HERE_v21.md for this update. Never upload secrets, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

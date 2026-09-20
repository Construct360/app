# Construct360 · Profiles, planner & Handover · v19

Start with **[START_HERE_v19.md](START_HERE_v19.md)**. Test results: **[VERIFICATION_v19.md](VERIFICATION_v19.md)**.

v19 adds full-page record viewing, private staff photographs and addresses, annual leave, clearer multi-task planning and automatic inspection requirements on Handover. Run only `supabase/migrations/20260919183227_profiles_planner_handover_v19.sql` after the v18 prerequisite, then upload this package’s contents. Keep the new `staff-profiles` bucket private. No new environment variables or Edge Function deployment. Nothing has been deployed live during preparation.

Do not rerun earlier migrations after v19; they can overwrite newer functions.

Existing shared/private job files, progress images, inspection history, half-hour timesheets and branded reports remain included. Everyone can submit scaffold inspections; qualification checks and physical tag pairing remain future work. Competence warnings are unchanged.

Earlier release guides remain for installation history. Use START_HERE_v19.md for this update. Never upload secrets, `.env`, `.vercel`, `node_modules` or `supabase/.temp`.

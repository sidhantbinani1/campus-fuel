# Campus Fuel account release setup

Branch: `feat/login-campus-leaderboard`. Do not deploy or merge main until the preview and real authentication are reviewed.

## Local development

Requires Node 20.19+ or 22.12+.

```sh
npm ci
cp .env.example .env
npm run dev -- --port 4173
```

Fill `.env` with the Supabase project URL and **publishable** key. The legacy anon key also works. Never put a secret/service-role key, database password or Google client secret in a `VITE_` variable: those variables are public browser configuration.

Guest planning works without Supabase, but signing in explicitly reports missing configuration. Authentication is never simulated for real visitors.

## 1. Supabase database

Create a free project in https://supabase.com/dashboard. Save the database password in your password manager. Choose your project region deliberately; do not put real student data in a throwaway environment.

In the project's SQL editor, run these migrations **once, in order**:

1. `supabase/migrations/202611140001_accounts.sql`
2. `supabase/migrations/202611140002_catalog.sql`

The second is a generated seed for 22 CSU schools and the 342 imported menu items / planning suggestions. To refresh it after verified menu changes, run `npm run catalog`; use a new migration filename for databases that have already applied the original migration. Historical meal snapshots remain intact when catalog data changes.

In Project Settings / API or the Connect dialog, copy the project URL and publishable key into `.env`. Restart the development server after changes. Authentication requests use Supabase; all private tables use RLS. Only validated owner-scoped RPCs mutate data. Service-role keys are unnecessary for the browser.

## 2. Google sign-in

In Google Cloud Console https://console.cloud.google.com/ create or select the Campus Fuel project. Configure Google Auth Platform branding, support contact and authorized domains. Create a **Web application** OAuth client.

Copy the exact Supabase callback URL shown under Authentication / Sign In / Providers / Google into Google's **Authorized redirect URIs**. It normally resembles `https://PROJECT_REF.supabase.co/auth/v1/callback`; use the value Supabase actually gives you.

Put the Google client ID and secret into the Supabase Google provider settings, then enable that provider. These secrets belong in provider settings, never source code or chat. If Google's consent configuration is in testing, add your test accounts; finish Google's publication requirements before a public launch.

Google handles Google sign-in. Campus Fuel does not request a second email code for it.

## 3. Email code sign-in

Enable the Email provider. In Authentication / Email Templates / **Magic Link**, use a code template such as:

```html
<h2>Your Campus Fuel sign-in code</h2>
<p>Enter this code in the tab where you started signing in:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request this, ignore this email.</p>
```

The app uses `signInWithOtp` and `verifyOtp(type: 'email')`. Keep email rate limits enabled; configure an appropriate code lifetime and test resend / expiry behavior.

For public email delivery, use a transactional sender with custom SMTP. Confirm whether you own a domain, or register one yourself. Add the sender's DNS verification records at your domain registrar. Copy the exact SPF/DKIM records the provider supplies; do not invent or overwrite existing SPF records. Configure the verified sender and SMTP credentials in Supabase. The default Supabase sender is restricted and is not suitable for general public account creation.

No paid Supabase upgrade is required just to develop the app. Monitor actual database, authentication and traffic usage in the dashboard. Images and social posts are intentionally excluded from this release.

## 4. Auth redirects and Vercel preview

In Supabase Authentication / URL Configuration, allow `http://127.0.0.1:4173` and your exact preview URL as redirect URLs. Set the production Site URL when the deployment address is confirmed. Avoid broad redirect wildcards for production.

In Vercel https://vercel.com/new import this GitHub repository. Framework preset: **Vite**. Install: `npm ci`. Build: `npm run build`. Output directory: `dist`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the intended Preview/Production environments. Deploy the feature branch as a **preview** first. Changes to build-time environment variables require a rebuild. Keep production attached to the reviewed main branch. No Vercel configuration file is required for this single-page root-based app.

For a public rollout, use an appropriate separate test environment so test accounts and rankings do not contaminate real records. At minimum export and remove disposable test data before inviting real users.

## 5. Review before public release

- Arrange appropriate review of the draft Terms/Privacy Notice in `src/legal.js`. No support email is displayed for this release. Bump the document version in `src/model.js` and the SQL acceptance checks together if the text materially changes.
- Verify Google login and email code login on the actual preview and mobile devices, including expired codes, resends, returning sessions and sign-out. These depend on external provider configuration.
- Save as a guest, sign in and finish school onboarding; verify the targets survive.
- Use two accounts to verify no private goals/history leak between them, including sign-out and account switching in one browser.
- Log, edit, and delete meals; check serving-scaled totals and historical targets on a second device.
- Change schools; verify older meal records stay attached to their original campus. Unsupported schools show no Cal Poly menus.
- With five disposable participants, verify rankings appear; turn participation off and verify access and contributions are removed. Public nicknames must stay off unless enabled.
- Export an account, delete it, and confirm its records and ranking contribution disappear.
- Review a Vercel preview together, then merge the feature branch and deploy production.

## Verification already available

`npm test` runs a real PostgreSQL-compatible PGlite instance for migrations, row-level security, RPC ownership, contributor thresholds, repeated-log deduplication, stale-save rejection, rollback and account deletion. It also tests account UI with a simulated auth client and graph/import logic. `npm run build` creates the Vercel-ready bundle.

These checks do not replace live Google/SMTP or multi-device acceptance testing. Supabase credentials and provider setup are required for those checks.

## Data and ranking behavior

Private records: account identity, selected school, goals, historical daily goals, compact meal snapshots, serving counts, favorites and document acceptance timestamps. The browser retains guest drafts and the Supabase session; signed-in nutrition history is not copied into guest localStorage.

User records use revision checks and atomic saves. A stale tab cannot overwrite a newer account snapshot: it offers export and reload instead. Failed saves display retry and warn before tab close; do not close with unsaved changes. This release synchronizes a bounded account snapshot rather than implementing offline-first multi-device merges.

Activity-based rankings use distinct participating account counts and require at least five contributors per meal/location. Counts below five are suppressed, including meal subsets in otherwise qualifying groups. Rank windows use America/Los_Angeles calendar day/week/month; personal charts use the user's local calendar and rolling 7/30/365-day views. Protein Picks compares listed servings; price-based views stay empty until verified prices exist. Hidden Gems uses saves, not invented ratings. No comments, votes, photos or public individual consumption totals are included.

## University Plates marketing / student bridge

The root `index.html` is the university-facing homepage. The existing student
application is now `app.html`; `demo.html` is a sample-only walkthrough and
`contact.html` is an explicitly non-submitting inquiry preview.

Add the exact local and production `/app.html` URLs to Supabase Auth's allowed
redirect URLs before enabling Google sign-in. OAuth now requests that destination.
The homepage forwards legacy origin callbacks to `app.html`, preserving the query
and fragment for the auth client. Email code verification still happens in the
student app. Verify both flows end to end before launch.

No database migration, storage-key rename, institution license, ordering-provider
integration, or hosted deployment is included in this change. The existing 22-CSU
school directory remains in place; broader school coverage needs a separate change.
Configure a real inquiry backend and reviewed privacy copy before accepting leads.

## Meal assistant provider seam

`src/meal-assistant.js` separates the UI (`mountMealAssistant`) from recommendations
(`menuProvider`). The default provider is local, deterministic menu matching; no
external model calls or credentials are used.

To connect an AI service later, pass an async `provider` to `mountMealAssistant` in
`app.js`. It receives `{ message, history, catalog, context }` and returns
`{ text: string, mealIds: string[] }`. `context` contains the selected school and
user-entered goals. History is in memory only and clears when account data changes.
The UI resolves returned IDs against the current campus catalog, limits cards to
three, and renders provider text as plain text.

Use an authenticated server endpoint for the future provider. Keep model keys on
the server (never in `VITE_` variables). Resolve the campus catalog server-side,
validate returned meal IDs and numeric facts, and retain the same policy: recommend
meals using explicit user inputs, never prescribe calorie or nutrient targets.
Do not silently relax exclusions or invent menus for unsupported campuses. Unknown
nutrition values must stay unknown. Return the response shape above; no UI rewrite
is needed. The server should also enforce request limits and account authorization.

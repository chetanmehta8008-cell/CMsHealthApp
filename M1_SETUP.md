# CMsHealth M1 — Setup and test

## What this version is
A working **development build** with Supabase email/password authentication, optional Google OAuth, per-account IndexedDB cache, atomic local outbox, RPC uploads, full-table paginated pull, conflict review, tombstones and sync status. This is **not production-ready** and does not guarantee zero data loss, independent backup, E2EE, or verified medical AI. Do not enter real sensitive health information yet.

## 1. Existing Supabase database
You have already run `001_secure_core.sql`. Do not rerun it or the older `schema.sql`. Ensure four tables have RLS enabled. `health_entries` reads are scoped to `auth.uid()`, and writes go through `write_health_entry`.

## 2. Client configuration
Open `cmshealth/config.js`. Replace:

- `https://YOUR-PROJECT.supabase.co` with **Project URL** (Supabase Dashboard → Project Settings → API).
- `YOUR_PUBLISHABLE_OR_ANON_KEY` with your **publishable key** (or legacy anon key), from API Keys.

The publishable/anon key is intended for client apps **when RLS is configured correctly**. **Never** put the database password, secret API key, or service-role key in `config.js`. Do not send these secrets in chat.

## 3. Supabase Authentication settings
In **Authentication → Providers → Email**, enable Email. For easiest initial test, create a user with email and password in the app and confirm via email. In **Authentication → URL Configuration**, set **Site URL** to the origin where you host the app and add the exact callback URL to **Redirect URLs**. For local testing use `http://localhost:8080/` as a redirect URL. Avoid broad wildcards in production.

Google login is optional: first enable and configure the Google provider with Google OAuth credentials in Supabase; add the Supabase OAuth callback URI to Google Cloud. Merely displaying the Google button does not configure OAuth.

## 4. Serve the app
On your Mac, open Terminal in the extracted `cmshealth` folder and run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/` in your browser. **Do not** open `index.html` as `file://`. Initial login requires internet because the Supabase SDK is loaded from a CDN. Offline mode works only after the page and session have been loaded and cached; this is not yet a hardened installable offline app.

## 5. Test in this order (dummy data only)
1. Sign up, confirm email, and sign in. Verify your email appears in Settings.
2. Add dummy BP 120/80; wait for **Cloud synchronized**. In Supabase Table Editor → `health_entries`, check that one row belongs to your user.
3. Disconnect the network, add another dummy BP reading, and confirm **pending** appears. Reconnect; click **Sync now** in Settings. Confirm both rows in Supabase.
4. Open the app on another device using a **hosted HTTPS URL**. `localhost` on the Mac cannot be accessed as `localhost` from your phone. Sign in with the same account; verify both readings appear.
5. For conflict testing: edit the same synced record offline on device A, edit and sync it on B, then reconnect A. Review the conflict from Settings; export JSON before choosing a version.
6. Export a JSON backup. Sign out and sign in again. Confirm data remains accessible.

## 6. Critical limitations and next engineering tasks
- No independently verified cloud backup/restore, immutable audit of rejected conflict choices, end-to-end encryption, attachment uploads, secure secrets storage beyond standard Supabase auth, automated source verification, AI, or device-to-device push sync.
- The app stores **plaintext health entries in IndexedDB** on each signed-in device; cloud data is stored in Supabase. Do not share devices or use it for real sensitive medical information before client-side encryption and a privacy/security review.
- If the browser storage is cleared while offline, unsynced records can be lost. Export backups and verify cloud status.
- `config.js` is public by design. RLS and SQL grants must be independently security-tested before any public deployment.
- Do not open multiple simultaneous tabs while making offline changes; robust multi-tab locking and comprehensive crash/recovery tests are future work.
- If a user signs out with pending changes, those pending changes remain in **that account's local database** on that device; they are not transferred to other accounts.
- The M0 database (`cmshealth-local-v1`) remains separate and is **not imported or uploaded automatically**. Export M0 JSON from the old version if you need to migrate, then explicitly import while signed into the intended account in M1.
- The offline service worker is network-first and caches static app files, but the externally hosted Supabase SDK is not precached. For reliable offline cold starts, bundle and pin the SDK locally in a future build.
- This prototype is not a medical device. It does not diagnose or provide medical clearance.

## 7. Troubleshooting
- **Sign in error**: check Email provider, confirmation email, Project URL and publishable key.
- **Failed to fetch**: check internet, project status and allowed site URLs.
- **RPC permission denied**: verify migration succeeded and function EXECUTE was granted to `authenticated`.
- **Records stuck pending**: open Settings to see sync error; verify network and Supabase configuration.
- **Google sign in fails**: complete provider setup; use email sign-in until then.

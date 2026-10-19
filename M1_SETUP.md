# M1 configuration and dummy-data acceptance

M1 is a development build. Use dummy records until live security, encryption and
independent recovery are verified. Local automated tests do not establish live
Supabase readiness. See [AUDIT_M1.md](AUDIT_M1.md).

## 1. Preserve existing data and review SQL

The owner already ran `migrations/001_secure_core.sql`. That exact SQL is now
saved in Git, with whitespace normalized. **Do not rerun it**, the legacy schema,
or destructive resets. Export existing data through a trusted administrative
backup method and retain existing local exports before any live change.

Pause sync and close other app tabs before applying changes. Review `migrations/002_rpc_input_hardening.sql`: it replaces the RPC, validates
version/delete inputs, serializes receipt IDs, avoids foreign-entry collision
errors, and adds nullable revision source provenance. It does not drop tables
or records. Older revision sources remain unknown/NULL. The owner reports it completed in the live project; do not rerun it as part of
this checkout setup. Codex has not independently inspected the deployed definition.
For future projects, test first in a disposable Supabase project if possible,
then apply 002 once in SQL Editor after reviewing it and keeping a backup.

Rollback plan: before applying, save the deployed `pg_get_functiondef` and its
ACL in a secure administrative backup. If rollback is necessary, restore only
that reviewed previous function definition and its explicit grants inside a
transaction; **never rerun all of 001**. Leave the nullable `source` column in
place so any new provenance is retained. Rollback restores known input/locking
limitations; pause sync while investigating. No data deletion is part of rollback.

## 2. Configure public client settings

Copy the example into a Git-ignored local override:

```sh
cp config.example.js config.local.js
```

Edit `config.local.js` with your **Project URL** and **publishable key** (or legacy
anon key) from Supabase Project Settings → API/API Keys. These values are public
client configuration; RLS is still essential. Never use a database password,
service-role/secret API key, Google client secret, or a real `.env` in the browser
or commit them to Git. Do not paste secrets in chat.

`config.js` remains the placeholder default. A missing local override is harmless
except for a development-server 404 in the console. Keep a deployment-specific
public config file outside Git if you host the app later. No host is deployed here. Publish only runtime assets if deploying later; never serve the entire checkout, handoff, `.git`, environment files, or test artifacts publicly.

## 3. Authentication settings

- Enable Email in Authentication → Providers, with email confirmation.
- Add the exact `http://localhost:8080/` and `http://localhost:8080/?recovery=1` callbacks under Authentication → URL
  Configuration → Redirect URLs. Use the actual hosted HTTPS origin as Site URL
  when available; do not invent a deployment or use broad production wildcards.
- Use two disposable email accounts for isolation testing. After setup, restrict
  new sign-ups if appropriate for personal use.
- Google is optional: configure its provider in Supabase and the exact Supabase
  callback in Google Cloud. Keep Google's secret in Supabase, never this client.
- Recovery uses the originating browser's PKCE verifier: request/open the recovery
  link in the same browser profile. The recovery callback (including `?recovery=1`) must be allowlisted. The explicit
  recovery route also handles the pinned SDK’s PKCE callback, which does not
  reliably emit PASSWORD_RECOVERY. Enter and
  confirm a new password in the app. Cross-browser links, expired links, and
  password-refresh/session-revocation behavior require live testing.

## 4. Local development and automated checks

From `CMsHealthApp`, use Node 22+ (Node 24 tested) and Python 3:

```sh
npm ci
npm run check
npm test
npm run test:sql
npm run test:browser
python3 -m http.server 8080 --bind 127.0.0.1
```

Open the local origin in your browser. Chromium is already installed in this
cloud environment. On Mac, set `CHROMIUM_PATH` to an installed Chrome/Chromium
executable for `npm run test:browser`; for example:

```sh
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser
```

No build step or runtime npm dependencies are required. The pinned Supabase SDK
is vendored locally, not fetched at runtime. Service-worker updates wait for old
tabs to close; reload after closing other app tabs. Existing v1 IndexedDB stores
upgrade transactionally to v2, retaining entries/conflicts and copying old outbox
operations into the immutable mutation store. Do not delete old caches/databases
to troubleshoot; export first.

## 5. Dummy live tests, in order

1. Sign up as A, confirm the email, sign in, and verify the account shown in
   Settings. Test incorrect password, reset link/new password and sign-out. Test
   refresh/expiry/revocation and canceled OAuth separately; do not assume success.
2. Add BP **120/80**. Wait for “Cloud checked · no pending changes,” inspect Settings
   for errors, then verify its UUID, owner, version and payload in health_entries.
   A status label alone is not proof of correct server isolation.
3. Disconnect, create/edit another dummy record, reload while offline, and verify
   it remains. Reconnect: operations should upload in order, with one receipt
   per accepted mutation. On a simulated lost response, retry must not add another
   revision for the same mutation ID.
4. Delete a new entry while its upload is delayed, reconnect and confirm its
   cloud tombstone persists; it must not reappear. Verify earlier revisions remain.
5. Open two tabs on one account. Open the same editor in each, save in the first,
   then attempt to save in the second. The second must report a stale edit without
   replacing the first. Export/review before closing an unsaved form.
6. Sign in as B in a separate browser profile. It must not read A's entries,
   revisions, profiles or receipts. Test guessed A UUID reads and RPC writes with
   B's own session; no foreign payload/version may be returned. Signed-out/anon
   requests must not read these tables or execute the RPC. Direct browser writes
   to health_entries, entry_revisions and sync_receipts must be denied. Do not use
   the SQL Editor's privileged session as evidence of RLS isolation.
7. On another device, use an explicitly configured **HTTPS host** and the same A
   account. Log/edit/delete in both directions. Edit the same synced row offline
   on A and online on B, then reconnect A. Inspect local/cloud candidates, export
   the recovery archive and choose explicitly. Both candidates/decision must be
   present in local history. Phone localhost is not the Mac's localhost.
8. Switch accounts or sign out during a delayed upload/pull. Old results must not
   appear in the next account. Pending records remain in the original account's
   local database; sign-out does not erase them. Sign-out is local-device scope,
   not a promise to revoke all devices.

Multi-session SQL contention tests (same entry and same mutation ID/different
entries) still need native/live PostgreSQL verification. The embedded suite is
single-connection and uses two simulated auth identities with real PostgreSQL RLS.

## 6. Independent archive and restore drill

Settings → Export JSON produces an **unencrypted version-2 recovery archive**:
entries (including deleted), immutable attempted/pending operations, conflicts,
and local history from one consistent IndexedDB transaction. Store it somewhere
independent and secure. Exports do not contain the login session or encryption
keys, and there is no automatic backup service or tested key recovery yet.

For a restore drill, retain the original file and use a **fresh browser profile**:
open `http://localhost:8080/?restore=1` before signing into the same dummy account.
The restore query pauses cloud sync before the first pull. Sign in, verify the
paused status, and import the archive into the empty cache. Compare IDs, counts,
timestamps, deletions, operations, conflicts and history with the original. Resume
cloud sync explicitly from Settings only after verifying the archive. Do not clear
the original profile. A full recovery archive cannot be restored over existing
local state or into a different account; the import aborts without replacement.

Old M0/version-1 imports are separately supported with explicit confirmation.
All records validate before a single local transaction commits, duplicate/matching
IDs are rejected, and no existing record is silently replaced. Imported legacy
records queue as cloud changes; they are not a trusted server snapshot. Legacy
local timestamps lacking an offset cannot be reliably reinterpreted across zones.
CSV remains a view export, not a complete restore format.

## Remaining limits

Plaintext records/archives, no independent encrypted cloud backup, no realtime
push guarantee, best-effort foreground retries and full-table keyset scans,
incomplete clinical range validation and no production security/deployment review.
A failing queued record stops a sync pass visibly; it is never silently discarded.
Browsers without Web Locks keep local changes but pause cloud synchronization.
No AI/provider billing, automatic medical decisions, or exercise clearance.

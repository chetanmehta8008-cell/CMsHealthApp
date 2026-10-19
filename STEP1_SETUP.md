# CMsHealth App — Step 1: secure Supabase foundation

**Status:** Migration and configuration instructions prepared; no changes have been made to your Supabase project. This SQL is for a **new, empty** Supabase project. Do **not** run alongside the older `schema.sql`; it creates overlapping tables. Export any existing data before changing a database.

## 1. Configure authentication
1. Supabase Dashboard → Authentication → Providers → Email: enable email sign-in. Enable email confirmation for production. For early testing, use a confirmed email address.
2. Authentication → URL Configuration: set **Site URL** to your deployed HTTPS app address once known. Add `http://localhost:8000` (or the exact development port) under redirect URLs for local testing. Never use `file://` as an OAuth callback.
3. Google OAuth is **optional for now**: create an OAuth client in Google Cloud, configure the Google provider in Supabase using its exact callback URL shown in the dashboard, and configure allowed redirect URLs. Keep the Google client secret private. Email sign-in is enough for the first test.
4. Authentication → Settings: review sign-up controls, email confirmation, and MFA options. For personal use, disable public sign-ups after creating your account if appropriate.

## 2. Run database migration
1. Open Supabase → SQL Editor → New query.
2. Copy all of `migrations/001_secure_core.sql` and execute once in the **empty** project.
3. Check Table Editor for `profiles`, `health_entries`, `entry_revisions`, `sync_receipts`.
4. Verify RLS is enabled on all four tables. `health_entries` and `entry_revisions` should have read-only authenticated policies; writes happen only through `write_health_entry` RPC.
5. Do not turn off RLS to fix an authorization error.

## 3. Find public client configuration (do not share secrets)
Project Settings → API / API Keys (menu names may vary): copy the **Project URL** and the **publishable key** (or legacy `anon` key). These are intended for client configuration **when RLS is correct**. Never expose the `service_role` / secret key or database password. You may share just your project URL if you want assistance, but do not paste secrets here.

## 4. Understand the sync contract before enabling it
The existing M0 app stores entries as `{id,type,date,...}` in IndexedDB. Cloud rows use `{id,user_id,category,occurred_at,payload,version,...}`. The M1 client must:
- map local `type`→`category`, local `date`→ISO `occurred_at`, and other fields→`payload`;
- maintain an IndexedDB outbox with durable mutation UUIDs and expected server versions;
- send pending changes to `write_health_entry` in order, then mark acknowledged only after RPC success;
- pull server changes and merge only when no unsynced local edits exist;
- surface conflicts for user resolution; preserve the unsent local version;
- use soft deletes through the RPC, not local hard deletes;
- keep an explicit sync indicator (offline / pending / synced / conflict / error);
- migrate existing M0 entries carefully, with a JSON backup and explicit import confirmation.

**Important:** The SQL alone does not make the M0 browser app cloud-synced. The client-side adapter, sign-in UI, sync engine, encryption, and tests must still be built. Do not upload medical records before that work is verified.

## 5. Verification tests required before real data
- Signed-out requests cannot read records or invoke writes.
- Account A cannot read Account B's records, even by guessing IDs.
- Same mutation ID retried returns duplicate rather than a second write.
- Two edits from the same version yield one accepted write and one conflict.
- Offline entry remains locally available; reconnect uploads once and preserves ordering.
- Soft-deleted records remain in revision history and do not reappear after sync.
- Two devices cannot silently overwrite each other's changes.
- Backup export and restore are tested with a disposable dataset.

## 6. Security limitations of this foundation
- JSON payloads are **not encrypted client-side** yet. PostgreSQL RLS is access control, not end-to-end encryption.
- Database snapshots and platform backups depend on the provider's plan and retention policy; free tier is not a guarantee of recoverability.
- This migration does not include medical file uploads, cloud AI, rate limits, storage bucket policies, scheduled backups, or full audit hardening.
- Source records and revisions may be deleted by account deletion or privileged administrative operations; separate encrypted backups are still required.
- Never assume zero data loss. Test recovery procedures and retain independently secured backups.

# M1 audit and first hardening milestone — 19 October 2026

Baseline: `0a1d230040ccaf2406147a73ad3f82af6b947d0e`. Reviewed AGENTS,
handoff, PRD, setup documents, all client source/assets, and the exact secure
SQL supplied by the owner in chat. The original migration was missing from Git;
it is now preserved as `migrations/001_secure_core.sql` with whitespace normalized.
Do not rerun it. No live database, account, or existing user cache was modified by Codex.
The owner subsequently confirmed migration 002 completed in Supabase; its
deployed definition and authenticated live behavior have not been independently verified.

## Findings and disposition

| Severity | Baseline finding | This milestone |
| --- | --- | --- |
| Critical | Global DB/auth state reused after awaits could apply account A responses to B's cache; overlapping account switches could install stale DBs | Account generation checks, captured DB/user contexts, account-bound authenticated REST clients, immediate clearing of records/editor/search state, stale-connection rejection |
| High | Hard-deleting a pending create also removed its outbox during an in-flight or lost-ack create, allowing resurrection | Every create/edit/delete is an immutable durable mutation; delete remains a tombstone, successors await authoritative base versions |
| High | Reads outside write transactions allowed acknowledgment/pull to erase newer edits; tabs coordinated only by a boolean | IndexedDB transactional checks plus account-wide Web Lock for uploads/pulls; unsupported lock API pauses cloud work while retaining local writes |
| High | A stale editor used the newest cached server version and could overwrite intervening changes | Local revision tokens detect stale saves, including edits from another tab; editor remains open on save failure |
| High | Arbitrary imported IDs were interpolated into inline handlers | Strict UUID/own-category/date/numeric validation; record action IDs use escaped data attributes and DOM listeners |
| High | Export omitted tombstones, operations, history and cloud conflict candidates; resolution discarded rejected candidate | Version-2 atomic recovery archive includes all four stores; reviewed resolution retains both candidates and decision in local history |
| High | Import overwrote matching IDs and uploaded partially committed files | Validate/stage before one atomic commit; duplicate IDs/collisions rejected; archive restore restricted to same account and an empty cache; `?restore=1` pauses automatic cloud sync |
| High | Reset email had no password update flow; sign-out errors ignored | Recovery form with confirmation, explicit recovery callback route (the pinned SDK loses the PKCE recovery event), SDK updateUser, explicit local-device sign-out scope and visible auth errors |
| High | Server instants became timezone-free minute strings and could move when edited on a different device | Remote ISO instants retained; unchanged editor dates retain seconds/offset; new edits convert to ISO. Already ambiguous legacy timestamps cannot be reconstructed |
| Medium | Offset paging sorted by mutable updated_at could skip rows during concurrent writes | Stable UUID keyset full scans, transactional pending/conflict guards, no assumed deletion from absence, no dependency on server response cap |
| Medium | Status claimed sync before a successful pull or while offline; failures retried without backoff; hung requests could block forever | Offline/local-only/paused/pending/conflict/error/scanned states, bounded backoff, 20-second request aborts. Last scan shown for current session |
| High | External SDK absent from offline cache; unverified CDN runtime execution | Integrity-verified npm artifact vendored with license/checksum and precached; actual offline cold-start tested |
| Medium | Service worker deleted unrelated origin caches and could force mixed asset versions | App-prefix-only cleanup, cache-first versioned shell, normal waiting-worker lifecycle; close old tabs/reload to activate updates |
| Medium | Personal symptom assertions appeared for all accounts | General conditional red-flag messaging retained without asserting personal history |
| Medium | CSV formulas could execute in spreadsheet software | Formula-prefix neutralization in CSV; CSV is a view export, not a recovery format |

## SQL assessment

The supplied migration enables RLS on all four tables, scopes SELECT policies to
`auth.uid()`, removes direct authenticated entry/history/receipt writes, restricts
RPC EXECUTE to authenticated, uses SECURITY DEFINER with an empty search_path,
checks ownership inside the function, stores receipts per user, records revisions,
and uses entry advisory locks plus row locks and expected versions. These are
appropriate foundations, not proof of live deployment permissions.

Confirmed edge cases addressed in additive migration 002 (owner reports applied):

- NULL expected version could bypass `p_expected_version <> 0` on creation;
  negative versions and NULL delete flags now fail validation.
- The entry lock did not serialize one mutation ID concurrently reused across
  different entry IDs. A receipt-identity lock is now taken first, consistently;
  actual multi-connection contention still requires live/native PostgreSQL tests.
- A guessed entry UUID belonging to another account could cause a unique-key
  error on create. Return a generic conflict without a foreign row/version.
- Revision history omitted `source`. A nullable column retains future source
  provenance. Old sources remain NULL rather than being fabricated.

The original duplicate response returns only the receipt version, not a row;
the client deliberately handles this and subsequently pulls authoritative state.
Only accepted writes create receipts. Conflict retries therefore must preserve
local candidates until reviewed. Account deletion cascades entries/history/
receipts: retention is not independent backup. Table existence alone proves
neither deployed RLS nor RPC grants. Never validate isolation solely in the
privileged SQL Editor role or turn RLS off to resolve failures.

## Validation and remaining limitations

Executed: 15 Node/IndexedDB/auth tests, 30 SQL assertions, real Chromium workflows, syntax checks, vendored checksum verification and Git whitespace checks. All passed. The browser fixture includes the actual SDK PKCE recovery code exchange. See README for exact commands. Tests cover transactionally durable local writes,
concurrent/stale saves, delete/edit during upload, lost acknowledgment and reopen,
pull/local-write interleaving, account transition during a response, conflict
retention/resolution, v1 upgrade, timestamp preservation, validation and auth
failures. Real Chromium tests exercise forms, two tabs, complete recovery archive
roundtrip/collision rollback, and offline cold start (including a real SDK-persisted dummy session, offline write and reconnect). Numeric-field clearing is covered without losing the previous value from history. SDK tests use a simulated
Supabase endpoint, not the owner's account.

Embedded PostgreSQL tests execute migrations 001 and 002 under anon/authenticated
roles and two dummy account IDs. The pgcrypto CREATE EXTENSION line alone is
omitted in that harness because PGlite already has core gen_random_uuid but
not pgcrypto; it remains in the original migration for Supabase. SQL tests are
single-connection and do not validate advisory-lock contention across sessions.

Still required before real health data:

- Live email confirmation, PKCE recovery link, Google provider (optional), expiry/
  refresh/revocation, two-device acceptance and adversarial live RLS/RPC tests.
- Multi-connection native PostgreSQL race tests, storage quota/crash fault injection
  beyond covered reopen/response-loss scenarios, and broader accessibility/device tests.
- Encryption/key recovery, independently stored encrypted backups and recovery
  drills. Archives remain plaintext and user-managed; local history can be lost
  with the device. Never promise zero data loss or medical accuracy.
- Public static deployment must allowlist runtime assets rather than expose the entire checkout and its personal handoff/development files. The documented development server now binds loopback only.
- Strict CSP/security-header deployment work: record IDs no longer enter inline
  handlers, but many static UI inline handlers remain. No production deployment
  or comprehensive penetration review is claimed.
- Full scans converge on repeated runs but do not provide a transactional global
  snapshot under continuous cross-device writes. No realtime push/background
  execution guarantee. A server change log/cursor can be a later additive design.
- A failing operation conservatively stops its sync pass with a visible error;
  no invalid operation is silently dropped. Per-operation repair/quarantine UI
  and persisted retry metrics remain future improvements.
- Core clinical range/schema validation remains incomplete; finite numbers are
  not necessarily medically plausible. Cloud-side payload remains JSONB.

The blue responsive interface and existing modules remain. AI, uploads, paid
features and medical decisions stay disabled. Product-spec milestone numbering
reflects earlier planning; this milestone follows the handoff's M1 auth/sync scope.

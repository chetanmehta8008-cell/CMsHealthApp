# CMsHealth App

Personal local-first health tracker. **M1 development build: dummy records only.**
Read [AGENTS.md](AGENTS.md), [CODEX_HANDOFF.md](CODEX_HANDOFF.md),
[PRODUCT_SPEC.md](PRODUCT_SPEC.md), and the prioritized [M1 audit](AUDIT_M1.md).

## Run and test

```sh
npm ci
npm run check
npm test
npm run test:sql
npm run test:browser
python3 -m http.server 8080 --bind 127.0.0.1
```

Browser tests require Chromium (`/usr/bin/chromium` here); set `CHROMIUM_PATH`
for another installed Chrome/Chromium executable. No cloud credentials are
needed for automated tests. The app itself is static: no bundler/server build
or paid service is required. Do not open it using `file://`.

Follow [M1_SETUP.md](M1_SETUP.md) for public Supabase configuration, the reviewed
additive migration, dummy tests and recovery. Migration 001 was already applied
by the owner: **do not rerun it or any legacy schema**. Migration 002 passed local tests; the owner reports it completed in Supabase.
The deployed definition and authenticated live behavior remain unverified.

## Implemented and unverified

- Responsive blue dashboard, local record CRUD, BP charts, search, timeline,
  health passport and light/dark interface.
- Email/OAuth client, recovery UI, account-scoped IndexedDB, durable mutation
  queue/tombstones, explicit conflict review/history, retries and sync status.
- Bundled offline SDK; atomic plaintext recovery export/restore and legacy import
  that rejects matching IDs instead of overwriting them.
- Automated IndexedDB/auth, embedded PostgreSQL permission, and real Chromium
  tests. SDK integration fixtures are simulated; live Supabase and cross-device
  behavior require the acceptance steps in M1_SETUP.

Health data and archives are **not encrypted**. No independent backup service,
AI, wearable bridge, document uploads, verified public deployment, medical
decisions or exercise clearance. Local caches and sync are not substitutes for
independent backups. Never claim 100% medical/AI accuracy or guaranteed recovery.
₹0 by default; no paid features or AI providers are enabled.

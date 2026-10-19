# CMsHealth App

Personal local-first health tracking application. **M1 development build — not production-ready; dummy data only.**

Start with [CODEX_HANDOFF.md](CODEX_HANDOFF.md) and [AGENTS.md](AGENTS.md). The full PRD is [PRODUCT_SPEC.md](PRODUCT_SPEC.md). Follow [M1_SETUP.md](M1_SETUP.md) to configure Supabase public URL/key and run locally.

**Already applied in Supabase:** `migrations/001_secure_core.sql`. Do not run the legacy exploratory schema in `docs/`.

Never commit private credentials or real medical data. Validate RLS, offline sync, backups and encryption before storing sensitive health information.

# Codex project instructions — CMsHealth App

Read `CODEX_HANDOFF.md`, `PRODUCT_SPEC.md`, `M1_SETUP.md`, and `migrations/001_secure_core.sql` before editing code. This is a personal health application with sensitive data. Work incrementally; do not assume untested features are secure or complete.

## Non-negotiables
- Preserve existing records and backwards compatibility. Never run destructive database migrations without an explicit migration and recovery plan. Never re-run legacy schema (`docs/LEGACY_SCHEMA_DO_NOT_RUN.sql`).
- Never commit secrets, database passwords, Supabase service-role/secret keys, OAuth client secrets, private health data, or real `.env` files. Supabase publishable/anon keys are client-safe only with properly audited RLS.
- Do not send health records to AI providers without revocable per-category consent. Distinguish measured data, deterministic calculations, cited medical references, and AI hypotheses. No fabricated sources or 100% accuracy promises.
- Medical safety: do not diagnose, change medicines, or issue exercise clearance; highlight red flags and recommend appropriate clinical/emergency assessment.
- Preserve local-first functionality. Test crash recovery, offline outbox, multi-tab concurrency, idempotent RPC, stale-version conflicts, deletions, RLS isolation, import/export and restore before claiming reliability.
- M1 is a development build; use dummy data only until security, encryption, backup and recovery have been verified.
- Prefer small, reviewable commits, tests, and documentation of known limitations. Ask for required environment configuration rather than inventing keys or claiming a live deployment.

## First mission
Audit the M1 implementation against the existing Supabase SQL migration; identify blockers; add reproducible tests; then implement and verify secure auth + sync end-to-end before expanding to AI or integrations. Provide exact commands and user-facing setup steps.

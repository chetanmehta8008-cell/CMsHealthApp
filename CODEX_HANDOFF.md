# CMsHealth App — complete Codex handover (19 October 2026)

## Identity and status
- Name: **CMsHealth App** (formerly HealthOS); personal health management app, designed for eventual multi-user expansion.
- Four product-discovery rounds completed. `PRODUCT_SPEC.md` contains detailed PRD and architecture, and this file supplements it with decisions made in chat.
- M0 local-first prototype created. M1 development build is in this repository; **not production-ready, not independently validated against the user's live Supabase project**.
- User created a Supabase project and successfully ran `migrations/001_secure_core.sql`; four tables are visible: `profiles`, `health_entries`, `entry_revisions`, `sync_receipts`. RLS enabling was requested; policy isolation still needs adversarial testing. No deployment, cloud backup, real AI integration, or encryption verification completed.
- The code in this repository is the M1 snapshot. M0 ZIP and earlier one-off dashboard are historical reference only; don't mix older `index.html` or `schema.sql` into M1.

## User product decisions
- Premium modern UI with medical clarity, blue accent, manual light/dark toggle, desktop sidebar, mobile navigation, global command palette; easy navigation; responsive PWA on Motorola Edge 60 Fusion and Mac.
- Personal account, Google + email sign-in, multi-device access; free-tier hosting/database, ₹0/month by default, optional paid AI only after user approval.
- Supabase PostgreSQL primary synchronized store; IndexedDB local-first offline cache of all core tracking/planning/history; local save first, durable outbox, automatic retry, user-reviewed version conflicts, data provenance, audit history, encrypted backup and tested restore; indefinite retention until user deletes data.
- Ten essential modules: dashboard, vitals, symptoms/journal, vegetarian nutrition, exercise/rehab, habits/routines, sleep/recovery, medications, medical records, AI/analytics.
- Vitals: BP systolic/diastolic, HR, SpO2, weight/BMI, sleep, temperature, water, steps. Symptoms: chest pain/radiation, breathing/wheezing/cough, nasal blockage/allergies, knee/shoulder pain, dizziness/headache, palpitations, digestion; support custom symptoms and timestamps/severity/triggers.
- Nutrition: breakfast/lunch/dinner/snacks, Indian vegetarian foods, daily/weekly meal planning, calories/protein/fiber/sodium estimates, recipes/groceries, history-based suggestions, photo recognition, packaged food barcode scans.
- Exercise: activity/duration/intensity, medically confirmed restrictions/clearance, future personalized plan, pain/symptom tracking, rehab progress, demonstrations, steps and optional future wearables.
- Medical records: lifetime timeline, PDF/ECG/prescription uploads, medication history/adherence, clinician-ready Health Passport, structured/PDF exports. Additional: calendar, timeline, universal search, customizable widgets, notification center, guided onboarding, change history, privacy/consent controls, multiple device sessions.
- Logging: quick-add forms + conversational entry + dictation/voice; full create/edit/delete/backdate/import/export; combined dashboard (today's status, tasks, alerts, insights); adaptive plans only when explicitly approved by user.
- AI: proactive insights upon new entries, concise summary with expandable explanations, full historical retrieval as relevant, hybrid local/deterministic features plus optional cloud model, revocable category-scoped external AI consent. Features: natural-language search/Q&A, habit analysis, correlations, vegetarian meals, medically restricted exercise planning, sleep/nasal insights, symptoms, report explanation, medication warning flags, probabilistic trend estimates, weekly/monthly reports, doctor questions, Health Passport, voice, food image, barcode, adaptive goals.
- Evidence-first AI: ground every personal claim in actual timestamped records; calculate stats in code; retrieve reputable medical sources with real URL and document metadata; verify citations support claims; label uncertainty/conflicts; never invent links or claim guaranteed 100% accuracy; separate factual observation from hypothesis; refuse unsafe medical decisions. User wants to inspect original sources personally.
- Integrations: no current wearable or health app; Motorola Edge 60 Fusion Android; review imported entries before accepting; Android Health Connect likely needs a native bridge rather than direct PWA access. Notifications: browser/phone push and in-app, BP/meds/food/water/sleep/check-ins/missed routines/weekly reports/appointments/safety/backup status.
- Privacy: additional client-side encryption for sensitive notes/files, encrypted cloud sync where feasible, scoped AI data sharing, secure auth, RLS, no silent data loss, easy recovery of complete history.

## Current code and database
- App entry: `index.html`; main logic `app.js`; auth/offline sync `sync.js`; style `style.css`; PWA `sw.js`, `manifest.webmanifest`, `icon.svg`; public config placeholder `config.js`, template `config.example.js`.
- SQL migration actually run by user: `migrations/001_secure_core.sql`. Do **not** run `docs/LEGACY_SCHEMA_DO_NOT_RUN.sql` — incompatible earlier exploratory schema.
- Database: `profiles`, `health_entries` (JSONB payload with category and timestamp, per-user ownership, version and soft-delete), `entry_revisions`, `sync_receipts`; RLS + `write_health_entry` RPC with optimistic concurrency and idempotent mutation ID.
- Setup instructions: `M1_SETUP.md`, `STEP1_SETUP.md`, `README.md`.
- M1 app uses IndexedDB per account, local outbox, paginated pulls, RPC writes, conflict review; implementation is unverified and has known limitations: plaintext local health data, no independent backup/restore, no true end-to-end encryption, no reliable cold-start offline bundle, no hardened multi-tab concurrency, no production security review.

## Immediate engineering priorities (in order)
1. **Audit** app source, SQL RPC, RLS/grants and auth flows. Flag any inconsistencies, broken paths, hidden failure modes and regressions. Do not claim features tested without running tests.
2. **Build repeatable tests**: SQL/RLS account isolation, RPC permissions, unauthorized writes, idempotency, insert/update/delete/version conflicts, network loss and retries, reload/crash, multi-tab, pagination, data migration from M0 with explicit consent, user switching.
3. **Finish M1 auth + offline sync** with visible local/pending/synced/conflict/error statuses and explicit conflict resolution; improve cold-start offline asset caching; ensure no silent record overwrites.
4. **M2 storage reliability and privacy**: versioned migration strategy, independent encrypted backups and restore drills, client-side encryption for sensitive fields/files, secure key recovery design, data retention and user export/delete, document storage and access controls. No absolute zero-data-loss promise.
5. **Complete core tracking modules and charts**: time-series BP/HR/SpO2, exercise duration/days, sleep, meds, symptom timelines, long-term searchable history, health passport with source/timestamps and clear data completeness.
6. **AI**: server-side integration, provider abstraction and explicit opt-in budget, scoped consent, retrieval of user records, verified external sources, deterministic analytics, citations/uncertainty, safety gating, no autonomous medical plan changes, regression evaluation.
7. **Integrations**: reminders/push, voice, nutrition database, barcode/photo, import approval, future Health Connect bridge, PWA HTTPS deployment, cross-device acceptance tests.

## Concrete next action for Codex
Start by inspecting files and reporting a concise audit with priority-ordered findings. Implement the first necessary code fixes and automated tests; don't ask the user to rewrite the entire app. User already has a Supabase project; request only its public project URL and publishable key in local configuration, never a service-role key or password. If live DB access is needed, ask user to connect Supabase integration or execute reviewed SQL manually. Give a step-by-step Mac localhost test and then a hosted Android test. Use **dummy health entries** until privacy and recovery are validated.

## Medical safety
Past discussions include reported ongoing chest pain radiating toward the left arm, elevated blood pressure and uncertain respiratory issues. These are *not verified diagnoses*. App must not infer fitness clearance, recommend strenuous exercise, or provide automated medication changes; red flags require urgent clinical evaluation. Avoid encoding uncertain conditions as confirmed diagnoses.

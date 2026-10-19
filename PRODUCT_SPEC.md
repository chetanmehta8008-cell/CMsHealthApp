# CMsHealth App — Product Requirements Document (PRD)
Version 1.0 | October 2026 | Status: requirements approved; local-first foundation implemented

## 1. Product vision
A private, comprehensive personal health operating system that allows one person to log and retrieve lifetime health records, explain their measurements, plan everyday routines, see trends, and receive cautious evidence-backed recommendations. The architecture must allow eventual multi-user support without exposing other users' records.

### Goals
- Fast, accurate, editable and searchable historical logging across all health domains.
- Immediate doctor-ready health passport: most recent measured vitals with timestamps, medications with status, symptoms, reports and timeline.
- Data-driven visualizations with transparent calculations, correct units and provenance.
- Offline data entry with eventual encrypted, user-approved cloud sync.
- AI summaries and personalized suggestions grounded in the user's verified records and trustworthy medical sources.
- Responsive, accessible PWA on Motorola Edge 60 Fusion and desktop browsers.
- Zero recurring cost by default; any paid cloud AI usage must require explicit approval.

### Non-goals and boundaries
- Not a diagnostic device, emergency service, clinical decision support tool, or substitute for a clinician.
- No autonomous prescription changes, diagnoses, or exercise clearance.
- No guarantee of 100% AI accuracy, zero data loss, or unlimited free cloud resources.
- Medical risk rules must operate independently of generative AI.

## 2. Agreed user experience
- Premium medical clarity; blue accent; manual light/dark mode.
- Desktop sidebar, mobile-friendly navigation and global search/command palette.
- Home dashboard: today's actions, latest vitals, trends, safety flags, missed items and expandable explanations.
- Mixed entry: forms, quick-add, future dictation and conversational logging.
- Complete record control: create, edit, delete, backdate, import, export; audit history in production.
- AI may propose plan changes but never apply them without approval.
- Indefinite retention until the user deletes records, subject to storage and account limitations.
- AI permissions scoped by data category and revocable.

## 3. Modules and functional requirements

### Dashboard
Latest measurements with timestamp and source; daily completion counts; activity duration; alerts; customizable cards; time range controls; weekly and monthly review; data quality and missing-data indicators.

### Vitals
Systolic/diastolic BP, heart rate, SpO2, weight/BMI (BMI only if height supplied), temperature, water intake, steps; timestamp, context, device/source, posture, repeated readings, optional notes. Do not infer missing values. Graph systolic and diastolic separately. Unit validation and transparent aggregate calculations. Avoid using single readings as diagnoses.

### Symptoms
Chest pain and radiation, breathing issues/wheezing/cough, nasal congestion, knee/shoulder pain, dizziness/headache, palpitations, digestive symptoms, extensible custom symptoms. Record severity, onset, duration, triggers, associated symptoms, interventions, follow-up and clinician evaluation. Emergency warning pathways are separate from AI.

### Nutrition
Indian vegetarian food reference, breakfast/lunch/dinner/snacks, ingredient search, recipes, grocery lists, portions, meal plans and food journal. Nutrition estimates must be labeled estimates and accompanied by a source/food database; track sodium, calories, protein and fiber. Future barcode and photo recognition require explicit uncertainty, user confirmation and optional external providers.

### Activity and exercise
Activity type, duration, intensity, steps, body part, pre/post pain, restrictions, recovery and rehabilitation. Exercise planner gated by medical clearance status. Logged activity is not equivalent to safe activity. No strenuous exercise recommendations while chest pain is unresolved.

### Habits and routines
Editable tasks and goals; completed/missed/planned states; reminders, streaks, day/week calendars, adjustable wake times (5 or 6 AM) and adaptive planning proposals. Never punish missed medical tasks or infer adherence from absence of logs.

### Sleep
Bedtime, wake time, hours, quality, nasal blockage, snoring/gasping, fatigue and related trends; wearable data in later phases.

### Medications
Medication name, verified ingredients, dose, schedule, prescriber, start/stop dates, taken/missed logs and allergies. Medication interaction warnings require reputable drug database and clinician/pharmacist confirmation; never invent formulations from brand names.

### Medical records
Timeline of appointments, lab reports, ECGs, prescriptions and other files. Distinguish patient-reported from clinician-confirmed diagnoses. PDF and image upload, OCR/review, document metadata, provenance and doctor summaries in later phases. Sensitive attachments encrypted before upload when enabled.

### AI, analytics and retrieval
Evidence-backed question answering over authorized records; grounded daily/weekly summaries, trends and recommendations; source links and date; explicit uncertainty; medical safety checks; approval before plan edits. Proactive local rules for reminders, optional server AI jobs with consent and budget limits. No unverified claims or fabricated citations.

### Integrations
Initially manual entry and approved CSV/JSON import. Future optional Android Health Connect requires Android companion/bridge or supported provider integration; ordinary browser PWA cannot directly assume Health Connect access. No wearable currently. Push notifications depend on permission, platform, browser and backend scheduling.

## 4. Screen map
1. Overview — today's summary, latest vitals, trends, quick add, flags.
2. Vitals — entry, table, graphs, filtering and export.
3. Symptoms — severity, triggers, associated symptoms and timeline.
4. Nutrition — food reference, meal journal, estimates, planner, grocery list.
5. Activity — safe logging, restrictions, medical clearance and rehab.
6. Habits — daily schedule, streaks, checklists and reminders.
7. Sleep — duration, congestion and recovery correlations.
8. Medications — medication list, adherence and review.
9. Medical records — files, diagnoses, appointments and lab history.
10. Timeline — universal search, calendar, provenance, export.
11. Health Passport — time-stamped clinical overview and PDF/print.
12. AI Center (future) — cited answers, suggestions and approval queue.
13. Privacy and settings — access, consent, backups, sync, devices and data deletion.
14. Onboarding (future) — personal preferences, conditions, doctor-verified history and restrictions.

## 5. User stories and acceptance criteria
- As a user, I can add a dated BP reading and see both systolic and diastolic points in chronological order. **Pass**: chart shows actual entered numbers and dates, with no fabricated values.
- As a user, I can edit or delete an old record. **Pass**: all views update consistently and old values no longer affect current charts.
- As a user, I can find any logged item. **Pass**: full-text search across dates, types, titles and notes, including older records.
- As a user, I can work offline. **Pass**: core read/write features work with network disconnected after initial installation; queued changes sync after reconnection when cloud is enabled.
- As a user, I can restore data. **Pass**: export/import round-trip produces identical record counts and IDs, preserves timestamps and detects malformed files.
- As a user, I can see why AI recommended something. **Pass**: claim links to exact user record IDs and retrieved source excerpts, with confidence/limitations.
- As a user, I can refuse an AI change. **Pass**: proposed changes remain unapplied until explicit acceptance.
- As a user, I can protect health information. **Pass**: cloud row-level policies, verified login, scoped AI consent, encryption and backups tested.
- As a user, I can view records across devices. **Pass**: cross-device sync and explicit conflict resolution tested; no silent overwrite.
- As a user, I can view a doctor summary. **Pass**: measurement values, units, sources and timestamps visible; unconfirmed diagnoses labeled.

## 6. Engineering architecture
**Recommended production stack:** Next.js + TypeScript + Tailwind/shadcn/ui for PWA; Dexie/IndexedDB for offline local data; Supabase Auth (Google/email), PostgreSQL with RLS, Storage and server APIs; optional OpenAI or other LLM via authenticated server proxy; deterministic rule/analytics engine; optional approved source retrieval service. Recharts for visualization. Vercel or comparable free-tier hosting, subject to changing provider limits.

**Prototype delivered now:** static HTML/CSS/JavaScript + IndexedDB + service worker; no cloud calls, AI provider, login or encrypted backup. This is intentionally a functional local-first slice, not the production implementation.

## 7. Offline-first and sync design
- Local records carry UUID, type, event timestamp, created/updated timestamps, source, version, deletion marker and device ID in production.
- Mutations committed to IndexedDB first, then appended to an outbox transactionally.
- Sync worker sends idempotent batches with record version and mutation ID; server responds with authoritative version.
- Pull changes using server cursor; tombstones propagate deletions.
- On divergent versions, preserve both; show a conflict resolution screen with local/server versions and field-by-field differences. Never silently choose latest.
- On restart, retry unsent mutations with backoff; show sync state, last successful sync and failures.
- Server RLS ensures owner isolation; storage paths and object permissions enforce same owner.
- Encrypted backups, periodic restore drills, quota monitoring, explicit recovery instructions.
- Note: service workers can be suspended by the OS; background sync and notifications are best effort, not guaranteed.

## 8. AI evidence, provenance and safety
1. **Retrieval:** Identify the precise authorized user records; retrieve medical sources from allowlisted reputable domains with date, URL, section and excerpt.
2. **Claim ledger:** Every material claim is classified as `measured`, `computed`, `source-backed`, `inference`, or `unknown`.
3. **Calculations:** Code computes BP averages, adherence, durations and trends; AI never invents numeric calculations.
4. **Citation validation:** Verify links resolve and excerpts support specific claims; show source date, retrieved date and guideline jurisdiction. If retrieval fails, explicitly say evidence could not be verified.
5. **Uncertainty:** Show incomplete histories, missing values, contradictory measurements and potential confounders. Correlation is not causation; forecasts are estimates.
6. **Safety rules:** Hard-coded escalation rules independent of LLM. Chest pain radiating to arm or with concerning symptoms triggers urgent-care messaging and suppresses exercise suggestions pending medical assessment. No autonomous diagnoses or prescriptions.
7. **Consent:** Per-category permissions before sending any records to external AI; revoke access; audit what was shared and when.
8. **Approval:** Recommendations produce pending actions; user reviews and approves before any plan change.
9. **Testing:** Source-attribution unit tests, adversarial prompts, prompt injection isolation for uploaded documents, medical red-team scenarios and false reassurance checks.

**Accuracy commitment:** We can optimize for accuracy, traceability and honest uncertainty, but cannot guarantee 100% accuracy or no hallucinations.

## 9. Privacy and security
- OAuth and email auth; MFA/passkey optional later; per-user RLS and least-privilege policies.
- Encryption in transit; managed encryption at rest; optional client-side encryption of selected notes and files with key derivation, authenticated encryption, key recovery plan and explicit warning that lost keys may make data unrecoverable.
- No API secrets in browser bundles. Use authenticated backend proxy for AI and source retrieval.
- Never log raw health records in analytics, error trackers or third-party telemetry by default.
- Signed short-lived file URLs, upload size/type checks, malware scanning where available.
- Versioned migrations, backups, restore testing, device/session revocation, export and delete account workflows.
- Privacy notices and explicit AI sharing permissions; review relevant Indian data protection obligations before any public launch.

## 10. Milestones
**M0 — Completed foundation:** responsive blue UI, light/dark, navigation/search, local CRUD for eight domains, timeline, BP graph, health passport, JSON/CSV export and import, offline asset cache, safety messaging.
**M1 — Harden local data:** schema validation, IndexedDB migrations, structured records, encrypted backup, test coverage, improved charts and accessible mobile layout.
**M2 — Cloud identity and sync:** Supabase project, Google/email auth, RLS, per-user storage, outbox, tombstones, conflict review, recovery and cross-device tests.
**M3 — Full product modules:** nutrition planner, recipes/groceries, scheduled medication/habit reminders, calendar, PDF attachments, longitudinal graphs, doctor-ready reports.
**M4 — AI and evidence:** local deterministic analytics, source-backed retrieval, consent center, AI answers, suggestion approval, budget limits, evaluation suite.
**M5 — Advanced integrations:** voice, barcode/photo input, Android health bridge, push scheduling, report extraction and optional proactive AI.
**M6 — Production quality:** accessibility/security reviews, restore drills, PWA device testing, observability without sensitive telemetry, launch checklist.

## 11. Cost assumptions
Free-tier hosting and Supabase may support light personal use, but limits and terms can change. Paid AI inference, OCR, background jobs, high-volume storage, SMS and certain push services may cost money. Never enable paid services or exceed user-set budgets without approval. Local deterministic insights should remain free.

## 12. Known limitations of M0
- No authentication, cloud synchronization, encryption or automatic backups.
- No actual AI, web citation retrieval, push reminders, document upload, barcode/photo recognition, wearable bridge, custom widgets or conflict resolution.
- Local browser data can be cleared or lost. Export backups regularly.
- Browser storage isn't appropriate as the sole copy of irreplaceable medical records.
- Prototype entry validation is basic and requires comprehensive tests and schema hardening.

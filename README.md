# CMsHealth App — working M0 prototype

## Launch
- **Simplest:** open `index.html` in Chrome, Edge or Firefox. The app works locally with IndexedDB; PWA installation/offline asset caching may not work from a `file://` URL.
- **Recommended:** from this folder run `python3 -m http.server 8000`, then open `http://localhost:8000`. On localhost, the service worker can cache the app for offline use.
- **Phone:** host the folder over HTTPS to access it from your Motorola Edge 60 Fusion, then use the browser's **Install app / Add to Home screen** option. HTTPS hosting does not automatically add cloud sync.

## What works
- Overview and latest vitals; BP line chart; recent timeline.
- Add/edit/delete backdated entries for vitals, symptoms, food, activity, habits, sleep, medication and records.
- Global record search (Ctrl/Cmd + K), lifetime timeline, health passport, print-to-PDF.
- Local IndexedDB persistence, JSON backup/import and CSV exports.
- Manual light/dark mode, mobile-responsive interface, PWA manifest and static cache.

## What does NOT work yet
- Google login, Supabase database, cross-device sync, conflict resolution, encrypted storage/backups, AI chat, source verification, reminders/push, file uploads, OCR, voice, barcode/photo scanning, wearable connections.
- Medical interpretation or exercise clearance.

## Important privacy and safety notes
- **Sensitive data is stored unencrypted in this browser's IndexedDB.** Do not enter secrets or irreplaceable records unless you accept the local-device risk.
- **Exports are unencrypted.** Keep them secure and make backups regularly; browser data may be deleted by the OS or user.
- This app is not a medical device. The user has previously described chest pain radiating to the arm: seek urgent medical evaluation if ongoing, and do not use the app to authorize exercise.
- The app does not contact external servers, analytics, or AI services in this M0 build.

## Next engineering step
Implement M1 local schema validation, encryption and tests; then M2 Supabase Auth + PostgreSQL RLS + encrypted offline synchronization. See PRODUCT_SPEC.md and schema.sql.

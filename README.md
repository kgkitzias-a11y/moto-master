# Moto Master v2.1.0

**Live:** https://kgkitzias-a11y.github.io/moto-master/

## One saved Mega preparation run

560 core answers: all 140 verified active questions, four full passes. These are 140 distinct questions, not 560 invented questions. Existing progress prioritizes new and weak questions; passes alternate priority order and interleaved official groups. Options are shuffled deterministically, and official/booklet wording is alternated where available. Feedback includes reviewed explanations and comparisons with similar questions.

Mistakes add spaced reviews, with at least eight other items in between, until answered correctly twice consecutively with spacing. The run can extend beyond 560. Completion is not a guarantee of passing.

Every answer saves before advancing. Pause or close the app and resume the same question and option order. A write-ahead recovery record protects interrupted writes. Old answer history, settings, exam appointment and pairing remain intact; no reset or migration is needed. Old test modes remain removed. One large pass estimate leads the home screen. It uses the existing Moto Master heuristic evaluated now, is labelled as an unvalidated estimate, and explains the assumptions under “Πώς υπολογίζεται;”. It is not represented as Genie’s exact algorithm. No other readiness/probability gauge is shown. The 19 archive questions remain reference-only.

## PC and iPhone

Open the live URL or the existing installed app. When offered, press **Ανανέωση**; check the footer shows **v2.1.0**. Do not clear website data to update. On iPhone, continue using the same Safari or installed-app context that already holds your progress and pairing.

Press **Ξεκίνα το Mega τεστ** once. Afterwards use **Συνέχισε το Mega τεστ**. Offline practice works after the initial asset load. For a device change, press **Παύση & αποθήκευση**, wait for **Συγχρονίστηκε**, then open the updated app on the other device. The PC does not need to stay on.

Existing Gist connection is reused. New devices can pair from Settings using the existing QR flow. Tokens stay out of source control and exported backups. Settings also exports/imports the complete answer history plus saved Mega plans as JSON.

## Development

Vanilla HTML/CSS/ES modules, Greek UI, no bundler or CDN. Commands: npm ci; node tools/build.js 2.1.0; npm test; npx playwright test. Local preview: node tools/serve.js 8123.

- 245 unit tests; 15 active browser tests.
- src/engine/mega.js: immutable plan, deterministic answer replay, spaced review queue.
- src/store/mega.js: durable plans, answer journal, feedback position.
- src/store/progress.js: existing event history, backup and sync.
- src/sync/gist.js: optional moto-master-mega.json alongside existing progress/settings files; ordinary answer-event schema is unchanged.
- src/ui/mega.js: sole test flow; old test routes lead home.
- tests/legacy-e2e: historical UI suites for removed modes, outside active testDir. Legacy engine unit tests remain active to protect history compatibility.

Question data, printed answer indices, event sanitizer and reducer are unchanged. [The previous guide](docs/V1_GUIDE.md) is historical only. See HANDOFF.md and DECISIONS.md for release context.

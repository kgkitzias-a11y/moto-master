# MOTO MASTER — HANDOFF / SAVE / SUMMON (2026-09-15)

> **Update 2026-10-07 — v1.7.0:** DMV-Genie-style «Πρόγραμμα» (6 stages, one «Επόμενο» button) with stricter rules (practice tests end at the first mistake, hard simulator stops at the first mistake, ready at ≥ 99,5 %), «Επιπλέον γύρος» after the day's plan (hero, final-stretch card, every results screen), pass chance before → after, spaced-streak rule for the pass chance (D-038…D-040). Home order: Τελική ευθεία → Πρόγραμμα → daily plan. No dataset change. Validation: 225 unit + 43 e2e.

> **Update 2026-10-07 — v1.6.0:** Exam-faithful release (D-032…D-037). Official Ministry database (`ExerBase.mdb`) confirms the live bank = the 140 booklet questions, 10 groups, one question per group, 15′. Added: exam wording (`q.exam`) for 9 questions, group-based 15′ simulation with hidden ids, skip and «Πρακτικό», pass chance + «Τελικός έλεγχος», «Τελική ευθεία» home card, modes twins/proof/morning, `#/cards`, 31 reviewed explanations, look-alike sets (`q.twins`). Data patch: `python tools/patch_data_v16.py` (idempotent; run after `build_data.py`). Owner's real Gist log replayed through old/new datasets: identical. Validation: 223 unit + 42 e2e. Exam date set by the owner to Monday 2026-10-12 (tentative). Working clone unchanged: `C:\Users\kgkit\Documents\Codex\2026-09-20\rea\work\moto-master` (C:\moto_master is two versions behind).

> **Update 2026-10-05 — v1.5.0:** PC/iPhone sync now includes the exam date, tentative flag, archive option, manual daily goal and hard mode (D-031). These merge per field in `moto-master-settings.json` in the existing secret Gist; appearance and credentials stay local. Pull on foreground/reconnection and every visible minute. Existing progress events and reducer remain unchanged. Validation: 202 unit and 34 end-to-end tests passed, including two devices, offline edits, pairing and reset propagation. Dataset byte-identical to `bad7e05`. Current working clone: `C:\Users\kgkit\Documents\Codex\2026-09-20\rea\work\moto-master`. Account setup/pairing is a separate user step; never infer it is complete from deployment. The PC reset requested below was verified in Chrome on 2026-10-05; do not repeat it.

> **Update 2026-10-05 — v1.4.0:** Exam-date daily planner added (D-030); see README §10. Date/tentative status live on each device. Coverage and daily reviews have separate quotas; missed days/date edits recalculate. Same-day reset no longer leaves old answers in the daily count. No reset migration is shipped. The owner explicitly requested a personal reset on 2026-10-05, superseding the older “no resets” preference below for that action only. Validation: 198 unit and 33 end-to-end tests passed, including offline and Gist sync. Dataset unchanged.

> **How to resume:** open Claude Code in any folder and paste the block in §0. It contains everything the next session needs. Everything else in this file is the detailed state it will read from disk.

---

## §0 — SUMMON BLOCK (paste this verbatim into a new session)

```
Resume the MOTO MASTER project. Read C:\moto_master\HANDOFF.md first, then DECISIONS.md and AUDIT.md, before touching anything.

Facts you must not re-derive:
- Repo root C:\moto_master (git, branch main, clean, pushed). Live PWA: https://kgkitzias-a11y.github.io/moto-master/ (GitHub Pages from main root, repo kgkitzias-a11y/moto-master). Current version 1.3.1.
- gh CLI is logged in on this PC as kgkitzias-a11y (binary: %LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe — not on PATH in Git Bash; use the full path). Never start a device-login loop again; if auth is lost, send ONE ntfy and stop.
- Notify me via: curl -s -H "Title: Moto Master" -d "<msg>" https://ntfy.sh/moto-master-kgk-9x4tq2 — only at blocking points and completion.
- Booklet photos: C:\moto_master\question pictures\ (19 jpgs). NEVER commit/modify/delete. data/questions.json is verbatim from the photos (140 booklet + 19 «εκτός ύλης») and has been byte-identical since the first commit — verify with `git diff --stat bad7e05 HEAD -- data/questions.json` (must be empty) after any change.
- My progress lives ONLY in my devices + my private Gist (never in the repo). Any change must keep the event log and the reducer backward-compatible (append-only; old events must reduce identically). No resets, no migrations that drop events.
- Greek UI copy is the product of a 3-agent evidence-based glossary (docs/GLOSSARY.json, D-027). Reuse those terms; never reintroduce calques (προαγωγή, κουτί λαθών, συνεδρία, ώριμη, Mastery…).
- Workflow: edit → `node tools/build.js X.Y.Z` (bumps version + service-worker precache; ALWAYS run after adding a module or it breaks offline) → `npm test` (188 unit) → `npx playwright test` (31 e2e, needs `node tools/serve.js 8123` running or it starts one) → commit with the attribution trailer → `git push` → poll https://kgkitzias-a11y.github.io/moto-master/src/version.js until it shows the new version.
- Decide reversible/technical things yourself and record them in DECISIONS.md (next id D-030). Ask me only for money/publish-irreversible/taste decisions.

Then tell me in 5 lines what state the project is in and ask what I want next.
```

---

## §1 — What exists (verified 2026-09-15, commit f0694cf)

| Item | State |
|---|---|
| Live URL | https://kgkitzias-a11y.github.io/moto-master/ — v1.3.1, service worker active at that scope |
| Repo | https://github.com/kgkitzias-a11y/moto-master — main, clean, 17 commits |
| Dataset | `data/questions.json`: 140 booklet (tier `booklet`) + 19 recovered (tier `archive`, shown as «εκτός ύλης», off by default). Answer-key parity 140/140. 13 PDF-only ids deliberately not shipped (D-022). Byte-identical since commit bad7e05. |
| Audit | `AUDIT.md` (dataset), `DECISIONS.md` D-001…D-029, `docs/GLOSSARY.json` (agreed Greek terms), `work/` (git-ignored: transcription passes, i18n rounds, research, security review) |
| Tests | `npm test` → 188 pass; `npx playwright test` → 31 pass (last full run before the final one-line assertion fix; offline.spec re-run alone: pass) |
| Owner's progress | On his PC + iPhone + private Gist. NOT in the repo. Unknown to the next session; never assume it is empty. |

### Architecture (vanilla ES modules, no build step, no CDN)
- `index.html` (CSP meta, modulepreload list — add new modules there too), `sw.js` (generated by `tools/build.js` from `tools/sw.template.js`), `manifest.webmanifest`, `icons/`.
- `src/engine/`: `constants.js` (RULES + MODES), `reducer.js` (events → state, deterministic, sorted by (t,id)), `session.js` (one engine, PRESETS per mode, `buildQueue`), `selection.js` (queue policies incl. Genie ones), `events.js` (sanitizer for imported/pulled events), `shuffle.js`, `time.js`.
- `src/store/`: `db.js` (IndexedDB events, localStorage settings, token under `mm.gh.token`), `progress.js` (in-memory log, sync orchestration, export/import, reset-as-event).
- `src/sync/gist.js`: private Gist `moto-master-progress.json`, union-by-UUID, compaction after reset, raw_url host check, canonical JSON.
- `src/ui/`: `app.js` router (`#/`, `#/session`, `#/summary`, `#/stats`, `#/review`, `#/q/<id>`, `#/settings`, `#/certification`, `#/setup/<mode>`, `#/sheet`, `#pair=`), `home.js` (hero next action, progress card, 7 practice tests, sections), `session.js` (question screen + summary), `modes.js` (SECTIONS/MODE_LIST/modeMeta), `stats.js`, `review.js`, `settings.js`, `certification.js`, `setup.js`, `sheet.js`, `fx.js` (sounds/haptics/confetti/theme/praise), `dom.js`, `styles.css`, `vendor/` (qrcode-generator, jsQR).
- `tools/`: `build.js` (version stamp + precache), `serve.js` (local server), `build_data.py` (rebuilds questions.json from `work/` — needs the photos), `sw.template.js`.
- `tests/unit/*.test.js`, `tests/e2e/*.spec.js` (+ `helpers.js` with `makeFakeGithub()` mock of the Gist API), `tests/integration/gist_roundtrip.mjs` (real Gist, needs `MM_TEST_TOKEN=$(gh auth token)`; deletes its test gist).

### Rules of the game (unchanged since spec; see DECISIONS D-012, D-028, D-029)
- Levels 0–5; promotion = correct + shuffled + ≤15 s + ≥8 h after last promotion; level 5 needs ≥3 distinct days. Wrong → −2 (Δύσκολο τεστ / hard setting → 0), enters «τα λάθη σου», exits after 3 correct on 3 days. «Σίγουρη» = seen ≥10, ≥90 %, last 5 correct, median ≤6 s. «Εμπέδωση» = level 5 + σίγουρη, booklet only.
- Readiness (5 gates): Εμπέδωση 100 % · 5 consecutive 10/10 timed simulations on ≥3 days · one «Όλο το βιβλίο» with 0 wrong · «Μέχρι το πρώτο λάθος» ≥60 · 3 perfect «Σκληρές προσομοιώσεις» (10 Q / 5′ / 0 wrong).
- Exam format used: 10 Q, ≤1 wrong, 10 min (official is 15 min; stricter kept, D-006).
- Confidence prompt («Το ξέρω / Μαντεύω») REMOVED in v1.2.1; historical `cf:'sure'` events still reduce as before.
- Daily goal (default 40, Settings) + streak: a day counts when the goal is reached OR «Σήμερα» is completed (`x.goalReached` on session events).

### Modes (home sections)
Εξετάσεις: Προσομοίωση εξετάσεων, Σκληρή προσομοίωση · Επανάληψη: Σήμερα, Επανάληψη λαθών, Οι πιο δύσκολες, Αύριο εξετάσεις · Εξάσκηση: Έξυπνο τεστ, Ελεύθερη εξάσκηση, Αριθμοί & όρια, Μαραθώνιος, Όλο το βιβλίο, Όλο το βιβλίο + εκτός ύλης, Από μνήμης, Μόνο σήματα (empty: the booklet has no picture questions) · Σκληρά τεστ: Δύσκολο τεστ, Ερωτήσεις-παγίδες, Κόντρα στον χρόνο, Μέχρι το πρώτο λάθος · plus Τεστ εξάσκησης 1–7 (fixed 20-question sets, pass at 100 %), «Συνέχισε προς τον στόχο» hero, and Σκονάκι (`#/sheet`).

---

## §2 — Open threads / ideas not yet done (owner has NOT asked for these — offer, don't assume)
1. **Push reminders** are impossible from a static PWA; a phone alarm is the substitute (told the owner).
2. Ministry consultation text (opengov Άρθρο 7) was reported by one researcher as "2 wrong / 25 min" for Ερωτηματολόγιο 2 — contradicts the ΥΑ text we used (10 Q / ≤1 wrong / 15 min). Unverified; the app is stricter than both anyway. Could be re-checked if the owner cares.
3. The 13 PDF-only questions (22, 101, 122, 125, 131, 146, 147, 148, 155, 156, 159, 162, 163) sit in `work/recovery/recovered.json`; adding them needs an owner decision (single official source).
4. Generated explanations (`explanation` field) were never reviewed by the 3-agent consensus process; question texts must stay verbatim, but explanations could get the same treatment.
5. Lighthouse: no PWA category in v12+; perf ~81 locally (LCP dominated by module chain). Fine for a personal app.
6. Practice-test partition uses seed 20260915; changing the booklet or the seed re-shuffles the sets (best scores are keyed by set index — keep the seed).

## §3 — Gotchas learned the hard way
- Heredocs with Greek + `${}` in Bash on this machine sometimes break ("unexpected EOF"); write patch scripts to a file with the Write tool and run them with Python.
- Python `open(...,'w')` on Windows writes CRLF; pass `newline='\n'`. Git normalises anyway (`.gitattributes` = LF).
- `node --test tests/unit/` does not glob on Node 24 → the npm script uses `"tests/unit/*.test.js"`.
- After adding any `src/` module: add it to the `modulepreload` list in `index.html` AND run `node tools/build.js` or offline mode breaks (precache).
- Playwright e2e blocks service workers by default (`serviceWorkers: 'block'`); offline/pwa specs opt back in.
- The only stop this project ever hit was the GitHub device login; it is done. Don't poll for hours again — one ntfy, then stop.

## §4 — Owner profile (for tone and decisions)
Kostas, Greek, holds category B (code 121), preparing for the category A theory exam (Ερωτηματολόγιο 2); exam date set in the app (~8 days from 2026-09-15). Wants: harsh training, honest numbers, natural Greek (rejects calques hard), progress visible from day one, nothing that resets his data. Prefers autonomous execution with decisions recorded; will interrupt if something looks wrong. Communicates in English, app in Greek.

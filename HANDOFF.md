# MOTO MASTER — HANDOFF / SAVE / SUMMON (updated 2026-10-07, v1.9.0)

> **Update 2026-10-07 — save point after v1.9.0:** everything committed and pushed; working clone and mirror (`C:\moto_master`) on the same commit; live site serves 1.9.0. No open work in progress.

> **Update 2026-10-07 — v1.9.0:** «Ώρα εξετάσεων» setting next to the date (synced `examTime`, default 09:00); the pass chance is computed for that moment (D-042). Validation: 232 unit + 43 e2e.

> **Update 2026-10-07 — save point after v1.8.0:** this file was rewritten end to end (§0–§4 describe the current state). Added `tools/replay_check.mjs` (progress-safety check before any dataset change) and `tools/calibrate.mjs` (calibration + feasibility of the pass-chance model on the real log). Both clones synced to the same commit.

> **Update 2026-10-07 — v1.8.0:** Pass chance is now a strict, calibrated memory model evaluated at the exam moment (09:00 on the exam date) with a 0,5 %/2 % slip floor and a "no question below 97 %" rule (D-041). Validation: 231 unit + 43 e2e.

> **Update 2026-10-07 — v1.7.0:** DMV-Genie-style «Πρόγραμμα» (6 stages, one «Επόμενο» button) with stricter rules (practice tests end at the first mistake, hard simulator stops at the first mistake, ready at ≥ 99,5 %), «Επιπλέον γύρος» after the day's plan (hero, final-stretch card, every results screen), pass chance before → after (D-038…D-040). Home order: Τελική ευθεία → Πρόγραμμα → daily plan. No dataset change.

> **Update 2026-10-07 — v1.6.0:** Exam-faithful release (D-032…D-037). Official Ministry database (`ExerBase.mdb`) confirms the live bank = the 140 booklet questions, 10 groups, one question per group, 15′. Added: exam wording (`q.exam`) for 9 questions, group-based 15′ simulation with hidden ids, skip and «Πρακτικό», «Τελικός έλεγχος», «Τελική ευθεία» home card, modes twins/proof/morning, `#/cards`, 31 reviewed explanations, look-alike sets (`q.twins`). Data patch: `python tools/patch_data_v16.py` (idempotent; run after `build_data.py`). Owner's real Gist log replayed through old/new datasets: identical.

> **Update 2026-10-05 — v1.5.0:** PC/iPhone sync of exam date, tentative flag, archive option, manual daily goal and hard mode (D-031) via `moto-master-settings.json` in the same secret Gist. Account setup/pairing is a separate user step; never infer it is complete from deployment.

> **Update 2026-10-05 — v1.4.0:** Exam-date daily planner (D-030). The owner explicitly requested a personal reset on 2026-10-05 (done; do not repeat).

> **How to resume:** open Claude Code in any folder and paste the block in §0. It contains everything the next session needs. Everything else in this file is the detailed state it will read from disk.

---

## §0 — SUMMON BLOCK (paste this verbatim into a new session)

```
Resume the MOTO MASTER project. Read HANDOFF.md first, then DECISIONS.md (newest first: D-041 … D-001) and AUDIT.md, before touching anything.

Facts you must not re-derive:
- Working clone: C:\Users\kgkit\Documents\Codex\2026-09-20\rea\work\moto-master (git, branch main, pushed). Mirror: C:\moto_master (same repo; also holds the booklet photos `question pictures\` and the research folder `work\`) — after pushing from the working clone, run `git -C C:\moto_master pull --ff-only`.
- Live PWA: https://kgkitzias-a11y.github.io/moto-master/ (GitHub Pages from main root, repo kgkitzias-a11y/moto-master). Current version 1.9.0.
- gh CLI is logged in on this PC as kgkitzias-a11y (binary: %LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe — not on PATH in Git Bash; use the full path; in Git Bash write `gh api gists/...` without a leading slash). Never start a device-login loop; if auth is lost, send ONE ntfy and stop.
- Notify me via: curl -s -H "Title: Moto Master" -d "<msg>" https://ntfy.sh/moto-master-kgk-9x4tq2 — only at blocking points and completion.
- The exam bank is settled: the Ministry's ExerBase.mdb (docs/official/exerbase_moto_el.json) has exactly the 140 booklet questions active, 10 official groups, one question per group, 15 min, ≤1 wrong. The 19 «εκτός ύλης» are NOT in the exam. Booklet photos re-verified 140/140 on 2026-10-07.
- data/questions.json contract: booklet `text`/`options`/`correct` stay verbatim from the photos; the exam computer's wording lives beside it in `q.exam` (index-aligned), plus `group`, `twins`, reviewed `explanation`. Never change ids, option order or answer keys. Regenerate with `python tools/build_data.py` (needs C:\moto_master\work) then `python tools/patch_data_v16.py`.
- My progress lives ONLY in my devices + my private Gist (never in the repo; never write the Gist id into the repo). Any change must keep the event log and the reducer backward-compatible (append-only; old events must reduce identically). Before deploying a dataset change, download the log into the git-ignored work/ folder, run `node tools/replay_check.mjs work/p.json <old questions.json> 2026-10-12`, require "RESULT: progress maps 1:1", then delete the copy.
- Greek UI copy follows docs/GLOSSARY.json (D-027 + v1.6/v1.7 additions). Reuse those terms; never reintroduce calques (προαγωγή, κουτί λαθών, συνεδρία, ώριμη, Mastery…).
- Workflow: edit → `node tools/build.js X.Y.Z` (version + service-worker precache; ALWAYS after adding a module, and add it to index.html modulepreload) → `npm test` (232 unit) → `npx playwright test` (43 e2e; starts `node tools/serve.js 8123` itself) → commit (author Kostas Kitzias <kgkitzias@gmail.com> is set in the working clone; add the attribution trailer) → `git push` → poll https://kgkitzias-a11y.github.io/moto-master/src/version.js until it shows the new version → pull the mirror.
- Decide reversible/technical things yourself and record them in DECISIONS.md (next id D-043). Ask me only for money/publish-irreversible/taste decisions; for larger feature sets, show me a numbered proposal list first.

Then tell me in 5 lines what state the project is in and ask what I want next.
```

---

## §1 — What exists (verified 2026-10-07, v1.9.0)

| Item | State |
|---|---|
| Live URL | https://kgkitzias-a11y.github.io/moto-master/ — v1.9.0, service worker active at that scope |
| Repo | https://github.com/kgkitzias-a11y/moto-master — main, clean; both local clones on the same commit |
| Dataset | `data/questions.json`: 140 booklet (tier `booklet`, verbatim from the 19 photos, answer key 140/140) + 19 `archive` («εκτός ύλης», off by default, not in the exam). v1.6 patch adds `group` (1–10), `exam` wording for Q16, 42, 44, 77, 127, 145, 158, 169, 170, `twins` (12 look-alike sets), 31 reviewed explanations, `sources.official`. |
| Official source | `docs/official/exerbase_moto_el.json` = Ερωτηματολόγιο 2 (Greek) extracted from https://www.yme.gr/uploads/mstheyo/ExerBase.zip (sha256 f95c9b67…9721, mdb 2009-05-27). 145 rows, 5 retired (`pag -55`: old 7/31/55 values, deleted 18/79). Read with `pip install access-parser`; Greek strings starting with digits need (byte, 0x03) → U+03xx re-pairing. |
| Audit | `AUDIT.md` §1–§11, `DECISIONS.md` D-001…D-041, `docs/GLOSSARY.json` |
| Tests | `npm test` → 232 pass; `npx playwright test` → 43 pass (2026-10-07) |
| Tools | `build.js`, `serve.js`, `build_data.py`, `patch_data_v16.py`, `replay_check.mjs`, `calibrate.mjs`, `sw.template.js` |
| Owner's progress | PC + iPhone + private Gist (`moto-master-progress.json` + `moto-master-settings.json`). On 2026-10-07: 351 events, 338 answers on 130 questions since the 2026-10-05 reset; exam date 2026-10-12 (tentative), «εκτός ύλης» off, daily goal 50. Never assume it is empty; never copy it into the repo. |

### Architecture (vanilla ES modules, no build step, no CDN)
- `index.html` (CSP meta, modulepreload list — add new modules there too), `sw.js` (generated by `tools/build.js` from `tools/sw.template.js`), `manifest.webmanifest`, `icons/`.
- `src/engine/`: `constants.js` (RULES + MODES), `reducer.js` (events → state, deterministic, sorted by (t,id); unchanged since v1.0 semantics), `session.js` (PRESETS per mode, `buildQueue`, exam wording `_view`, `skip()`, «Πρακτικό» sheet in `summary()`), `selection.js` (queue policies incl. `examByGroups`, `twins`, `proof`, `morning`, `grind`), `chance.js` (memory model, `examMoment`, `passChance`, `readinessNumbers`, `isProven`), `planner.js` (exam-date quotas), `events.js` (sanitizer), `shuffle.js`, `time.js`.
- `src/store/`: `db.js` (IndexedDB events, localStorage settings `mm.settings`, token `mm.gh.token`), `progress.js` (log, sync orchestration, export/import, reset-as-event, shared preferences).
- `src/sync/`: `gist.js` (secret Gist, union-by-UUID, compaction after reset), `preferences.js` (per-field merge of shared settings: examDate, examTime, examTentative, includeArchive, dailyGoal, hardMode).
- `src/ui/`: `app.js` router (`#/`, `#/session`, `#/summary`, `#/stats`, `#/review`, `#/q/<id>`, `#/settings`, `#/certification`, `#/setup/<mode>`, `#/sheet`, `#/cards`, `#pair=`), `final.js` («Τελική ευθεία» + `fmtChance`/`momentLabel`), `program.js` (Genie-style «Πρόγραμμα», `mistakesToClear`), `home.js`, `session.js` (question screen, dots, skip, summary, alt wording, twin note), `cards.js`, `modes.js`, `stats.js` (group table), `review.js`, `settings.js`, `certification.js` (pass chance card + model explanation, final check), `setup.js`, `sheet.js`, `planner.js`, `fx.js`, `dom.js`, `styles.css`, `vendor/`.
- `tests/unit/*.test.js` (incl. `v16.test.js` for groups, wording, model, skip, grind), `tests/e2e/*.spec.js` (incl. `v16.spec.js`; `helpers.js` reads hidden ids with `waitFor({ state: 'attached' })`), `tests/integration/gist_roundtrip.mjs`.

### Rules of the game (D-012, D-028, D-029, D-032…D-041)
- Levels 0–5; promotion = correct + shuffled + ≤15 s + ≥8 h after last promotion; level 5 needs ≥3 distinct days. Wrong → −2 (hard → 0), enters «τα λάθη σου», exits after 3 correct on 3 days. «Σίγουρη» = seen ≥10, ≥90 %, last 5 correct, median ≤6 s. «Εμπέδωση» = level 5 + σίγουρη, booklet only.
- Readiness gate (5 gates, unchanged): Εμπέδωση 100 % · 5 consecutive 10/10 timed simulations on ≥3 days · one «Όλο το βιβλίο» with 0 wrong · «Μέχρι το πρώτο λάθος» ≥60 · 3 perfect «Σκληρές προσομοιώσεις».
- Pass chance (D-041, D-042): simplified FSRS memory model at the exam moment (exam date at the «Ώρα εξετάσεων» setting, default 09:00; no more study); slip 0,5 % (2 % look-alikes); unseen/forgotten = 1/options; one question per group, P(≤1 wrong). **Έτοιμος = ≥ 99,5 % and no booklet question < 97 %.** Calibrated cautious on the owner's answers (`tools/calibrate.mjs`).
- Exam simulation: 10 questions (one per group), 15′, exam wording, hidden id/category, «Παράλειψη» (to the back), no feedback until «Πρακτικό». Hard simulation: 5′, 0 wrong, stops at the first mistake.
- Practice tests 1–7 (seed 20260915, sets of 20): pass only 20/20; the first mistake ends the test.
- «Τελικός έλεγχος»: last real answer right within 48 h and ≤15″, twice in a row if ever missed.
- Confidence prompt removed (v1.2.1); historical `cf:'sure'` events still reduce as before.
- Daily goal / planner: exam-date quotas (new + reviews); streak day = goal reached or «Σήμερα» completed.

### Home layout (top to bottom)
«Τελική ευθεία» (phase by days left: daily steps / eve / exam day; pass chance at the exam + now + weakest; «Τελικός έλεγχος» count; «Επιπλέον γύρος ▶») → «Πρόγραμμα» (6 stages: Τεστ 1–3, Τεστ 4–7, Μαραθώνιος χωρίς λάθος, 3×10/10 στη σειρά, λάθη καθαρά ×2, έτοιμος; one «Επόμενο ▶») → daily-plan hero → plan controls (exam date + «Ώρα εξετάσεων» + tentative) → progress → 5-gate readiness → mode sections (Εξετάσεις · Επανάληψη incl. Τελικός έλεγχος, Πρωί των εξετάσεων, Επιπλέον γύρος · Εξάσκηση · Σκληρά τεστ incl. Δίδυμες ερωτήσεις) → Κάρτες, Σκονάκι.

---

## §2 — Open threads / ideas not yet done (owner has NOT asked for these — offer, don't assume)
1. **Push reminders** are impossible from a static PWA; a phone alarm is the substitute.
2. ~~Exam time field~~ — done in v1.9.0 (D-042).
3. **Audio questions:** the exam offers Greek audio; the ministry's `SoundTestDrive.7z` (1.1 GB) was not downloaded.
4. **New ΜΣΘΕΥΟ** (ITE pilot in Heraklion, 2026) may later change the bank; re-run the ExerBase/drivepoint comparison if the ministry publishes new files.
5. `C:\moto_master\work\pages\photo03_L/_R.png` are upside down/swapped (wrong rotation in its manifest); the dataset was not affected.
6. Practice-test partition uses seed 20260915; changing the booklet or the seed re-shuffles the sets (best scores are keyed by set index — keep the seed).
7. Lighthouse: no PWA category in v12+; perf ~81 locally. Fine for a personal app.

## §3 — Gotchas learned the hard way
- Heredocs with Greek + `${}` in Bash break ("unexpected EOF"); write patch scripts to a file with the Write tool and run them with Python. Use `PYTHONIOENCODING=utf-8` and Windows paths (`C:/...`, not `/c/...`) for Python.
- Python `open(...,'w')` on Windows writes CRLF; pass `newline='\n'`. Git normalises anyway (`.gitattributes` = LF).
- Long paths (≥ ~250 chars) break `git clone`, curl `-o` and the Access OLE DB driver; use short folders (and `git -c core.longpaths=true`).
- `node --test tests/unit/` does not glob on Node 24 → the npm script uses `"tests/unit/*.test.js"`.
- After adding any `src/` module: add it to `modulepreload` in `index.html` AND run `node tools/build.js`, or offline mode breaks.
- Playwright blocks service workers by default; offline/pwa specs opt back in. In a manual preview, the service worker serves stale modules after edits — unregister it and clear caches before reloading.
- Exam-simulation question ids are hidden (`hidden` attribute); e2e helpers must wait for `attached`, not `visible`, and must wait for the next screen (`ερώτηση N/10`) between answers.
- The built-in browser preview uses a `.claude/launch.json` (git-excluded via `.git/info/exclude`).
- `<input type="time">` shows 12 h ("09:00 AM") in an en-US browser and 24 h on a Greek iPhone; the stored value is always 'HH:MM' 24 h. Keep its grid column ≥ 140 px so the AM/PM suffix is not clipped.
- Never put the owner's progress or the Gist id in the repo (it is public, and a secret Gist is readable by anyone with its id).

## §4 — Owner profile (for tone and decisions)
Kostas, Greek, holds category B (code 121), preparing for the category A theory exam (Ερωτηματολόγιο 2, «τα σήματα»); exam tentatively Monday 2026-10-12. Wants: near-certainty of passing, harsh training (stricter than DMV Genie), honest numbers, natural Greek (rejects calques hard), nothing that resets their data. Works by asking for a numbered proposal list, approving items, then expecting thorough autonomous execution with every available tool; will interrupt if something looks wrong. Communicates in English, app in Greek.

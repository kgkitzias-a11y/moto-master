# AUDIT.md — Moto Master dataset audit (2026-09-14)

Ground truth = the driving-school booklet photographed in `question pictures/` (19 photos, sha256 list in `data/photos_manifest.json`). Everything below is reproducible from `work/` (git-ignored) with `python tools/build_data.py`.

## 1. Counts

| Item | Count |
|---|---|
| Photos | 19 (1 single page, 17 two-page spreads, 1 spread with the answer-key table) |
| Booklet question ids present (tier `booklet`) | **140** |
| Answer-key table ids ("ΣΩΣΤΕΣ ΑΠΑΝΤΗΣΕΙΣ ΜΟΤΟΣΥΚΛΕΤΙΣΤΩΝ") | 140 — identical set to the pages |
| Ids absent from the booklet (of 1–172) | **32** |
| Recovered from ≥2 independent public sources (tier `archive`) | **19** |
| Unrecovered (only the official PDF carries them) | **13** — not shipped |
| Questions in `data/questions.json` | 159 (140 + 19) |
| Questions with a picture | **0** (see §6) |
| Option counts (booklet) | 3 options: 96 · 4 options: 41 · 5 options: 3 |

The spec expected "~139 present / ~33 missing"; the booklet itself has 140 / 32 (the old app marks Q107 inactive, the booklet prints it — see §4).

## 2. Missing ids

`4, 13, 14, 18, 22, 28, 39, 40, 43, 64, 79, 84, 93, 99, 101, 122, 125, 126, 130, 131, 137, 143, 146, 147, 148, 155, 156, 159, 162, 163, 166, 167`

They are numbering gaps on the printed pages (blank space or direct jump, no cut-off) and are also skipped in the key table — except 18 and 79, where the key table has an empty cell in their slot.

## 3. Transcription protocol and results

- Every half page transcribed twice by independent vision passes (A/B); `work/transcribe/diff_passes.py` diffed 140 questions × text/options/mark/image → **5 discrepancies**, all resolved by a third pass re-reading the photo at 3–4× zoom, plus 2 items re-read by the maintainer:

| Id | Field | Pass A | Pass B | Resolution (printed) |
|---|---|---|---|---|
| 16 | text + α | σφικτό | σφιχτό | **σφιχτό** (χ with descender, both occurrences) |
| 48 | γ | τροχό | τρόχο | **τρόχο** — printed misspelling kept verbatim |
| 95 | δ | απ’ | απ' | **απ’** (typographic apostrophe); "180°" normalised from a superscript-zero glyph |
| 145 | mark | β | α | **β** (page tilted; deskewed crop puts the tick in the β cell; key table also β) |
| 42 | γ | πρόθεσή | πρόθεσή | **προθεσή** — booklet prints the misplaced tonos; both passes had silently corrected it |
| 158 | text | δείξετε | δείξετε | **δείξατε** — top-of-page blur; 4× crop reads α, official PDF and 6 school mirrors print δείξατε |

- Lowest-confidence transcriptions (all verified on zoom crops, no residual doubt): ids 16, 96, 106, 114, 123, 135, 145, 158, 171 (0.90–0.94).
- Kept verbatim oddities: "Μια"/"μια"/"δυο"/"Ποιον" printed without tonos; Q20 β "90 km/h" and Q47 γ "70 km/h" without trailing period; Q170 γ "πράγματά" (double accent); Q144 ends with ";" ; Q123 has «συρθεί» in guillemets; Q145 α «Μαλακό» in guillemets. Line-end hyphenations were rejoined.
- Answer-key table: two independent passes → **100 % agreement**, 140 cells, no doubtful cell.

## 4. ✓-mark vs answer-key table

**0 conflicts.** Every handwritten ✓ on the pages matches the key table letter (140/140). Q145 needed the deskew check (§3) and then matched. The key table is the recorded authority (`sources.key`); the tick is recorded in `sources.mark`.

## 5. Third cross-check — old app bundle

`https://moto-master-gr.dinos94.chatgpt.site/` embeds 172 questions in its JS bundle (139 active / 33 inactive; the inactive set = our 32 missing + Q107, which the booklet does print).

- Correct answers: **0 disagreements** on the 140 shared ids.
- Wording: 13 differences → 7 turned out to be defects of the old app's source (it is a scrape of the 2006 ministry PDF, reproducing its Latin look-alike glyphs, misplaced tonos and the truncated Q128) and 4 are **edition changes** where the booklet is newer: Q7 β 70→**80 km/h**, Q31 γ 120→**130 km/h**, Q55 β 70→**80 km/h** (the correct-answer value changed, the letter did not), Q44 γ πτώσεως→**ανάγκης**. Current driving-school banks agree with the booklet on the speed values. Booklet wins every conflict.

## 6. Pictures

No question in the booklet contains a sign, photo or diagram (both passes, all 140 questions: `has_image=false`). Therefore `data/img/` is empty, every `image` is `null`, and the "Μόνο πινακίδες" mode is shown disabled with an explanatory toast. No official/public-domain graphics were substituted (nothing to substitute).

## 7. Recovery of missing ids (tier `archive`)

Rule applied strictly: wording **and** full option set must match across ≥2 *independent* sources. The official ministry PDF (`https://www.yme.gr/pdf/BOOK_MOTOSIKLETES.pdf`, sha256 f848…ec3d, questions 1–172) is source #1; independent driving-school mirrors are #2+. The old app is **not** independent (171/172 questions byte-identical to the PDF text layer) and was not counted.

Recovered (19): `4β, 13α, 14γ, 18γ, 28β, 39β, 40γ, 43α, 64α, 79α, 84γ, 93α, 99β, 126β, 130α, 137α, 143γ, 166β, 167δ` — sources per question are stored in `sources.archive[]` (yme.gr PDF + epitrohonlefkada.gr / sotirioun.gr; Q79 also drivepoint.gr, spyrospapadimitriou.gr, farfaras.gr, stoumposdrive.gr). No correct-answer disagreement between matching sources. Stored wording = the PDF's, with two Latin-glyph fixes recorded in the recovery notes.

Unrecovered (13): `22, 101, 122, 125, 131, 146, 147, 148, 155, 156, 159, 162, 163` — only the official PDF carries them; no school mirror does (they appear retired from the live bank). Not shipped. Their PDF text is preserved in `work/recovery/recovered.json` should the owner accept a single official source.

Archive questions are excluded from every mode by default (Settings toggle), never count toward mastery/readiness, and are labelled "αρχείο" in the UI.

## 8. Generated fields

- `category`: one of 10 fixed Greek labels assigned per question by a language-model pass (not from the old app).
- `explanation`: 1–2 Greek sentences generated to justify the booklet's marked answer, grounded in ΚΟΚ / the ministry manual. Marked `explanation_generated: true`; it never alters the answer. Four questions carry a model "doubt" note about real-world nuance (Q11 fresh asphalt, Q28 waiting position at a red light, Q64 flashing yellow priority, Q134 reflective clothing) — answers left exactly as the booklet/PDF marks them; the explanations support the marked option.
- `similar`: top-3 TF-IDF cosine neighbours (threshold 0.18) over text+options, computed at build time.

## 9. Exam format (Phase 1.8)

Official: ΥΑ 50984/7947/2013 (Β' 3056) άρθ. 22, as replaced by ΥΑ Δ30/Α3/71830/2024 (Β' 1737), unchanged in the 2025 codification (ΥΑ 12668/2025 Β' 554, 89623/2025 Β' 2892): for ΑΜ/Α1/Α2/Α the candidate answers **Ερωτηματολόγιο 2 (μοτοσικλέτες)** — **10 questions**, pass with **at most 1 wrong**, **15 minutes**, on the ΜΣΘΕΥΟ computer system with a random questionnaire per candidate. A B-licence holder (code 121) is exempt only from Ερωτηματολόγιο 1. The school's "10 questions / max 1 wrong" matches; its **10-minute** timer is stricter than the official 15 and is what the app uses (D-006). Unverified: the exact size of the live ΜΣΘΕΥΟ bank (the 2006 book has 172; school mirrors carry 142–150).

## 10. Files

- `data/questions.json` — 159 questions (`id, tier, text, options[], correct, image, image_source, category, explanation, explanation_generated, similar[], sources{photo,page,key,mark | archive[]}`), plus `meta`.
- `data/photos_manifest.json` — the 19 photo filenames, sizes and sha256.
- `work/` (git-ignored): normalised pages, both transcription passes, the diff, the third-pass verdicts, the recovery report with the full PDF parse, the exam-format research.

## 11. Re-check 2026-10-07 (v1.6)

**Photos vs app.** The 19 booklet photos were re-read blind by five independent passes (transcribe first, then compare character by character, zoomed crops at every difference). Result: **140/140 questions identical** in text, options, order and ticked answer; answer-key table 140/140 = app `correct`; ids 18 and 79 are empty key cells. Only cosmetic print quirks (Q19 stray tonos, Q31/Q138 double spaces, Q95 superscript zero). Note: `work/pages/photo03_L/_R.png` are upside down and swapped (wrong rotation in `work/pages/manifest.json`); the dataset was not affected.

**Official exam database.** `ExerBase.mdb` (TestDrive, yme.gr, 2009-05-27), Ερωτηματολόγιο 2, Greek: 145 questions, 5 retired (old Q7, Q31, Q55 with 70/120/70 km/h; deleted Q18, Q79). Active 140 = booklet ids exactly; answer keys 140/140; option order 140/140. Groups 1–10 sizes 15/13/13/14/14/15/15/14/15/12; exam = one per group, 15′. Wording differences (stored as `q.exam`): Q44, Q77, Q145, Q169, Q170 (meaningful), Q16, Q42, Q127, Q158 (spelling/punctuation). Q1 «To» and Q95 «180ο» are text-layer glyph artefacts and were ignored.

**Driving-school mirrors** (drivepoint re-fetched 2026-10-07: same 142 questions as on 2026-09-14) still carry the deleted Q18/Q79 and, on some sites, the pre-2009 speed values; the Ministry database and the booklet agree with each other, not with those copies.

**Explanations.** All 159 read; 31 replaced (`tools/data/explanations_v16.json`). No explanation argued for a wrong option.

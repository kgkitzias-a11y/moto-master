# Moto Master

**Live:** https://__GH_USER__.github.io/moto-master/

Προπονητής θεωρίας για τη μοτοσυκλέτα (κατηγορία Α, κάτοχος Β με κωδικό 121). Vanilla HTML/CSS/JS PWA, Greek UI, χωρίς build step και χωρίς CDN. Η πρόοδος συγχρονίζεται PC ↔ iPhone μέσω ενός ιδιωτικού GitHub Gist.

## 1. Εγκατάσταση

**iPhone:** Safari → άνοιξε το URL → Μοιραστείτε (Share) → **Προσθήκη στην οθόνη Αφετηρίας**. Από εκεί και πέρα άνοιγε **ΜΟΝΟ** το εικονίδιο της οθόνης Αφετηρίας — το Safari και η εγκατεστημένη εφαρμογή **δεν** μοιράζονται αποθήκευση, οπότε ό,τι κάνεις στο Safari δεν φαίνεται στην εφαρμογή και αντίστροφα. Μετά: Ρυθμίσεις → επικόλλησε το token **ή** «Σάρωση QR» από το PC.

**PC:** Chrome/Edge → άνοιξε το URL → «Εγκατάσταση» όταν προταθεί (εικονίδιο στη γραμμή διεύθυνσης). Λειτουργεί και χωρίς εγκατάσταση.

## 2. Token για συγχρονισμό (μία φορά)

1. https://github.com/settings/tokens/new (Tokens **classic**).
2. Note: `moto-master` · Expiration: **No expiration** (ή 1 έτος — μετά τη λήξη επικολλάς νέο).
3. Τσέκαρε **μόνο** το scope **`gist`**. Τίποτα άλλο.
4. Generate token → αντίγραψέ το (`ghp_…`).
5. Στην εφαρμογή: Ρυθμίσεις → GitHub token → «Αποθήκευση & συγχρονισμός». Η εφαρμογή βρίσκει ή δημιουργεί ένα **secret** gist `moto-master-progress.json` και θυμάται το id του.
6. Δεύτερη συσκευή: είτε επικόλλησε το ίδιο token, είτε στο PC Ρυθμίσεις → «Εμφάνιση QR σύζευξης» και στο iPhone (μέσα στην εγκατεστημένη εφαρμογή) Ρυθμίσεις → «Σάρωση QR» (ή επικόλληση του κωδικού σύζευξης).

Γιατί classic και όχι fine-grained: τα fine-grained tokens τεκμηριώνονται μόνο για εγγραφή gist (POST/PATCH/DELETE), όχι για `GET /gists` που χρειάζεται το find-or-create — βλ. `DECISIONS.md` D-013. Το token μένει μόνο στο localStorage της συσκευής· δεν μπαίνει ποτέ στο repo, σε exports ή σε logs.

Συγχρονισμός: στο άνοιγμα, στο τέλος κάθε συνεδρίας, όταν η εφαρμογή πάει στο παρασκήνιο, και κάθε 60″ όσο υπάρχουν αλλαγές. Η πρόοδος είναι append-only ημερολόγιο γεγονότων (UUID ανά γεγονός)· η συγχώνευση είναι ένωση κατά UUID, οπότε δύο συσκευές μπορούν να προπονούνται ανεξάρτητα και συγκλίνουν — δεν υπάρχει «last write wins».

## 3. Έλεγχος δεδομένων (AUDIT)

Βλ. `AUDIT.md` για τον πλήρη έλεγχο. Περίληψη:

__AUDIT_SUMMARY__

## 4. Μορφή εξέτασης

__EXAM_FORMAT__

## 5. Δομή

| Τι | Πού |
|---|---|
| Repo root | `C:\moto_master` |
| Εφαρμογή | `index.html`, `src/` (`engine/` κανόνες & session, `store/` IndexedDB/localStorage, `sync/` Gist, `ui/` οθόνες, `vendor/` QR libs), `sw.js`, `manifest.webmanifest`, `icons/` |
| Δεδομένα | `data/questions.json`, `data/photos_manifest.json`, `data/img/` |
| Έλεγχος | `AUDIT.md`, `DECISIONS.md` |
| Tests | `tests/unit/` (`npm test`), `tests/e2e/` (`npm run test:e2e`), `tools/` (build, serve, data) |
| Φωτογραφίες βιβλίου | `question pictures/` — **εκτός repo** (.gitignore), μόνο hashes στο manifest |

## 6. Ανάπτυξη

```
npm test                 # engine + dataset unit tests (node --test)
npm run test:e2e         # Playwright (χρειάζεται npx playwright install chromium)
node tools/build.js X.Y.Z   # σφραγίζει έκδοση σε src/version.js + sw.js, ξαναγράφει precache
python tools/build_data.py  # ξαναχτίζει data/questions.json από work/ (χρειάζεται τις φωτογραφίες)
node tools/serve.js 8123    # τοπικός server
```

## 7. Κανόνες mastery (σκόπιμα σκληροί)

- Επίπεδο 0–5 ανά ερώτηση. Προαγωγή = σωστή απάντηση ≥8 ώρες μετά την προηγούμενη προαγωγή, με ανακατεμένες επιλογές, μέσα σε 15″. Το επίπεδο 5 απαιτεί προαγωγές σε ≥3 διαφορετικές μέρες.
- Λάθος → επίπεδο −2 και μπαίνει στο **κουτί λαθών**· βγαίνει μετά από 3 σωστές σε 3 διαφορετικές μέρες. Hard Mode: λάθος → 0. Λάθος ενώ δήλωσες «Σίγουρος» → 0.
- «Σταθερή»: ≥10 εμφανίσεις, ≥90 % ακρίβεια, τελευταίες 5 σωστές, διάμεσος χρόνος ≤6″.
- Mastery % = ποσοστό ερωτήσεων βιβλίου που είναι επίπεδο 5 **και** σταθερές.
- Έτοιμος για εξετάσεις μόνο όταν: Mastery 100 % **και** 5 συνεχόμενα 10/10 χρονομετρημένα mock σε ≥3 μέρες **και** ένα Gauntlet βιβλίου με 0 λάθη **και** Sudden Death σερί ≥60.

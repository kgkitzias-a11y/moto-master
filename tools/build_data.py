"""Builds data/questions.json from work/booklet_merged.json + work/recovery/recovered.json + work/annotations.json.
Adds category, explanation (generated), similar[] (top-3 text similarity, build time)."""
import json, sys, os, re, unicodedata, hashlib, math, datetime
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(ROOT, 'work')
booklet = json.load(open(os.path.join(W, 'booklet_merged.json'), encoding='utf-8'))
rec_path = os.path.join(W, 'recovery', 'recovered.json')
recovered = json.load(open(rec_path, encoding='utf-8')) if os.path.exists(rec_path) else []
ann_path = os.path.join(W, 'annotations.json')
ann = json.load(open(ann_path, encoding='utf-8')) if os.path.exists(ann_path) else {}

def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
STOP = set('και να το τα η ο οι του της των με σε στο στη στην στον για από που ότι αν όταν ή είναι θα δεν πρέπει μια ένα ποια ποιο τι πως πώς σας μας αυτό αυτή τον την τις τους ως πιο πολύ όχι ναι μπορεί κάνετε είτε'.split())
def tokens(s):
    s = strip_accents(s.lower()); s = re.sub(r'[^a-zα-ω0-9 ]+', ' ', s)
    return [t for t in s.split() if len(t) > 2 and t not in STOP]
def stem(t):
    for suf in ('ουμε','ετε','ουν','εις','ους','ων','ης','ας','ος','ες','οι','ου','ει','α','η','ο','ε','ι','υ'):
        if len(t) - len(suf) >= 3 and t.endswith(suf): return t[:-len(suf)]
    return t

qs = []
for b in booklet:
    q = dict(b); q.pop('has_image', None); qs.append(q)
for r in recovered:
    if r.get('status') != 'recovered': continue
    qs.append({'id': r['id'], 'tier': 'archive', 'text': r['text'], 'options': r['options'], 'correct': r['correct'], 'image': None, 'image_source': None,
               'sources': {'photo': None, 'key': None, 'mark': None, 'archive': [{'name': s['name'], 'match': s.get('match'), 'correct': s.get('correct')} for s in r['sources']]}})
qs.sort(key=lambda q: q['id'])
ids = [q['id'] for q in qs]
assert len(ids) == len(set(ids)), 'duplicate ids'

# tf-idf cosine over question text + options
docs = {q['id']: [stem(t) for t in tokens(q['text'] + ' ' + ' '.join(q['options']))] for q in qs}
df = {}
for d in docs.values():
    for t in set(d): df[t] = df.get(t, 0) + 1
N = len(docs)
vec = {}
for i, d in docs.items():
    tf = {}
    for t in d: tf[t] = tf.get(t, 0) + 1
    v = {t: (1 + math.log(c)) * math.log((N + 1) / (df[t] + 0.5)) for t, c in tf.items()}
    n = math.sqrt(sum(x * x for x in v.values())) or 1
    vec[i] = {t: x / n for t, x in v.items()}
def cos(a, b):
    if len(a) > len(b): a, b = b, a
    return sum(x * b.get(t, 0) for t, x in a.items())
for q in qs:
    sims = sorted(((cos(vec[q['id']], vec[o['id']]), o['id']) for o in qs if o['id'] != q['id']), reverse=True)
    q['similar'] = [i for s, i in sims[:3] if s >= 0.18]
    a = ann.get(str(q['id']), {})
    q['category'] = a.get('category', 'Γενικά')
    q['explanation'] = a.get('explanation', '')
    q['explanation_generated'] = True

photos_dir = os.path.join(ROOT, 'question pictures')
photos = []
for f in sorted(os.listdir(photos_dir)):
    p = os.path.join(photos_dir, f)
    photos.append({'file': f, 'bytes': os.path.getsize(p), 'sha256': hashlib.sha256(open(p, 'rb').read()).hexdigest()})
os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
json.dump({'files': photos, 'count': len(photos), 'note': 'Photos are not part of the repository (git-ignored); hashes prove which files the dataset was built from.'}, open(os.path.join(ROOT, 'data', 'photos_manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

meta = {
    'generated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'booklet': sum(1 for q in qs if q['tier'] == 'booklet'), 'archive': sum(1 for q in qs if q['tier'] == 'archive'),
    'exam': '10 ερωτήσεις · max 1 λάθος · 10 λεπτά (ΥΑ 50984/7947/2013 άρθ. 22: 10 ερωτήσεις, ≤1 λάθος, 15′ — εφαρμόζεται το αυστηρότερο 10′)',
    'source_key': 'ΣΩΣΤΕΣ ΑΠΑΝΤΗΣΕΙΣ ΜΟΤΟΣΥΚΛΕΤΙΣΤΩΝ (booklet answer-key table)',
}
out = {'meta': meta, 'questions': qs}
p = os.path.join(ROOT, 'data', 'questions.json')
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote', p, os.path.getsize(p), 'bytes;', meta['booklet'], 'booklet +', meta['archive'], 'archive; categories:', sorted(set(q['category'] for q in qs)))
print('similar coverage:', sum(1 for q in qs if q['similar']), '/', len(qs))

# v1.6 dataset patch (run after tools/build_data.py; idempotent).
#
# Adds, without touching ids, booklet wording, option order or answer keys:
#   group       official ΜΣΘΕΥΟ group 1–10 (the exam draws one question per group)
#   exam        the exam computer's wording where it differs from the booklet (index-aligned)
#   twins       look-alike questions to drill side by side
#   explanation the reviewed replacements in tools/data/explanations_v16.json
#   sources.official {qcod, group, sound}
#
# Source of truth for groups/wording: the Ministry's ExerBase.mdb (ExerBase.zip from
# https://www.yme.gr/uploads/mstheyo/ExerBase.zip), extracted to docs/official/exerbase_moto_el.json.
# Usage: python tools/patch_data_v16.py
import json, os, re, sys, unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA = os.path.join(ROOT, 'data', 'questions.json')
OFFICIAL = os.path.join(ROOT, 'docs', 'official', 'exerbase_moto_el.json')
EXPLANATIONS = os.path.join(ROOT, 'tools', 'data', 'explanations_v16.json')

# Look-alike sets: same or nearly the same question, different correct answer (or an answer
# that is a wrong option in the other). Reviewed against the answer key.
TWINS = [
    [115, 116, 117, 134],      # visibility: lights / reflective clothes / white helmet; at night lights are a wrong option
    [118, 119],                # touring fairing / fixed windscreen
    [128, 129, 130],           # soft tar: tyre grip / braking; 130 (εκτός ύλης) «ο δρόμος γλιστρά»
    [143, 144],                # surfaces without slip risk: yellow anti-skid marking / dry asphalt
    [169, 170],                # loading: centre of gravity / manufacturer's limit
    [13, 66],                  # group riding: slowest sets the pace / fastest rides last
    [34, 90],                  # blind spots: truck = directly behind / car = mirror blind spots
    [28, 78],                  # waiting at a signal (between cars) / on the open road (not among cars)
    [43, 71],                  # brakes = not by yourself / workshop = the complete option
    [30, 39],                  # up to two main beams / only one dipped beam
    [21, 93],                  # sudden oil patch / slippery stretch you approach
    [3, 20, 7, 47, 55, 31],    # speed limits ≤125 cc and >125 cc
]

LAT = str.maketrans({'A': 'Α', 'B': 'Β', 'E': 'Ε', 'H': 'Η', 'I': 'Ι', 'K': 'Κ', 'M': 'Μ', 'N': 'Ν', 'O': 'Ο', 'P': 'Ρ', 'T': 'Τ',
                     'X': 'Χ', 'Y': 'Υ', 'Z': 'Ζ', 'a': 'α', 'o': 'ο', 'e': 'ε', 'i': 'ι', 'k': 'κ', 'x': 'χ', 'y': 'υ', 'v': 'ν'})
LAT_KEYS = {chr(k) for k in LAT}


def fix_glyphs(s):
    """Latin look-alikes in Greek text → Greek ('To' → 'Το'; units like km/h, cc stay Latin);
    '180ο' → '180°' (the book prints a degree sign)."""
    s = (s or '').replace('180ο', '180°')
    if not re.search(r'[Ͱ-Ͽ]', s):
        return s
    return re.sub(r'[A-Za-z]+', lambda m: m.group(0).translate(LAT) if all(c in LAT_KEYS for c in m.group(0)) else m.group(0), s)


def words(s):
    s = unicodedata.normalize('NFC', s or '')
    return re.sub(r'[^\w°]+', ' ', s).strip().lower()


def main():
    data = json.load(open(DATA, encoding='utf-8'))
    official = json.load(open(OFFICIAL, encoding='utf-8'))
    expl = json.load(open(EXPLANATIONS, encoding='utf-8'))
    qs = {q['id']: q for q in data['questions']}

    active = {}
    for o in official:
        if o['pag'] == '-55':
            continue  # retired in the exam database (old Q7/Q31/Q55 values, deleted Q18 and Q79)
        n = int(re.search(r'\d+', o['book']).group(0))
        active[n] = o
    booklet = sorted(i for i, q in qs.items() if q['tier'] == 'booklet')
    if sorted(active) != booklet:
        sys.exit(f'official active set differs from the booklet: {sorted(set(active) ^ set(booklet))}')

    variants = []
    for n, o in active.items():
        q = qs[n]
        group = int(o['pag'])
        q['group'] = group
        q['sources']['official'] = {'qcod': o['qcod'], 'group': group, 'sound': o['sound']}
        otext = fix_glyphs(o['text'])
        oopts = [fix_glyphs(x['text']) for x in o['options']]
        ocorr = [i for i, x in enumerate(o['options']) if x['correct']]
        if len(oopts) != len(q['options']) or ocorr != [q['correct']]:
            sys.exit(f'Q{n}: option count or answer key differs from the official database')
        differs = words(otext) != words(q['text']) or any(words(a) != words(b) for a, b in zip(oopts, q['options']))
        if differs:
            # Index alignment: every option that is not the reworded one must match in place.
            for i, (a, b) in enumerate(zip(oopts, q['options'])):
                if words(a) != words(b) and i != q['correct'] and len(set(words(a).split()) & set(words(b).split())) < 2:
                    sys.exit(f'Q{n}: option {i} is not index-aligned with the official database')
            q['exam'] = {'text': otext, 'options': oopts}
            variants.append(n)
        else:
            q.pop('exam', None)

    for q in qs.values():
        q.pop('twins', None)
        if q['tier'] != 'booklet':
            q.pop('group', None)
    for grp in TWINS:
        for i in grp:
            if i not in qs:
                sys.exit(f'twin id {i} not in dataset')
        for i in grp:
            q = qs[i]
            q['twins'] = sorted(set(q.get('twins', [])) | {j for j in grp if j != i})

    for sid, row in expl.items():
        qs[int(sid)]['explanation'] = row['explanation']

    meta = data['meta']
    meta['exam'] = ('10 ερωτήσεις (μία από κάθε ομάδα 1–10 του ΜΣΘΕΥΟ) · το πολύ 1 λάθος · 15 λεπτά '
                    '(ΥΑ 50984/7947/2013 άρθ. 22· ExerBase.mdb του Υπουργείου)')
    meta['official'] = {
        'source': 'https://www.yme.gr/uploads/mstheyo/ExerBase.zip',
        'zip_sha256': 'f95c9b678fb7463d33fccfadbfad21a78cf40047828c869e9cf73d05feeb9721',
        'mdb_date': '2009-05-27',
        'active': len(active),
        'groups': {str(g): sum(1 for o in active.values() if int(o['pag']) == g) for g in range(1, 11)},
        'exam_wording': sorted(variants),
    }
    meta['patched'] = 'tools/patch_data_v16.py'
    json.dump(data, open(DATA, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
    print(f'groups set on {len(active)} questions; exam wording on {sorted(variants)}; '
          f'{len(expl)} explanations replaced; {len(TWINS)} twin sets')


if __name__ == '__main__':
    main()

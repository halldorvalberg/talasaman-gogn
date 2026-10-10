#!/usr/bin/env python3
"""Refresh data/summary-groups.json: the summaries grouped by what was said.

Our own take on talasaman.is/samantektir/afstada, using sentence embeddings and
classic statistics only (no text-generating models, no APIs):

1. Fetch /api/v1/summaries. Only id, topic, topicChosen and the summary text are
   used; location, postcode and table are dropped on arrival and never stored.
2. Embed each summary with LaBSE (sentence-transformers/LaBSE), normalised.
3. Tone: an axis from general positive to general critical Icelandic anchor
   sentences (mean(pos) - mean(neg), normalised). A summary's tone score is its
   projection on the axis, standardised over all summaries (median-centred, in
   standard deviations). Within NEUTRAL_BAND of the middle counts as neutral.
4. The tone component is removed from every vector, so groups form on what was
   said, not how.
5. Per topic (the set topics; the tables' own topics together as "Annað"),
   average-linkage agglomerative clustering on cosine distance, cut at
   DISTANCE_THRESHOLD. Groups of one go under "Stakar".
6. Each group's sentence: the sentence of its summaries closest to the group
   centroid (very short fragments skipped).
7. Each group's keywords: lemmas (Miðeind's `islenska`, BÍN) of nouns,
   adjectives and verbs, minus stopwords and the topic's own words, ranked by
   TF-IDF of the group against the rest of its topic.
8. A 2-D map of meaning: PCA of the tone-removed vectors, scaled to 0-1.

Setup (once; the environment and model cache stay in the git-ignored .venv/):
    python3 -m venv .venv
    .venv/bin/pip install --extra-index-url https://download.pytorch.org/whl/cpu \
        torch sentence-transformers scikit-learn islenska
Run:
    HF_HOME=.venv/hf .venv/bin/python scripts/update-summary-groups.py [--report]
--report prints each topic's groups (size, sentence, keywords, tone).
"""
import argparse
import json
import re
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from math import log
from pathlib import Path

import numpy as np

SOURCE = "https://talasaman.is/api/v1/summaries"
OUT = Path(__file__).resolve().parent.parent / "data" / "summary-groups.json"
MODEL = "sentence-transformers/LaBSE"
OTHER = "Annað"

# Cosine distance (tone removed) at which the clustering stops merging. Tuned
# by reading the --report output: at 0.45 most summaries stay Stakar; at 0.6
# menntun becomes one group of 33. 0.55 (about the 25th percentile of all
# pairwise distances) gives gervigreind ~11 groups and a handful of Stakar,
# close to the grouping on talasaman.is/samantektir/afstada.
DISTANCE_THRESHOLD = 0.55
# |standardised tone| below this is neutral (talasaman.is uses 0.6 too);
# that leaves roughly the middle half of the summaries neutral.
NEUTRAL_BAND = 0.6
MIN_SENTENCE_WORDS = 6
MAX_SENTENCE_WORDS = 35  # a whole run-on paragraph makes a poor headline
KEYWORDS = 5

POSITIVE = [
    "Þetta skapar mikil tækifæri og er jákvætt.",
    "Við erum bjartsýn á framtíðina.",
    "Þetta er frábært og gengur mjög vel.",
    "Það er gott og gagnlegt fyrir alla.",
    "Við sjáum mikla möguleika í þessu.",
    "Þetta hefur bætt líf okkar mikið.",
    "Það var gaman og skemmtilegt að ræða þetta.",
    "Þetta er spennandi þróun sem við fögnum.",
    "Fólk er ánægt og sátt.",
    "Þetta styrkir samfélagið og tengir fólk saman.",
    "Við erum stolt af þessu.",
    "Þetta auðveldar okkur lífið.",
]
CRITICAL = [
    "Þetta veldur áhyggjum og er hættulegt.",
    "Við höfum miklar áhyggjur af framtíðinni.",
    "Þetta er slæmt og fer versnandi.",
    "Þetta er skaðlegt og bitnar á fólki.",
    "Við óttumst afleiðingarnar.",
    "Þetta hefur gert lífið verra.",
    "Kerfið er gallað og virkar ekki.",
    "Þetta er alvarlegt vandamál.",
    "Fólk er óánægt og reitt.",
    "Þetta sundrar samfélaginu og einangrar fólk.",
    "Við erum hrædd við þessa þróun.",
    "Þetta gerir okkur erfiðara fyrir.",
]

# Function words and words every summary uses about the conversation itself.
STOPWORDS = set("""
að af aftur agnar allur alltaf annar annað auk auðvitað á án áður bara báðir
beint betri bæði bæta dálítill eða eftir eiga einhver einn eins einnig ekki
ekkert eða ef eftir en enda engi enginn enn ennþá eru fara fá fram frá fyrir
fyrst fleiri flestur fólk geta gera gegnum gjöra hafa hann hún hér hjá hinn
hvað hver hvernig hvort hví hvorki hægt í inn innan já jafnvel kannski koma
lengi líka líkur lítill margur meira mestur með meðal meiri mikill milli mjög
mega mun munu nei niður nokkur nú núna nær næstum oft og ofan okkar ólíkur
sá sama samt sem sig sinn sjá sjálfur skulu slíkur smá stundum sumur svo
svona sá til tveir um umfram undir upp út varðandi vegna vel verða vera vilja
við vér þá það þannig þar þarna þegar þeir þess þessi þetta þó þótt þú því
ýmis ýmiss yfir ég eitthvað hlutur mál málið atriði leyti rosalega mjög frekar
borð borðið hópur ræða tala umræða spjall samtal spurning segja finna finnast
telja halda nefna fjalla ganga taka gefa fá hugsa velta átt þátttakandi
maður ár dagur sinni nýr gamall stór góður gott vanda ræddur betra var ver
ger inna æta vær væri lykilsetning punktur þurfa sérstaklegur frekur auki beta
nógur sammála mikilvægur fólginn þága nýtur læsa
""".split())

WORD = re.compile(r"[A-Za-zÁÐÉÍÓÚÝÞÆÖáðéíóúýþæö]+")
SENTENCE_END = re.compile(r"(?<=[.!?])\s+|\n+")
# A short label before a colon or dash ("Lykilsetning: …", "Menntun- …"), and quote marks.
LEAD_LABEL = re.compile(r"^[^\s:]{1,20}(\s[^\s:]{1,20})?\s*[:\-–]\s+")
QUOTES = "\"“”„'"
WORD_CLASSES = {"kk", "kvk", "hk", "lo", "so"}  # nouns (3 genders), adjectives, verbs
# Pronouns, prepositions, conjunctions, articles, numerals: a word that is one
# of these in core vocabulary ('við', 'sem', 'hún') is never a keyword.
FUNCTION_CLASSES = {"fn", "pfn", "fs", "st", "gr", "nhm", "to", "rt", "abfn"}


# ---- Data -------------------------------------------------------------------

def fetch_summaries():
    """The non-empty summaries, keeping only id, topic, topicChosen and text."""
    rows = json.load(urllib.request.urlopen(SOURCE, timeout=60))["data"]
    return [{"id": r["id"], "topic": r["topic"].strip(), "chosen": bool(r["topicChosen"]),
             "text": r["summary"].strip()}
            for r in rows if (r.get("summary") or "").strip()]


def topic_of(row, set_topics):
    """The set topic a summary belongs to; a written topic that is a set topic's name goes with it."""
    name = row["topic"].lower()
    return name if name in set_topics else OTHER


def display_name(topic):
    """'gervigreind' -> 'Gervigreind'."""
    return topic[:1].upper() + topic[1:]


# ---- Vectors ------------------------------------------------------------------

def normalise(vectors):
    """Rows scaled to unit length."""
    return vectors / np.linalg.norm(vectors, axis=-1, keepdims=True)


def tone_axis(model):
    """Unit vector from the critical anchors' mean towards the positive anchors' mean."""
    pos = model.encode(POSITIVE, normalize_embeddings=True).mean(axis=0)
    neg = model.encode(CRITICAL, normalize_embeddings=True).mean(axis=0)
    return normalise(pos - neg)


def standardise(scores):
    """Scores centred on their median, in standard deviations."""
    return (scores - np.median(scores)) / scores.std()


def tone_label(z):
    """A standardised tone score as 'positive', 'neutral' or 'critical'."""
    if z >= NEUTRAL_BAND:
        return "positive"
    return "critical" if z <= -NEUTRAL_BAND else "neutral"


def remove_component(vectors, axis):
    """Vectors with their projection on `axis` taken out, renormalised."""
    return normalise(vectors - np.outer(vectors @ axis, axis))


# ---- Groups -------------------------------------------------------------------

def cluster(vectors):
    """Cluster labels for one topic's vectors (average linkage, cosine distance)."""
    from sklearn.cluster import AgglomerativeClustering
    if len(vectors) < 2:
        return np.zeros(len(vectors), dtype=int)
    return AgglomerativeClustering(metric="cosine", linkage="average", n_clusters=None,
                                   distance_threshold=DISTANCE_THRESHOLD).fit_predict(vectors)


def clean_sentence(sentence):
    """A sentence without list bullets, a leading label or quote marks."""
    return LEAD_LABEL.sub("", sentence.strip(" -•*\t")).strip(QUOTES + " ")


def sentences_of(text):
    """The sentences of a summary that can stand on their own as a headline."""
    parts = (clean_sentence(s) for s in SENTENCE_END.split(text))
    return [s for s in parts if MIN_SENTENCE_WORDS <= len(WORD.findall(s)) <= MAX_SENTENCE_WORDS]


def representative_sentence(model, texts, centroid, axis):
    """The sentence among `texts` closest to the group centroid, tone removed."""
    candidates = [s for t in texts for s in sentences_of(t)] or [clean_sentence(t) for t in texts]
    vectors = remove_component(model.encode(candidates, normalize_embeddings=True), axis)
    return candidates[int(np.argmax(vectors @ centroid))]


def tone_counts(labels):
    """{'positive': n, 'neutral': n, 'critical': n} for a list of tone labels."""
    counts = Counter(labels)
    return {k: counts.get(k, 0) for k in ("positive", "neutral", "critical")}


# ---- Keywords -----------------------------------------------------------------

def best_lemma(entries):
    """
    The lemma of a word from its BÍN readings (Kristínarsnið), or None: no
    function-word reading in core vocabulary, then the lemma with the most
    core-vocabulary content readings (any content reading if none are core).
    """
    core = [e for e in entries if e.birting == "K"]
    if any(e.ofl in FUNCTION_CLASSES for e in core):
        return None
    content = [e for e in core if e.ofl in WORD_CLASSES] or [e for e in entries if e.ofl in WORD_CLASSES]
    lemmas = Counter(e.ord.lower() for e in content)
    return lemmas.most_common(1)[0][0] if lemmas else None


class Lemmatiser:
    """Content-word lemmas via BÍN lookups, cached per word form."""

    def __init__(self):
        from islenska import Bin
        self.bin = Bin()
        self.cache = {}

    def lemma(self, word):
        """The lemma of a noun/adjective/verb, or None for other words and unknowns."""
        key = word.lower()
        if key not in self.cache:
            self.cache[key] = best_lemma(self.bin.lookup_ksnid(key)[1])
        return self.cache[key]

    def lemmas(self, text):
        """The set of content lemmas in a text, stopwords left out."""
        found = (self.lemma(w) for w in WORD.findall(text) if len(w) > 2)
        return {l for l in found if l and l not in STOPWORDS and len(l) > 2}


def keywords(group_lemmas, topic_lemmas, exclude):
    """
    Top lemmas of a group: how many of its summaries use a lemma, weighted by
    the smoothed inverse share of the whole topic's summaries that use it.
    """
    df_topic = Counter(l for s in topic_lemmas for l in s)
    df_group = Counter(l for s in group_lemmas for l in s)
    n = len(topic_lemmas)
    score = {l: c * (log((1 + n) / (1 + df_topic[l])) + 1)
             for l, c in df_group.items() if l not in exclude and (c > 1 or len(group_lemmas) == 1)}
    return [l for l, _ in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))[:KEYWORDS]]


# ---- Assembly -----------------------------------------------------------------

def topic_groups(model, axis, rows, vectors, lemmatiser, topic):
    """One topic's groups (largest first) and its stakar, with each summary's group id."""
    labels = cluster(vectors)
    lemma_sets = [lemmatiser.lemmas(r["text"]) for r in rows]
    exclude = lemmatiser.lemmas(topic) | {topic.lower()}
    members = sorted((np.flatnonzero(labels == k) for k in set(labels)), key=lambda m: (-len(m), m[0]))
    groups, stakar = [], []
    for idx in members:
        if len(idx) == 1:
            stakar.append(rows[idx[0]]["id"])
            continue
        centroid = normalise(vectors[idx].mean(axis=0))
        groups.append({
            "id": len(groups) + 1,
            "size": len(idx),
            "sentence": representative_sentence(model, [rows[i]["text"] for i in idx], centroid, axis),
            "keywords": keywords([lemma_sets[i] for i in idx], lemma_sets, exclude),
            "tone": tone_counts([rows[i]["tone"] for i in idx]),
            "summaries": [rows[i]["id"] for i in idx],
        })
    return groups, stakar


def map_positions(vectors):
    """2-D PCA of the vectors, each axis scaled to 0-1."""
    from sklearn.decomposition import PCA
    xy = PCA(n_components=2, random_state=0).fit_transform(vectors)
    xy = (xy - xy.min(axis=0)) / np.ptp(xy, axis=0)
    return np.round(xy, 4)


def topic_order(rows, set_topics):
    """Set topics by number of summaries (most first), then Annað."""
    counts = Counter(r["group_topic"] for r in rows)
    named = sorted((t for t in counts if t != OTHER), key=lambda t: (-counts[t], t))
    return named + ([OTHER] if counts[OTHER] else [])


def build(rows):
    """The whole data file as a dict."""
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL)
    axis = tone_axis(model)
    raw = model.encode([r["text"] for r in rows], normalize_embeddings=True)
    z = standardise(raw @ axis)
    vectors = remove_component(raw, axis)
    set_topics = {r["topic"].lower() for r in rows if r["chosen"]}
    for r, score in zip(rows, z):
        r["tone"], r["toneScore"] = tone_label(score), round(float(score), 3)
        r["group_topic"] = topic_of(r, set_topics)

    lemmatiser, topics, summaries = Lemmatiser(), [], {}
    xy = map_positions(vectors)
    for name in topic_order(rows, set_topics):
        idx = [i for i, r in enumerate(rows) if r["group_topic"] == name]
        sub = [rows[i] for i in idx]
        groups, stakar = topic_groups(model, axis, sub, vectors[idx], lemmatiser, name)
        topics.append({"name": display_name(name), "count": len(sub), "groups": groups, "stakar": stakar})
        group_of = {sid: g["id"] for g in groups for sid in g["summaries"]}
        for i, r in zip(idx, sub):
            summaries[r["id"]] = {"topic": display_name(name), "group": group_of.get(r["id"]),
                                  "tone": r["tone"], "toneScore": r["toneScore"],
                                  "x": float(xy[i][0]), "y": float(xy[i][1])}
    return {
        "source": SOURCE,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "method": (f"LaBSE sentence embeddings; tone = projection on a positive-critical anchor axis, "
                   f"standardised, neutral within ±{NEUTRAL_BAND} SD; tone removed; per topic "
                   f"average-linkage clustering, cosine distance ≤ {DISTANCE_THRESHOLD}; "
                   f"singletons = Stakar; keywords = TF-IDF of BÍN lemmas; map = PCA."),
        "topics": topics,
        "summaries": summaries,
    }


def print_report(data):
    """A readable overview of every topic's groups."""
    for t in data["topics"]:
        print(f"\n== {t['name']} · {t['count']} summaries · {len(t['groups'])} groups · {len(t['stakar'])} stakar")
        for g in t["groups"]:
            tone = g["tone"]
            print(f"  [{g['size']:>2}] +{tone['positive']} ={tone['neutral']} -{tone['critical']}  "
                  f"{', '.join(g['keywords'])}\n       “{g['sentence']}”")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--report", action="store_true", help="print the groups per topic")
    args = parser.parse_args()
    data = build(fetch_summaries())
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    n_groups = sum(len(t["groups"]) for t in data["topics"])
    print(f"{len(data['summaries'])} summaries, {n_groups} groups -> {OUT.name} ({OUT.stat().st_size // 1024} KB)")
    if args.report:
        print_report(data)


if __name__ == "__main__":
    main()

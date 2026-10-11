#!/usr/bin/env python3
"""Write data/transcript-timing.json: when each word of a recorded summary is spoken.

Each recording on talasaman.is is the summary text read aloud, but word timings
are not published, so we compute them with CTC forced alignment, all locally:

1. Fetch /api/v1/summaries and keep the rows with audio. Only id, summary and
   audio are used; location, postcode and table are never stored.
2. Download each recording and decode it to 16 kHz mono (ffmpeg, in a temp
   dir). Digitally silent recordings are skipped.
3. Split the summary into display words exactly as the page does (on
   whitespace), and normalise each for the model: lower case, the model's
   letters only, small numbers spelled out ("13" -> "þrettán").
4. Character probabilities per 20 ms frame from Reykjavík University's
   Icelandic wav2vec2 CTC model (language-and-voice-lab/...-ep30-967h).
5. Viterbi alignment of the letters to the frames. Between words there is an
   optional junction state that takes either the model's word break or any
   speech not in the text (an ad-lib), so extra words don't drag the
   neighbouring ones with them.
6. Quality check per recording: mean letter confidence, the share of word
   midpoints inside voiced (loud enough) stretches, and how close the last
   word ends to the end of speech. Recordings that fail are left out, so the
   page shows their text without highlighting.

Output (small on purpose; the page takes the text from the API):
    { source, generatedAt, method, recordings: { id: { words: [[start, end], ...],
      text_hash } } }
start/end are seconds (2 decimals), one pair per display word. text_hash is
FNV-1a 32 of the UTF-8 display words joined by single spaces (hex), so the page
can tell when a summary has changed since and skip its timings.

Setup (once; the environment and model cache stay in the git-ignored .venv/):
    python3 -m venv .venv
    .venv/bin/pip install --extra-index-url https://download.pytorch.org/whl/cpu \
        torch transformers numpy scipy
    (and ffmpeg on the PATH)
Run:
    HF_HOME=.venv/hf .venv/bin/python scripts/align-transcripts.py
"""
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import torch
from scipy.io import wavfile
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

from _common import DATA, SUMMARIES_URL, fetch_summary_rows, utc_now, write_json

OUT = DATA / "transcript-timing.json"
MODEL = "language-and-voice-lab/wav2vec2-large-xlsr-53-icelandic-ep30-967h"
METHOD = f"CTC forced alignment with {MODEL} (local, CPU)"

RATE = 16000
FRAME = 0.02             # s per model frame (wav2vec2 stride of 320 samples)
CHUNK = 30 * RATE        # samples per model pass, so long clips fit in memory
CONTEXT = 2 * RATE       # extra samples either side of a chunk, trimmed after
SILENT_PEAK = 1e-4       # below about -80 dBFS throughout: nothing recorded
# Per-frame cost (nats) of explaining speech as "not in the text" instead of
# as the expected letters. A matching letter scores near 0, a wrong one about
# -10, so 1.5 lets real ad-libs through without eating the text.
JUNK_PENALTY = 1.5
MIN_CONFIDENCE = 0.5     # mean letter probability a clip needs
MIN_VOICED = 0.7         # share of word midpoints inside voiced stretches
VOICED_MARGIN = 0.15     # s of slack round each voiced stretch
NEG = -1e9

# Spoken forms for numerals in the summaries (neuter / counting forms).
NUMBERS = {
    "1": "eitt", "2": "tvö", "3": "þrjú", "4": "fjögur", "5": "fimm", "6": "sex",
    "7": "sjö", "8": "átta", "9": "níu", "10": "tíu", "11": "ellefu", "12": "tólf",
    "13": "þrettán", "14": "fjórtán", "15": "fimmtán", "16": "sextán",
    "17": "sautján", "18": "átján", "19": "nítján", "20": "tuttugu",
}


def fetch_recordings():
    """The summaries that have a recording, as (id, summary, audio URL)."""
    rows = fetch_summary_rows()
    return [(r["id"], r["summary"], r["audio"]) for r in rows if r.get("audio")]


def display_words(summary):
    """The summary's words as the page shows them (split on whitespace)."""
    return summary.split()


def text_hash(words):
    """FNV-1a 32 (hex) of the words joined by spaces, as UTF-8; the page computes the same."""
    h = 0x811C9DC5
    for byte in " ".join(words).encode("utf-8"):
        h = ((h ^ byte) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def spoken_form(word, letters):
    """A display word as the model's letters ('' for punctuation alone)."""
    digits = re.sub(r"\D", "", word)
    if digits in NUMBERS and not re.search(r"[^\W\d_]", word):
        return NUMBERS[digits]
    return "".join(ch for ch in word.lower() if ch in letters)


def decode_audio(url, workdir):
    """Download a recording and decode it to 16 kHz mono floats (-1..1)."""
    source = Path(workdir) / "clip.webm"
    target = Path(workdir) / "clip.wav"
    urllib.request.urlretrieve(url, source)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(source),
                    "-ac", "1", "-ar", str(RATE), str(target)], check=True)
    _, samples = wavfile.read(target)
    return samples.astype(np.float32) / 32768.0


def emissions(model, processor, samples):
    """Log probabilities per frame (frames x labels), in chunks with trimmed context."""
    parts = []
    for start in range(0, len(samples), CHUNK):
        lo, hi = max(0, start - CONTEXT), min(len(samples), start + CHUNK + CONTEXT)
        inputs = processor(samples[lo:hi], sampling_rate=RATE, return_tensors="pt")
        with torch.inference_mode():
            logits = model(inputs.input_values).logits[0]
        logp = torch.log_softmax(logits, dim=-1).numpy()
        skip = round((start - lo) / RATE / FRAME)
        keep = round((min(start + CHUNK, len(samples)) - start) / RATE / FRAME)
        parts.append(logp[skip:skip + keep])
    return np.concatenate(parts)


def build_states(spoken, vocab, blank):
    """
    The alignment's state chain: letters with optional blanks between them, and
    an optional junction (word break or unexpected speech) between words.
    @returns labels (letter id, blank id, or -1 for a junction), skippable flags,
    and the word each letter state belongs to (-1 elsewhere)
    """
    labels, skippable, word_of = [], [], []

    def add(label, can_skip, word=-1):
        labels.append(label)
        skippable.append(can_skip)
        word_of.append(word)

    def junction():
        add(blank, True)
        add(-1, True)
        add(blank, True)

    junction()
    for index, text in enumerate(spoken):
        for position, ch in enumerate(text):
            if position:  # a blank is required between two of the same letter
                add(blank, text[position - 1] != ch)
            add(vocab[ch], False, index)
        if text:
            junction()
    return np.array(labels), np.array(skippable), np.array(word_of)


def state_scores(logp, labels, vocab):
    """Each state's score per frame; a junction is the word break or any speech, minus a penalty."""
    blank = vocab["[PAD]"]
    speech = np.delete(logp, blank, axis=1).max(axis=1) - JUNK_PENALTY
    junction = np.maximum(logp[:, vocab["|"]], speech)
    scores = logp[:, np.where(labels < 0, 0, labels)]
    scores[:, labels < 0] = junction[:, None]
    return scores


def viterbi(scores, skippable):
    """
    The best path through the chain (frames x states scores). From each state
    the path stays, moves on one, or jumps over up to three skippable states.
    @returns the state index per frame, or None if the text can't fit the audio
    """
    frames, states = scores.shape
    best = np.full(states, NEG)
    best[:4] = np.where(np.cumprod(np.r_[True, skippable[:3]]).astype(bool), 0, NEG)
    best += scores[0]
    back = np.zeros((frames, states), dtype=np.int8)
    for t in range(1, frames):
        options = [best]
        can_jump = np.ones(states, dtype=bool)
        for jump in range(1, 5):
            shifted = np.r_[np.full(jump, NEG), best[:-jump]]
            if jump > 1:
                can_jump &= np.r_[np.zeros(jump - 1, bool), skippable[:-(jump - 1)]]
                shifted = np.where(can_jump, shifted, NEG)
            options.append(shifted)
        options = np.stack(options)
        back[t] = options.argmax(axis=0)
        best = options.max(axis=0) + scores[t]
    return backtrack(back, best, skippable)


def backtrack(back, best, skippable):
    """Follow the back pointers from the best state that may end the chain."""
    states = len(best)
    ends = [states - 1 - k for k in range(4) if all(skippable[states - k:])]
    end = max(ends, key=lambda s: best[s])
    if best[end] <= NEG / 2:
        return None
    path = np.empty(len(back), dtype=int)
    path[-1] = end
    for t in range(len(back) - 1, 0, -1):
        path[t - 1] = path[t] - back[t, path[t]]
    return path


def word_timings(path, word_of, scores, count):
    """[start, end] seconds and mean letter probability per word; None for words without letters."""
    timings, confidence = [None] * count, [None] * count
    words = word_of[path]
    frame_scores = scores[np.arange(len(path)), path]
    for index in range(count):
        frames = np.flatnonzero(words == index)
        if not len(frames):
            continue
        timings[index] = [frames[0] * FRAME, (frames[-1] + 1) * FRAME]
        confidence[index] = float(np.exp(frame_scores[frames]).mean())
    return timings, confidence


def fill_gaps(timings):
    """Words with no letters (a lone dash) take a zero-length time where the previous word ended."""
    last = 0.0
    filled = []
    for timing in timings:
        if timing is None:
            timing = [last, last]
        last = timing[1]
        filled.append([round(timing[0], 2), round(timing[1], 2)])
    return filled


def voiced_frames(samples):
    """Per 20 ms frame: is it loud enough to be speech (halfway between noise floor and speech level)."""
    hop = int(RATE * FRAME)
    frames = samples[: len(samples) // hop * hop].reshape(-1, hop)
    level = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    floor, loud = np.percentile(level, [10, 95])
    voiced = level > (floor + loud) / 2
    margin = int(VOICED_MARGIN / FRAME)
    return np.convolve(voiced, np.ones(2 * margin + 1), mode="same") > 0


def quality(timings, confidence, samples):
    """Mean confidence, share of word midpoints in voiced frames, and seconds from last word to end of speech."""
    voiced = voiced_frames(samples)
    mids = [int((a + b) / 2 / FRAME) for a, b in (t for t in timings if t)]
    inside = np.mean([voiced[min(m, len(voiced) - 1)] for m in mids])
    speech_end = (np.flatnonzero(voiced)[-1] + 1) * FRAME - VOICED_MARGIN
    last_end = max(t[1] for t in timings if t)
    scores = [c for c in confidence if c is not None]
    return {"confidence": float(np.mean(scores)), "voiced": float(inside), "tail": speech_end - last_end}


def align(samples, words, model, processor):
    """Align one recording. @returns (timings or None, a one-line report)."""
    vocab = processor.tokenizer.get_vocab()
    spoken = [spoken_form(w, vocab) for w in words]
    labels, skippable, word_of = build_states(spoken, vocab, vocab["[PAD]"])
    scores = state_scores(emissions(model, processor, samples), labels, vocab)
    path = viterbi(scores, skippable)
    if path is None:
        return None, "skipped: the text is too long for the audio"
    timings, confidence = word_timings(path, word_of, scores, len(words))
    q = quality(timings, confidence, samples)
    report = f"confidence {q['confidence']:.2f}, {q['voiced']:.0%} in voice, last word {q['tail']:+.1f} s before speech ends"
    if q["confidence"] < MIN_CONFIDENCE or q["voiced"] < MIN_VOICED:
        return None, f"skipped (low quality): {report}"
    return fill_gaps(timings), report


def align_recording(url, words, model, processor):
    """Download one recording and align its words. @returns (timings or None, a one-line report)."""
    with tempfile.TemporaryDirectory() as workdir:
        samples = decode_audio(url, workdir)
    duration = len(samples) / RATE
    if np.abs(samples).max() < SILENT_PEAK:
        timings, report = None, "skipped: silent recording"
    else:
        timings, report = align(samples, words, model, processor)
    return timings, f"{len(words):4d} words  {duration:6.1f} s  {report}"


def main():
    """Align every recording, report each one, and write the timings that pass."""
    processor = Wav2Vec2Processor.from_pretrained(MODEL)
    model = Wav2Vec2ForCTC.from_pretrained(MODEL).eval()
    recordings = {}
    for summary_id, summary, url in fetch_recordings():
        words = display_words(summary)
        timings, report = align_recording(url, words, model, processor)
        print(f"{summary_id[:8]}  {report}")
        if timings:
            recordings[summary_id] = {"words": timings, "text_hash": text_hash(words)}
    write_json(OUT, {"source": SUMMARIES_URL, "generatedAt": utc_now(), "method": METHOD, "recordings": recordings})
    print(f"Wrote {OUT} ({len(recordings)} recordings)")


if __name__ == "__main__":
    main()

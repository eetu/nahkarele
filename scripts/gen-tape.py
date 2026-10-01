# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["numpy", "pyworld", "setuptools<81", "soundfile"]
# ///
"""Render the orientation tape: Piper reads each line, WORLD re-sings it on held notes, ffmpeg
adds the metal. Writes static/tape/orientation.mp3 and src/lib/tape/tape.json (the cues).

    uv run scripts/gen-tape.py            # needs ffmpeg, and a Piper HTTP server

PIPER_URL picks the server (default: mini on the LAN), PIPER_VOICE the voice.
"""

import io
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

import numpy as np
import pyworld as pw
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
LINES = ROOT / "src/lib/tape/orientation.json"
CUES = ROOT / "src/lib/tape/tape.json"
OUT = ROOT / "static/tape/orientation.mp3"

PIPER_URL = os.environ.get("PIPER_URL", "http://192.168.1.155:8192/")
VOICE = os.environ.get("PIPER_VOICE", "en_US-ljspeech-high")

LEAD_S = 0.6
GAP_S = 0.7
# Between sentences inside a line. Piper over HTTP runs them together.
SENTENCE_S = 0.4
TAIL_S = 1.2
FRAME_MS = 5.0
# Notes the voice is allowed to sit on: a minor pentatonic over A3, semitones.
SCALE = np.array([-5, -2, 0, 3, 5, 7, 10, 12])
BASE_HZ = 220.0
# A syllable held longer than this is split, so long vowels step instead of droning.
HOLD_S = 0.22
# How much of the reader's own melody survives; the rest is flattened away.
CONTOUR = 0.35


def speak(text: str) -> tuple[np.ndarray, int]:
    body = json.dumps(
        {
            "text": text,
            "voice": VOICE,
            "length_scale": 1.08,
            "noise_scale": 0.35,
            "noise_w_scale": 0.3,
        }
    ).encode()
    req = urllib.request.Request(PIPER_URL, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as res:
        audio, fs = sf.read(io.BytesIO(res.read()), dtype="float64")
    return audio, fs


def read(text: str) -> tuple[np.ndarray, int]:
    """A line, one sentence at a time, with a breath the machine does not need between them."""
    parts, fs = [], 22050
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        x, fs = speak(sentence)
        if parts:
            parts.append(np.zeros(int(SENTENCE_S * fs)))
        parts.append(x)
    return np.concatenate(parts), fs


def runs(voiced: np.ndarray) -> list[tuple[int, int]]:
    """[start, end) frame ranges of each voiced stretch, long ones cut into holds."""
    out, i, n = [], 0, len(voiced)
    hold = int(HOLD_S * 1000 / FRAME_MS)
    while i < n:
        if not voiced[i]:
            i += 1
            continue
        j = i
        while j < n and voiced[j]:
            j += 1
        for a in range(i, j, hold):
            b = min(j, a + hold)
            # A sliver at the end joins the hold before it.
            if out and b - a < hold // 3 and a != i:
                out[-1] = (out[-1][0], b)
            else:
                out.append((a, b))
        i = j
    return out


def sing(x: np.ndarray, fs: int, rng: np.random.Generator) -> np.ndarray:
    f0, t = pw.harvest(x, fs, frame_period=FRAME_MS)
    sp = pw.cheaptrick(x, f0, t, fs)
    ap = pw.d4c(x, f0, t, fs)

    sung = np.zeros_like(f0)
    for a, b in runs(f0 > 0):
        semis = 12 * np.log2(np.median(f0[a:b]) / BASE_HZ) * CONTOUR
        # Now and then a syllable jumps a step or two, the way an autotuned machine does.
        roll = rng.random()
        if roll < 0.18:
            semis += 5
        elif roll < 0.26:
            semis -= 3
        note = SCALE[np.argmin(np.abs(SCALE - semis))]
        sung[a:b] = BASE_HZ * 2 ** (note / 12)

    # Formants nudged up a little, breath taken out: a voice that was built, not born.
    bins = sp.shape[1]
    src = np.clip(np.arange(bins) / 1.06, 0, bins - 1)
    sp = np.array([np.interp(src, np.arange(bins), frame) for frame in sp])
    ap = ap**1.6
    return pw.synthesize(sung, sp, ap, fs, frame_period=FRAME_MS)


def main() -> None:
    lines = json.loads(LINES.read_text())["lines"]
    rng = np.random.default_rng(1978)
    parts, cues, fs = [], [], 22050
    cursor = LEAD_S
    for text in lines:
        x, fs = read(text)
        y = sing(x, fs, rng)
        parts.append((cursor, y))
        dur = len(y) / fs
        cues.append({"text": text, "start": round(cursor, 3), "end": 0.0})
        cursor += dur + GAP_S
        print(f"{dur:5.2f}s  {text}")
    for cue, nxt in zip(cues, cues[1:]):
        cue["end"] = nxt["start"]
    total = cursor - GAP_S + TAIL_S
    cues[-1]["end"] = round(total, 3)

    tape = np.zeros(int(total * fs) + 1)
    for at, y in parts:
        i = int(at * fs)
        tape[i : i + len(y)] += y
    tape /= max(1e-9, np.abs(tape).max()) / 0.8

    wav = io.BytesIO()
    sf.write(wav, tape, fs, format="WAV", subtype="PCM_16")
    # Two short echoes make a comb filter: the metal. Then presence, and no rumble.
    chain = ",".join(
        [
            "highpass=f=150",
            "aecho=0.8:0.55:7|13:0.3|0.18",
            "equalizer=f=3000:t=q:w=1.2:g=4",
            "equalizer=f=350:t=q:w=1:g=-3",
            "alimiter=limit=0.9",
        ]
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:0", "-af", chain, "-ac", "1"]
        + ["-c:a", "libmp3lame", "-b:a", "48k", str(OUT)],
        input=wav.getvalue(),
        check=True,
    )
    CUES.write_text(json.dumps({"voice": VOICE, "seconds": round(total, 3), "cues": cues}, indent=2) + "\n")
    print(f"{total:.1f}s → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()

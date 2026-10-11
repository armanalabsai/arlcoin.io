#!/usr/bin/env python3
"""Renders the website's background music: an original 65-second ambient organ piece.

Written for ARL, no samples or third-party recordings, so it carries no license beyond the
repository's. The piece loops seamlessly (its last seconds are folded into its first), and it is
deterministic: the same numpy version renders the same samples.

  python3 scripts/generate-ambient.py apps/web/public/audio/arl-ambient.mp3

Needs numpy and ffmpeg (with libmp3lame).
"""
import subprocess
import sys

import numpy as np

SR = 44_100
LENGTH = 65.0  # seconds, the loop length
TAIL = 4.0  # rendered past the end and folded into the start, for a seamless loop
rng = np.random.default_rng(2026)


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


# A minor: Am, F, C, G, Am, F, C, Em (MIDI notes of the pad voicings).
CHORDS = [
    [57, 60, 64, 71],
    [53, 57, 60, 64],
    [55, 60, 64, 67],
    [55, 59, 62, 67],
    [57, 60, 64, 71],
    [53, 57, 60, 69],
    [55, 60, 64, 72],
    [52, 55, 59, 64],
]
STEP = LENGTH / len(CHORDS)
N = int(SR * (LENGTH + TAIL))
t = np.arange(N) / SR


def envelope(start: float, dur: float, attack: float, release: float) -> np.ndarray:
    env = np.zeros(N)
    a = (t - start) / attack
    r = (start + dur + release - t) / release
    env = np.clip(np.minimum(a, r), 0, 1)
    return np.sin(env * np.pi / 2) ** 2


def organ(freq: float) -> np.ndarray:
    # Additive pipe-organ tone; a slight detune on a second voice gives a slow chorus.
    out = np.zeros(N)
    for harmonic, amp in ((1, 1.0), (2, 0.5), (3, 0.22), (4, 0.18), (6, 0.06), (8, 0.05)):
        for detune in (-0.6, 0.6):
            phase = rng.uniform(0, 2 * np.pi)
            out += amp * np.sin(2 * np.pi * (freq * harmonic + detune) * t + phase)
    return out / 4.0


mix = np.zeros((2, N))
# Low drone on A, through the whole piece.
drone = organ(hz(33)) * 0.35 + organ(hz(45)) * 0.25
mix += drone

# Pads: each chord swells in and overlaps the next.
for i in range(len(CHORDS) + 1):
    chord = CHORDS[i % len(CHORDS)]
    start = i * STEP - 1.0
    env = envelope(start, STEP + 0.5, 2.5, 2.5)
    for j, note in enumerate(chord):
        voice = organ(hz(note)) * env * 0.22
        pan = 0.35 + 0.3 * (j / (len(chord) - 1))
        mix[0] += voice * (1 - pan)
        mix[1] += voice * pan

# A soft, slow line of chord tones an octave up (sine bells with a long decay).
beat = 0.75
for k in range(int((LENGTH + TAIL) / beat)):
    start = k * beat
    chord = CHORDS[int(start // STEP) % len(CHORDS)]
    note = chord[[0, 2, 1, 3, 2, 1][k % 6]] + 12
    if k % 8 == 7:
        continue
    seg = t >= start
    dt = t[seg] - start
    bell = (np.sin(2 * np.pi * hz(note) * dt) + 0.3 * np.sin(2 * np.pi * hz(note) * 2.01 * dt)) * np.exp(-dt / 1.6)
    bell *= np.minimum(dt / 0.01, 1)
    pan = 0.5 + 0.35 * np.sin(k * 0.9)
    mix[0, seg] += bell * 0.05 * (1 - pan)
    mix[1, seg] += bell * 0.05 * pan

# Reverb: convolution with a decaying-noise impulse response.
ir_len = int(SR * 3.0)
ir_t = np.arange(ir_len) / SR
for ch in range(2):
    ir = rng.standard_normal(ir_len) * np.exp(-ir_t / 0.9)
    ir[0] = 0
    ir /= np.sqrt(np.sum(ir**2))
    size = 1 << int(np.ceil(np.log2(N + ir_len)))
    wet = np.fft.irfft(np.fft.rfft(mix[ch], size) * np.fft.rfft(ir, size), size)[:N]
    mix[ch] = 0.7 * mix[ch] + 0.45 * wet

# Fold the tail into the start with an equal-power crossfade, then cut to the loop length.
loop = int(SR * LENGTH)
fold = N - loop
fade = np.sin(np.linspace(0, np.pi / 2, fold))
out = mix[:, :loop].copy()
out[:, :fold] = mix[:, :fold] * fade + mix[:, loop:] * np.cos(np.linspace(0, np.pi / 2, fold))

out /= np.max(np.abs(out))
out *= 0.6
pcm = (out.T * 32767).astype("<i2").tobytes()

dest = sys.argv[1] if len(sys.argv) > 1 else "arl-ambient.mp3"
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-",
     "-codec:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", dest],
    input=pcm,
    check=True,
)
print(f"wrote {dest}: {LENGTH:.0f} s loop")

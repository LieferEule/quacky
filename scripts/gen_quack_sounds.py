# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy"]
# ///
"""Cuts the quack sound theme from a CC0 recording.

Source: "Duck Quack - Sound Effect (HD)" by Tabby+Gus., Creative Commons 0,
https://freesound.org/people/Tabby+Gus./sounds/515408/ (its public preview).

Start is the quack as recorded, stop the same quack a little lower and slower,
so the two can be told apart without looking.

    uv run scripts/gen_quack_sounds.py
"""

import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile

PREVIEW = "https://cdn.freesound.org/previews/515/515408_10319640-hq.mp3"
OUT = Path(__file__).resolve().parent.parent / "src-tauri/resources"
# Where the quack sits in the recording, in seconds; the rest is near silence.
CUT = (0.22, 0.62)
PEAK = 0.6
STOP_SLOWDOWN = 1.2


def load() -> tuple[int, np.ndarray]:
    with tempfile.TemporaryDirectory() as tmp:
        mp3, wav = Path(tmp) / "quack.mp3", Path(tmp) / "quack.wav"
        subprocess.run(["curl", "-sfL", "-o", mp3, PREVIEW], check=True)
        subprocess.run(
            ["afconvert", "-f", "WAVE", "-d", "LEI16@44100", mp3, wav], check=True
        )
        rate, samples = wavfile.read(wav)
    return rate, samples.astype(np.float64) / 32768


def write(name: str, rate: int, samples: np.ndarray) -> None:
    fade = np.minimum(1, np.arange(len(samples))[::-1] / (rate * 0.06))[:, None]
    shaped = samples * fade / np.max(np.abs(samples)) * PEAK
    wavfile.write(OUT / name, rate, (shaped * 32767).astype(np.int16))


rate, recording = load()
quack = recording[int(CUT[0] * rate) : int(CUT[1] * rate)]
write("quack_start.wav", rate, quack)

# Plain resampling: slower playback is what lowers the pitch.
positions = np.arange(0, len(quack) - 1, 1 / STOP_SLOWDOWN)
lower = np.stack(
    [np.interp(positions, np.arange(len(quack)), quack[:, c]) for c in range(2)],
    axis=1,
)
write("quack_stop.wav", rate, lower)

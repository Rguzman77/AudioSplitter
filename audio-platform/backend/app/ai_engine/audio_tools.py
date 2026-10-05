"""
BPM detection, tempo shifting, and pitch transposition.
Primary: pyrubberband (high quality, requires rubberband CLI).
Fallback: librosa (pure-Python, works everywhere).
"""
import asyncio
from pathlib import Path
from typing import Tuple

import librosa
import numpy as np
import soundfile as sf


# ---------------------------------------------------------------------------
# BPM detection
# ---------------------------------------------------------------------------

async def detect_bpm(audio_file: str) -> float:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _detect_bpm, audio_file)


def _detect_bpm(audio_file: str) -> float:
    y, sr = librosa.load(audio_file, mono=True, duration=120)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    # librosa may return an array in newer versions
    return float(np.atleast_1d(tempo)[0])


# ---------------------------------------------------------------------------
# Audio info
# ---------------------------------------------------------------------------

async def get_audio_info(audio_file: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _get_audio_info, audio_file)


def _get_audio_info(audio_file: str) -> dict:
    info = sf.info(audio_file)
    y, sr = librosa.load(audio_file, mono=True, duration=120)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return {
        "bpm": float(np.atleast_1d(tempo)[0]),
        "duration": info.duration,
        "sample_rate": info.samplerate,
        "channels": info.channels,
    }


# ---------------------------------------------------------------------------
# Tempo / time stretch
# ---------------------------------------------------------------------------

async def time_stretch(audio_file: str, output_file: str, rate: float) -> str:
    """rate > 1 → faster (higher BPM), rate < 1 → slower."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _time_stretch, audio_file, output_file, rate)


def _time_stretch(audio_file: str, output_file: str, rate: float) -> str:
    try:
        import pyrubberband as pyrb
        data, sr = sf.read(audio_file)
        if data.ndim == 1:
            out = pyrb.time_stretch(data, sr, rate)
        else:
            out = np.stack(
                [pyrb.time_stretch(data[:, i], sr, rate) for i in range(data.shape[1])],
                axis=1,
            )
    except ImportError:
        data, sr = librosa.load(audio_file, mono=False, sr=None)
        if data.ndim == 1:
            out = librosa.effects.time_stretch(data, rate=rate)
        else:
            out = np.stack(
                [librosa.effects.time_stretch(data[i], rate=rate) for i in range(data.shape[0])],
                axis=0,
            ).T  # soundfile expects (frames, channels)

    Path(output_file).parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_file, out, sr)
    return output_file


# ---------------------------------------------------------------------------
# Pitch transposition
# ---------------------------------------------------------------------------

async def pitch_shift(audio_file: str, output_file: str, semitones: float) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _pitch_shift, audio_file, output_file, semitones)


def _pitch_shift(audio_file: str, output_file: str, semitones: float) -> str:
    try:
        import pyrubberband as pyrb
        data, sr = sf.read(audio_file)
        if data.ndim == 1:
            out = pyrb.pitch_shift(data, sr, semitones)
        else:
            out = np.stack(
                [pyrb.pitch_shift(data[:, i], sr, semitones) for i in range(data.shape[1])],
                axis=1,
            )
    except ImportError:
        data, sr = librosa.load(audio_file, mono=False, sr=None)
        if data.ndim == 1:
            out = librosa.effects.pitch_shift(data, sr=sr, n_steps=semitones)
        else:
            out = np.stack(
                [librosa.effects.pitch_shift(data[i], sr=sr, n_steps=semitones) for i in range(data.shape[0])],
                axis=0,
            ).T

    Path(output_file).parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_file, out, sr)
    return output_file

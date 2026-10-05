"""
Patches torchaudio.save to use soundfile instead of torchcodec (which requires
FFmpeg shared libraries). Must run before any demucs imports.
"""
import sys

import numpy as np
import soundfile as sf
import torch
import torchaudio


def _sf_save(uri, src, sample_rate, channels_first=True, **kwargs):
    if isinstance(src, torch.Tensor):
        arr = src.numpy()
    else:
        arr = np.array(src)
    if arr.ndim == 2 and channels_first:
        arr = arr.T
    sf.write(str(uri), arr, sample_rate)


torchaudio.save = _sf_save

from demucs.__main__ import main  # noqa: E402

sys.exit(main())

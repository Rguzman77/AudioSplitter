import asyncio
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import torch

from app.ai_engine.base import AIProvider


class DemucsProvider(AIProvider):
    def __init__(self, model_name: str = "htdemucs"):
        self.model_name = model_name
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._loaded = False

    @property
    def name(self) -> str:
        return f"demucs-{self.model_name}"

    @property
    def stems(self) -> List[str]:
        if self.model_name == "htdemucs_6s":
            return ["vocals", "drums", "bass", "guitar", "piano", "other"]
        return ["vocals", "drums", "bass", "other"]

    async def load(self) -> None:
        self._loaded = True

    async def separate(
        self,
        input_file: str,
        output_dir: str,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> Dict[str, str]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._run_separation, input_file, output_dir, progress_callback
        )

    def _run_separation(
        self,
        input_file: str,
        output_dir: str,
        progress_callback: Optional[Callable[[float], None]],
    ) -> Dict[str, str]:
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        wrapper = str(Path(__file__).parent / "demucs_wrapper.py")
        cmd = [
            sys.executable, wrapper,
            "--name", self.model_name,
            "--out", output_dir,
            "--device", self._device,
            input_file,
        ]

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = process.communicate()

        if process.returncode != 0:
            raise RuntimeError(f"Demucs failed:\n{stderr[-2000:]}")

        input_name = Path(input_file).stem
        stem_dir = Path(output_dir) / self.model_name / input_name

        # Discover all .wav files produced by Demucs instead of using a fixed list
        result: Dict[str, str] = {
            p.stem: str(p)
            for p in stem_dir.glob("*.wav")
        }

        if not result:
            raise RuntimeError(
                f"Demucs ran but produced no output. Checked: {stem_dir}"
            )

        return result

    async def health_check(self) -> Dict[str, Any]:
        return {
            "provider": self.name,
            "device": self._device,
            "cuda_available": torch.cuda.is_available(),
        }

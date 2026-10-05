from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional


class AIProvider(ABC):
    @abstractmethod
    async def load(self) -> None:
        pass

    @abstractmethod
    async def separate(
        self,
        input_file: str,
        output_dir: str,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> Dict[str, str]:
        """Returns {stem_name: absolute_file_path}"""
        pass

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def stems(self) -> List[str]:
        pass

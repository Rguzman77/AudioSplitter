from pathlib import Path

import aiofiles

from app.domains.storage.base import StorageProvider


class LocalStorageProvider(StorageProvider):
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _full_path(self, path: str) -> Path:
        return self.base_path / path

    async def save(self, file_data: bytes, path: str) -> str:
        full = self._full_path(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(full, "wb") as f:
            await f.write(file_data)
        return path

    async def get(self, path: str) -> bytes:
        async with aiofiles.open(self._full_path(path), "rb") as f:
            return await f.read()

    async def delete(self, path: str) -> bool:
        full = self._full_path(path)
        if full.exists():
            full.unlink()
            return True
        return False

    def get_url(self, path: str) -> str:
        return f"/storage/{path}"

    async def exists(self, path: str) -> bool:
        return self._full_path(path).exists()

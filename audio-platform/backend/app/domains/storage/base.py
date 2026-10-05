from abc import ABC, abstractmethod


class StorageProvider(ABC):
    @abstractmethod
    async def save(self, file_data: bytes, path: str) -> str:
        pass

    @abstractmethod
    async def get(self, path: str) -> bytes:
        pass

    @abstractmethod
    async def delete(self, path: str) -> bool:
        pass

    @abstractmethod
    def get_url(self, path: str) -> str:
        pass

    @abstractmethod
    async def exists(self, path: str) -> bool:
        pass

from app.ai_engine.base import AIProvider
from app.ai_engine.demucs_provider import DemucsProvider

_cache: dict[str, AIProvider] = {}


def get_provider(name: str) -> AIProvider:
    if name not in _cache:
        if name == "demucs" or name.startswith("demucs-"):
            model = name[len("demucs-"):] if name.startswith("demucs-") else "htdemucs"
            _cache[name] = DemucsProvider(model_name=model)
        else:
            raise ValueError(f"Unknown AI provider: {name}")
    return _cache[name]

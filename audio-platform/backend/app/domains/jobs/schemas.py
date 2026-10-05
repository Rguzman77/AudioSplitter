from datetime import datetime
from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel


class JobStatus(str, Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class JobCreate(BaseModel):
    title: str
    source: str
    source_url: Optional[str] = None
    ai_model: str = "demucs"


class JobResponse(BaseModel):
    id: str
    title: str
    source: str
    source_url: Optional[str]
    status: JobStatus
    progress: float
    error_message: Optional[str]
    ai_model: str
    stems: Optional[Dict[str, str]]
    bpm: Optional[float]
    duration_seconds: Optional[float]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class YoutubeDownloadRequest(BaseModel):
    url: str
    ai_model: str = "demucs"


class TempoRequest(BaseModel):
    shift_bpm: Optional[float] = None
    target_bpm: Optional[float] = None


class TransposeRequest(BaseModel):
    semitones: float

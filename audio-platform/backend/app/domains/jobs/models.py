import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Float, JSON, String

from app.database import Base


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    source = Column(String, nullable=False)  # "upload" | "youtube"
    source_url = Column(String, nullable=True)

    status = Column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False)
    progress = Column(Float, default=0.0)
    error_message = Column(String, nullable=True)

    ai_model = Column(String, default="demucs")
    stems = Column(JSON, nullable=True)  # {"vocals": "/path/...", "drums": ...}

    bpm = Column(Float, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    input_file_path = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

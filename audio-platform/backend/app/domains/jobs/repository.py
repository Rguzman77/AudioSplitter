from typing import List, Optional

from sqlalchemy.orm import Session

from app.domains.jobs.models import Job, JobStatus
from app.domains.jobs.schemas import JobCreate


class JobRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, data: JobCreate) -> Job:
        job = Job(
            title=data.title,
            source=data.source,
            source_url=data.source_url,
            ai_model=data.ai_model,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        return self.db.query(Job).filter(Job.id == job_id).first()

    def list_all(self) -> List[Job]:
        return self.db.query(Job).order_by(Job.created_at.desc()).all()

    def update_status(
        self,
        job_id: str,
        status: JobStatus,
        progress: Optional[float] = None,
        error: Optional[str] = None,
    ) -> Optional[Job]:
        job = self.get(job_id)
        if not job:
            return None
        job.status = status
        if progress is not None:
            job.progress = progress
        if error:
            job.error_message = error
        self.db.commit()
        self.db.refresh(job)
        return job

    def update_result(
        self, job_id: str, stems: dict, bpm: float, duration: float
    ) -> Optional[Job]:
        job = self.get(job_id)
        if not job:
            return None
        job.stems = stems
        job.bpm = bpm
        job.duration_seconds = duration
        job.status = JobStatus.DONE
        job.progress = 100.0
        self.db.commit()
        self.db.refresh(job)
        return job

    def delete(self, job_id: str) -> bool:
        job = self.get(job_id)
        if not job:
            return False
        self.db.delete(job)
        self.db.commit()
        return True

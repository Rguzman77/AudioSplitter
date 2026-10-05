"""
Background task: runs stem separation for a given job.
Called either directly in a thread (no Redis) or via RQ.
"""
import asyncio
from pathlib import Path


def process_separation_job(
    job_id: str,
    db_url: str,
    storage_path: str,
    ai_model: str = "demucs",
) -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}
    engine = create_engine(db_url, connect_args=connect_args)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        from app.domains.jobs.models import JobStatus
        from app.domains.jobs.repository import JobRepository
        from app.ai_engine.audio_tools import get_audio_info
        from app.ai_engine.factory import get_provider

        repo = JobRepository(db)
        job = repo.get(job_id)
        if not job or not job.input_file_path:
            return

        repo.update_status(job_id, JobStatus.PROCESSING, progress=10.0)

        provider = get_provider(ai_model)
        output_dir = str(Path(storage_path) / "stems" / job_id)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            repo.update_status(job_id, JobStatus.PROCESSING, progress=20.0)
            stems = loop.run_until_complete(
                provider.separate(job.input_file_path, output_dir)
            )
            repo.update_status(job_id, JobStatus.PROCESSING, progress=85.0)
            audio_info = loop.run_until_complete(
                get_audio_info(job.input_file_path)
            )
        finally:
            loop.close()

        repo.update_result(
            job_id,
            stems=stems,
            bpm=audio_info["bpm"],
            duration=audio_info["duration"],
        )

    except Exception as exc:
        try:
            from app.domains.jobs.models import JobStatus
            from app.domains.jobs.repository import JobRepository

            repo = JobRepository(db)
            repo.update_status(job_id, JobStatus.FAILED, error=str(exc))
        except Exception:
            pass
    finally:
        db.close()

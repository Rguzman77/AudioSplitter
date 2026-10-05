import re
import shutil
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.domains.jobs.models import JobStatus
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobCreate, JobResponse, YoutubeDownloadRequest

router = APIRouter(prefix="/youtube", tags=["youtube"])

YT_PATTERN = re.compile(r"(youtube\.com|youtu\.be)")


def _find_ffmpeg() -> str | None:
    """Find ffmpeg binary — checks PATH first, then common Windows install locations."""
    if shutil.which("ffmpeg"):
        return shutil.which("ffmpeg")

    candidates = [
        Path("C:/ffmpeg/bin/ffmpeg.exe"),
        Path("C:/Program Files/ffmpeg/bin/ffmpeg.exe"),
        Path("C:/ProgramData/chocolatey/bin/ffmpeg.exe"),
        Path.home() / "AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe",
        Path.home() / "scoop/apps/ffmpeg/current/bin/ffmpeg.exe",
    ]
    for c in candidates:
        if c.exists():
            return str(c.parent)

    # Winget Gyan.FFmpeg package: Gyan.FFmpeg_*/ffmpeg-*/bin/ffmpeg.exe
    winget_packages = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    if winget_packages.exists():
        for p in winget_packages.glob("Gyan.FFmpeg_*/ffmpeg-*/bin/ffmpeg.exe"):
            return str(p.parent)
        for p in winget_packages.glob("*[Ff][Ff]mpeg*/ffmpeg*/bin/ffmpeg.exe"):
            return str(p.parent)

    return None


@router.post("/", response_model=JobResponse)
async def download_youtube(
    req: YoutubeDownloadRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if not YT_PATTERN.search(req.url):
        raise HTTPException(400, "URL de YouTube inválida")

    repo = JobRepository(db)
    job = repo.create(
        JobCreate(
            title="YouTube: descargando…",
            source="youtube",
            source_url=req.url,
            ai_model=req.ai_model,
        )
    )
    repo.update_status(job.id, JobStatus.DOWNLOADING, progress=5.0)

    # Run download + separation in background
    background_tasks.add_task(
        _download_then_separate,
        job_id=job.id,
        url=req.url,
        ai_model=req.ai_model,
        db_url=settings.DATABASE_URL,
        storage_path=settings.STORAGE_BASE_PATH,
    )

    return repo.get(job.id)


def _download_then_separate(
    job_id: str, url: str, ai_model: str, db_url: str, storage_path: str
) -> None:
    """Download via yt-dlp then hand off to separation worker (both blocking)."""
    import yt_dlp
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}
    engine = create_engine(db_url, connect_args=connect_args)
    db = sessionmaker(bind=engine)()

    try:
        from app.domains.jobs.models import JobStatus
        from app.domains.jobs.repository import JobRepository

        repo = JobRepository(db)

        upload_dir = Path(storage_path) / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)

        ffmpeg_location = _find_ffmpeg()
        if not ffmpeg_location:
            raise RuntimeError(
                "FFmpeg no encontrado. Instálalo con: winget install Gyan.FFmpeg "
                "y reinicia la terminal."
            )

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(upload_dir / f"{job_id}.%(ext)s"),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "ffmpeg_location": ffmpeg_location,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "extractor_args": {"youtube": {"player_client": ["android"]}},
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        title = info.get("title", "YouTube Audio")
        audio_file = str(upload_dir / f"{job_id}.mp3")

        job = repo.get(job_id)
        if job:
            job.title = title
            job.input_file_path = audio_file
            db.commit()

        repo.update_status(job_id, JobStatus.PENDING, progress=20.0)

        # Reuse the same separation worker
        from app.workers.tasks import process_separation_job

        process_separation_job(job_id, db_url, storage_path, ai_model)

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

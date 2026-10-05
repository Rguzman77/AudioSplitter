import io
import threading
import zipfile
from pathlib import Path
from typing import List

import aiofiles
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.domains.jobs.models import JobStatus
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobCreate, JobResponse, TempoRequest, TransposeRequest
from app.ai_engine.audio_tools import pitch_shift, time_stretch

router = APIRouter(prefix="/jobs", tags=["jobs"])

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a"}


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[JobResponse])
def list_jobs(db: Session = Depends(get_db)):
    return JobRepository(db).list_all()


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = JobRepository(db).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.delete("/{job_id}")
def delete_job(job_id: str, db: Session = Depends(get_db)):
    if not JobRepository(db).delete(job_id):
        raise HTTPException(404, "Job not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=JobResponse)
async def upload_audio(
    file: UploadFile = File(...),
    ai_model: str = Form(default="demucs"),
    db: Session = Depends(get_db),
):
    if Path(file.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Formato no soportado. Usa: {ALLOWED_EXTENSIONS}")

    repo = JobRepository(db)
    job = repo.create(
        JobCreate(title=Path(file.filename).stem, source="upload", ai_model=ai_model)
    )

    upload_dir = Path(settings.STORAGE_BASE_PATH) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix.lower()
    file_path = str(upload_dir / f"{job.id}{ext}")

    content = await file.read()
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    job.input_file_path = file_path
    db.commit()
    db.refresh(job)

    _enqueue_job(job.id, ai_model)
    return job


# ---------------------------------------------------------------------------
# Download stems
# ---------------------------------------------------------------------------

@router.get("/{job_id}/stems/{stem_name}")
def download_stem(job_id: str, stem_name: str, db: Session = Depends(get_db)):
    job = JobRepository(db).get(job_id)
    if not job or not job.stems:
        raise HTTPException(404, "Stems no disponibles")
    path = job.stems.get(stem_name)
    if not path or not Path(path).exists():
        raise HTTPException(404, f"Stem '{stem_name}' no encontrado")
    return FileResponse(path, media_type="audio/wav", filename=f"{stem_name}.wav")


@router.get("/{job_id}/download")
def download_all_zip(job_id: str, db: Session = Depends(get_db)):
    job = JobRepository(db).get(job_id)
    if not job or not job.stems:
        raise HTTPException(404, "Stems no disponibles")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for stem_name, stem_path in job.stems.items():
            if Path(stem_path).exists():
                zf.write(stem_path, f"{stem_name}.wav")
    buf.seek(0)

    safe_title = "".join(c for c in job.title if c.isalnum() or c in " _-")[:60]
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}_stems.zip"'},
    )


# ---------------------------------------------------------------------------
# Tempo
# ---------------------------------------------------------------------------

@router.post("/{job_id}/tempo")
async def adjust_tempo(job_id: str, req: TempoRequest, db: Session = Depends(get_db)):
    job = JobRepository(db).get(job_id)
    if not job or not job.stems:
        raise HTTPException(404, "Job no listo")
    if not job.bpm:
        raise HTTPException(400, "BPM no detectado para este job")

    if req.target_bpm:
        rate = req.target_bpm / job.bpm
    elif req.shift_bpm is not None:
        rate = (job.bpm + req.shift_bpm) / job.bpm
    else:
        raise HTTPException(400, "Debes indicar shift_bpm o target_bpm")

    if rate <= 0.1 or rate > 4.0:
        raise HTTPException(400, "Rate de tempo fuera de rango (0.1 – 4.0)")

    result: dict[str, str] = {}
    stem_urls: dict[str, str] = {}
    for stem_name, stem_path in job.stems.items():
        tag = f"tempo{rate:.3f}"
        out_path = stem_path.replace(".wav", f"_{tag}.wav")
        await time_stretch(stem_path, out_path, rate)
        result[stem_name] = out_path
        rel = Path(out_path).relative_to(settings.STORAGE_BASE_PATH).as_posix()
        stem_urls[stem_name] = f"/storage/{rel}"

    new_bpm = round(job.bpm * rate, 2)
    return {
        "adjusted_stems": result,
        "stem_urls": stem_urls,
        "original_bpm": job.bpm,
        "new_bpm": new_bpm,
        "rate": rate,
    }


# ---------------------------------------------------------------------------
# Transpose / pitch shift
# ---------------------------------------------------------------------------

@router.post("/{job_id}/transpose")
async def transpose_audio(job_id: str, req: TransposeRequest, db: Session = Depends(get_db)):
    job = JobRepository(db).get(job_id)
    if not job or not job.stems:
        raise HTTPException(404, "Job no listo")

    # Return original stems as URLs when no-op
    if req.semitones == 0:
        stem_urls = {
            n: f"/api/v1/jobs/{job.id}/stems/{n}"
            for n in (job.stems or {})
        }
        return {"transposed_stems": job.stems, "stem_urls": stem_urls, "semitones": 0}

    result: dict[str, str] = {}
    stem_urls: dict[str, str] = {}
    for stem_name, stem_path in job.stems.items():
        sign = "p" if req.semitones >= 0 else "m"
        tag = f"pitch_{sign}{abs(req.semitones):.1f}"
        out_path = stem_path.replace(".wav", f"_{tag}.wav")
        await pitch_shift(stem_path, out_path, req.semitones)
        result[stem_name] = out_path
        rel = Path(out_path).relative_to(settings.STORAGE_BASE_PATH).as_posix()
        stem_urls[stem_name] = f"/storage/{rel}"

    return {"transposed_stems": result, "stem_urls": stem_urls, "semitones": req.semitones}


# ---------------------------------------------------------------------------
# Transpose a single stem file path (for on-demand individual stem processing)
# ---------------------------------------------------------------------------

@router.get("/{job_id}/stems/{stem_name}/transpose/{semitones}")
async def get_transposed_stem(
    job_id: str, stem_name: str, semitones: float, db: Session = Depends(get_db)
):
    job = JobRepository(db).get(job_id)
    if not job or not job.stems:
        raise HTTPException(404, "Job no listo")
    stem_path = job.stems.get(stem_name)
    if not stem_path or not Path(stem_path).exists():
        raise HTTPException(404, f"Stem '{stem_name}' no encontrado")

    sign = "p" if semitones >= 0 else "m"
    out_path = stem_path.replace(".wav", f"_pitch_{sign}{abs(semitones):.1f}.wav")
    if not Path(out_path).exists():
        await pitch_shift(stem_path, out_path, semitones)
    return FileResponse(out_path, media_type="audio/wav")


# ---------------------------------------------------------------------------
# WebSocket – real-time progress
# ---------------------------------------------------------------------------

@router.websocket("/{job_id}/ws")
async def job_progress_ws(websocket: WebSocket, job_id: str):
    import asyncio

    await websocket.accept()
    db = next(get_db())
    try:
        repo = JobRepository(db)
        last_snapshot: dict | None = None

        while True:
            job = repo.get(job_id)
            if not job:
                await websocket.send_json({"error": "Job not found"})
                break

            snapshot = {
                "status": job.status,
                "progress": job.progress,
                "bpm": job.bpm,
                "stems": job.stems,
                "error_message": job.error_message,
            }
            if snapshot != last_snapshot:
                await websocket.send_json(snapshot)
                last_snapshot = snapshot

            if job.status in (JobStatus.DONE, JobStatus.FAILED):
                break

            await asyncio.sleep(1)

    except WebSocketDisconnect:
        pass
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _enqueue_job(job_id: str, ai_model: str) -> None:
    """Try RQ first; fall back to a daemon thread."""
    try:
        from redis import Redis
        from rq import Queue
        from app.workers.tasks import process_separation_job

        conn = Redis.from_url(settings.REDIS_URL)
        conn.ping()  # fail fast if Redis is down
        q = Queue(connection=conn)
        q.enqueue(
            process_separation_job,
            job_id,
            settings.DATABASE_URL,
            settings.STORAGE_BASE_PATH,
            ai_model,
            job_timeout=3600,
        )
    except Exception:
        from app.workers.tasks import process_separation_job

        t = threading.Thread(
            target=process_separation_job,
            args=(job_id, settings.DATABASE_URL, settings.STORAGE_BASE_PATH, ai_model),
            daemon=True,
        )
        t.start()

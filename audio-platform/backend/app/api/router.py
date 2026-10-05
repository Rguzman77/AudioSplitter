from fastapi import APIRouter

from app.api import jobs, youtube

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(jobs.router)
api_router.include_router(youtube.router)

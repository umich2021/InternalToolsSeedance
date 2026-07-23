import json
import time
from pathlib import Path

import httpx
from fastapi.concurrency import run_in_threadpool

from . import s3_client
from .config import settings
from .schemas import GenerateRequest, TaskStatusResponse, VideoRecord
from .seedance_client import SeedanceAPIError, seedance_client

VIDEOS_DIR = Path(__file__).resolve().parent.parent / "data" / "videos"
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_INDEX = VIDEOS_DIR / "index.json"

ARCHIVE_RETENTION_DAYS = 21
STUCK_ARCHIVING_SECONDS = 120
# BytePlus's video_url expires 24h after generation; stop retrying a bit early.
SOURCE_URL_SAFETY_MARGIN_SECONDS = 23 * 3600


def _load_video_index() -> list[dict]:
    if not VIDEO_INDEX.exists():
        return []
    return json.loads(VIDEO_INDEX.read_text())


def _save_video_index(items: list[dict]) -> None:
    VIDEO_INDEX.write_text(json.dumps(items, indent=2))


def _find(items: list[dict], task_id: str) -> dict | None:
    return next((v for v in items if v["id"] == task_id), None)


def create_video_entry(task_id: str, req: GenerateRequest) -> None:
    items = _load_video_index()
    items.append(
        {
            "id": task_id,
            "prompt": req.prompt,
            "model": req.model or settings.seedance_model,
            "ratio": req.ratio,
            "resolution": req.resolution,
            "duration": req.duration,
            "watermark": req.watermark,
            "generate_audio": req.generate_audio,
            "seed": req.seed,
            "reference_image_ids": req.reference_image_ids,
            "created_at": int(time.time()),
            "generation_status": "queued",
            "archive_status": "not_started",
            "s3_key": None,
            "content_type": None,
            "size_bytes": None,
            "archived_at": None,
            "archive_error": None,
            "last_known_video_url": None,
            "last_known_video_url_at": None,
            "archiving_started_at": None,
        }
    )
    _save_video_index(items)


def _update_video_entry(task_id: str, **fields) -> None:
    items = _load_video_index()
    entry = _find(items, task_id)
    if entry is None:
        return
    entry.update(fields)
    _save_video_index(items)


def on_task_polled(task_id: str, resp: TaskStatusResponse) -> str | None:
    """Synchronous (no `await` inside) so the load-check-flip-save sequence is
    atomic against concurrent pollers for the same task_id under asyncio's
    cooperative scheduling. Returns a video_url to archive, or None."""
    items = _load_video_index()
    entry = _find(items, task_id)
    if entry is None:
        return None

    entry["generation_status"] = resp.status
    video_url_to_archive = None

    if resp.status == "succeeded" and resp.content and resp.content.video_url:
        now = int(time.time())
        entry["last_known_video_url"] = resp.content.video_url
        entry["last_known_video_url_at"] = now
        if entry["archive_status"] in ("not_started", "failed"):
            entry["archive_status"] = "archiving"
            entry["archiving_started_at"] = now
            video_url_to_archive = resp.content.video_url

    _save_video_index(items)
    return video_url_to_archive


async def archive_video(task_id: str, video_url: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.get(video_url)
            r.raise_for_status()
        content_type = (r.headers.get("content-type") or "video/mp4").split(";")[0].strip()
        key = f"videos/{task_id}.mp4"
        await run_in_threadpool(s3_client.upload_bytes, key, r.content, content_type)
    except Exception as e:
        _update_video_entry(task_id, archive_status="failed", archive_error=str(e))
        return

    _update_video_entry(
        task_id,
        archive_status="archived",
        s3_key=key,
        content_type=content_type,
        size_bytes=len(r.content),
        archived_at=int(time.time()),
        archive_error=None,
    )


def _prune_expired() -> None:
    now = int(time.time())
    items = _load_video_index()
    kept = [
        e
        for e in items
        if not (e.get("archived_at") and now - e["archived_at"] > ARCHIVE_RETENTION_DAYS * 86400)
    ]
    if len(kept) != len(items):
        _save_video_index(kept)


def _retry_archive(task_id: str) -> str | None:
    items = _load_video_index()
    entry = _find(items, task_id)
    if not entry or not entry.get("last_known_video_url"):
        return None
    entry["archive_status"] = "archiving"
    entry["archiving_started_at"] = int(time.time())
    entry["archive_error"] = None
    _save_video_index(items)
    return entry["last_known_video_url"]


async def reconcile_pending() -> None:
    """Called whenever the gallery is loaded. Catches up any generation that
    finished while nobody was polling it (e.g. tab closed mid-generation),
    retries archives that got stuck or previously failed (while the source
    video_url is still likely valid), and prunes index entries whose S3
    object the lifecycle rule will already have deleted."""
    _prune_expired()

    items = _load_video_index()
    pending_ids = [e["id"] for e in items if e["generation_status"] in ("queued", "running")]

    to_archive: list[tuple[str, str]] = []

    for task_id in pending_ids:
        try:
            result = await seedance_client.get_task(task_id)
        except SeedanceAPIError:
            continue
        video_url = on_task_polled(task_id, TaskStatusResponse(**result))
        if video_url:
            to_archive.append((task_id, video_url))

    now = int(time.time())
    for entry in _load_video_index():
        if entry["archive_status"] == "archiving":
            started = entry.get("archiving_started_at")
            if started and now - started > STUCK_ARCHIVING_SECONDS:
                video_url = _retry_archive(entry["id"])
                if video_url:
                    to_archive.append((entry["id"], video_url))
        elif entry["archive_status"] == "failed":
            fetched_at = entry.get("last_known_video_url_at")
            if fetched_at and now - fetched_at < SOURCE_URL_SAFETY_MARGIN_SECONDS:
                video_url = _retry_archive(entry["id"])
                if video_url:
                    to_archive.append((entry["id"], video_url))

    for task_id, video_url in to_archive:
        await archive_video(task_id, video_url)


def list_video_records() -> list[VideoRecord]:
    items = sorted(_load_video_index(), key=lambda e: e["created_at"], reverse=True)
    records = []
    for e in items:
        video_url = None
        if e["archive_status"] == "archived" and e.get("s3_key"):
            video_url = s3_client.presigned_get_url(e["s3_key"])
        records.append(VideoRecord(**{**e, "video_url": video_url}))
    return records


def get_video_url(task_id: str) -> str | None:
    entry = _find(_load_video_index(), task_id)
    if not entry or entry["archive_status"] != "archived" or not entry.get("s3_key"):
        return None
    return s3_client.presigned_get_url(entry["s3_key"])


def delete_video(task_id: str) -> bool:
    items = _load_video_index()
    entry = _find(items, task_id)
    if entry is None:
        return False
    if entry.get("s3_key"):
        s3_client.delete_object(entry["s3_key"])
    _save_video_index([v for v in items if v["id"] != task_id])
    return True

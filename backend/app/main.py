import json
import re
import uuid
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from . import video_archive
from .config import settings
from .schemas import GenerateRequest, GenerateResponse, ReferenceImage, TaskStatusResponse, VideoRecord
from .seedance_client import SeedanceAPIError, seedance_client

app = FastAPI(title="Seedance API Wrapper")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

REFERENCE_IMAGES_DIR = Path(__file__).resolve().parent.parent / "data" / "reference_images"
REFERENCE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
REFERENCE_IMAGES_INDEX = REFERENCE_IMAGES_DIR / "index.json"


def _load_reference_index() -> list[dict]:
    if not REFERENCE_IMAGES_INDEX.exists():
        return []
    return json.loads(REFERENCE_IMAGES_INDEX.read_text())


def _save_reference_index(items: list[dict]) -> None:
    REFERENCE_IMAGES_INDEX.write_text(json.dumps(items, indent=2))


@app.get("/api/health")
async def health():
    return {"ok": True, "api_key_configured": bool(settings.ark_api_key)}


@app.get("/api/models")
async def list_models():
    return {
        "models": [
            {"id": settings.seedance_model_mini, "label": "Mini (cheapest, fastest)"},
            {"id": settings.seedance_model_fast, "label": "Fast"},
            {"id": settings.seedance_model_regular, "label": "Regular (highest quality)"},
        ],
        "default": settings.seedance_model_fast,
    }


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    content: list[dict] = [{"type": "text", "text": req.prompt}]
    for image in req.images:
        content.append({"type": "image_url", "image_url": {"url": image.url}, "role": image.role})

    payload = {
        "model": req.model or settings.seedance_model,
        "content": content,
        "ratio": req.ratio,
        "resolution": req.resolution,
        "duration": req.duration,
        "watermark": req.watermark,
        "generate_audio": req.generate_audio,
        "return_last_frame": req.return_last_frame,
    }
    if req.seed is not None:
        payload["seed"] = req.seed

    try:
        result = await seedance_client.create_task(payload)
    except SeedanceAPIError as e:
        raise HTTPException(status_code=e.status_code if e.status_code < 600 else 502, detail=e.detail)

    task_id = result.get("id")
    if not task_id:
        raise HTTPException(status_code=502, detail=f"Unexpected response from Seedance API: {result}")
    video_archive.create_video_entry(task_id, req)
    return GenerateResponse(task_id=task_id)


@app.get("/api/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task(task_id: str, background_tasks: BackgroundTasks):
    try:
        result = await seedance_client.get_task(task_id)
    except SeedanceAPIError as e:
        raise HTTPException(status_code=e.status_code if e.status_code < 600 else 502, detail=e.detail)
    resp = TaskStatusResponse(**result)
    video_url = video_archive.on_task_polled(task_id, resp)
    if video_url:
        background_tasks.add_task(video_archive.archive_video, task_id, video_url)
    return resp


@app.get("/api/reference-images", response_model=list[ReferenceImage])
async def list_reference_images():
    return [
        ReferenceImage(id=i["id"], name=i["name"], content_type=i["content_type"])
        for i in _load_reference_index()
    ]


@app.post("/api/reference-images", response_model=ReferenceImage)
async def save_reference_image(file: UploadFile = File(...), name: str = Form(...)):
    image_id = uuid.uuid4().hex
    ext = Path(file.filename or "").suffix or ".png"
    dest = REFERENCE_IMAGES_DIR / f"{image_id}{ext}"
    dest.write_bytes(await file.read())

    entry = {
        "id": image_id,
        "name": name,
        "content_type": file.content_type or "image/png",
        "filename": dest.name,
    }
    items = _load_reference_index()
    items.append(entry)
    _save_reference_index(items)
    return ReferenceImage(id=entry["id"], name=entry["name"], content_type=entry["content_type"])


@app.get("/api/reference-images/{image_id}/file")
async def get_reference_image_file(image_id: str):
    entry = next((i for i in _load_reference_index() if i["id"] == image_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Reference image not found")
    path = REFERENCE_IMAGES_DIR / entry["filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Reference image file missing on disk")
    return FileResponse(path, media_type=entry["content_type"])


@app.delete("/api/reference-images/{image_id}")
async def delete_reference_image(image_id: str):
    items = _load_reference_index()
    entry = next((i for i in items if i["id"] == image_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Reference image not found")
    (REFERENCE_IMAGES_DIR / entry["filename"]).unlink(missing_ok=True)
    _save_reference_index([i for i in items if i["id"] != image_id])
    return {"ok": True}


@app.get("/api/videos", response_model=list[VideoRecord])
async def list_videos():
    await video_archive.reconcile_pending()
    return video_archive.list_video_records()


@app.get("/api/videos/{video_id}/url")
async def get_video_url(video_id: str):
    video_url = video_archive.get_video_url(video_id)
    if not video_url:
        raise HTTPException(status_code=404, detail="Video not archived (yet) or not found")
    return {"video_url": video_url}


@app.delete("/api/videos/{video_id}")
async def delete_video(video_id: str):
    deleted = await run_in_threadpool(video_archive.delete_video, video_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"ok": True}


def _is_allowed_download_host(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    if not host:
        return False
    ark_host = (urlparse(settings.ark_base_url).hostname or "").lower()
    if ark_host and host == ark_host:
        return True
    # S3 (archived videos) and BytePlus/Volcengine's TOS object storage,
    # which is where their `video_url` actually points — a different host
    # entirely from the ARK API base URL.
    return host.endswith(".amazonaws.com") or host.endswith(".volces.com")


def _sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r'[\r\n"]', "", filename).strip()
    return cleaned or "seedance-video.mp4"


def _content_disposition(filename: str) -> str:
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii") or "video.mp4"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


@app.get("/api/download")
async def download_proxy(url: str, filename: str = "seedance-video.mp4"):
    # Fetches an arbitrary caller-supplied URL server-side (to sidestep
    # browser CORS restrictions on the video sources), so the target host
    # must be restricted to avoid this becoming an open SSRF proxy.
    if not _is_allowed_download_host(url):
        raise HTTPException(status_code=400, detail="URL host not allowed")

    safe_filename = _sanitize_filename(filename)
    client = httpx.AsyncClient(timeout=60, follow_redirects=True)
    try:
        upstream = await client.send(client.build_request("GET", url), stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Could not reach source: {e}")

    if upstream.status_code >= 300:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Source returned {upstream.status_code}")

    async def stream():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    content_type = (upstream.headers.get("content-type") or "video/mp4").split(";")[0].strip()
    return StreamingResponse(
        stream(),
        media_type=content_type,
        headers={"Content-Disposition": _content_disposition(safe_filename)},
    )

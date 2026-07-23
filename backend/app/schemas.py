from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["first_frame", "last_frame", "reference_image", "reference_video", "reference_audio"]


class ImageInput(BaseModel):
    # Either a remote URL or a base64 data URI (e.g. "data:image/png;base64,....")
    url: str
    role: Role = "first_frame"


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=3500)
    model: Optional[str] = None
    images: list[ImageInput] = Field(default_factory=list)
    reference_image_ids: list[str] = Field(default_factory=list)

    ratio: Literal["16:9", "9:16", "4:3", "3:4", "21:9", "1:1", "adaptive"] = "16:9"
    resolution: Literal["480p", "720p", "1080p", "2K"] = "720p"
    duration: int = Field(default=4, ge=4, le=15)
    watermark: bool = False
    generate_audio: bool = True
    return_last_frame: bool = False
    seed: Optional[int] = None


class GenerateResponse(BaseModel):
    task_id: str


class ReferenceImage(BaseModel):
    id: str
    name: str
    content_type: str


class TaskContent(BaseModel):
    video_url: Optional[str] = None


class TaskError(BaseModel):
    code: Optional[str] = None
    message: Optional[str] = None


class TaskStatusResponse(BaseModel):
    id: str
    status: str
    content: Optional[TaskContent] = None
    error: Optional[TaskError] = None
    created_at: Optional[int] = None


class VideoRecord(BaseModel):
    id: str
    prompt: str
    model: str
    ratio: str
    resolution: str
    duration: int
    watermark: bool
    generate_audio: bool
    seed: Optional[int] = None
    reference_image_ids: list[str] = Field(default_factory=list)
    created_at: int
    generation_status: str
    archive_status: str
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    archived_at: Optional[int] = None
    archive_error: Optional[str] = None
    video_url: Optional[str] = None

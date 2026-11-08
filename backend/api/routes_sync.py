import mimetypes
import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from urllib.parse import unquote
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from core.auth import require_mobile_auth
from core.config_manager import config_manager, ensure_sync_directories, DEFAULT_SYNC_DIR
from core.logger import logger_bus

router = APIRouter(prefix="/api/sync", tags=["CameraSync"], dependencies=[Depends(require_mobile_auth)])

IMAGE_EXTS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
    ".heic", ".heif", ".dng", ".raw", ".avif", ".tiff", ".tif", ".svg",
}
VIDEO_EXTS = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm", ".3gp",
    ".m4v", ".mpeg", ".mpg", ".wmv", ".flv",
}
MIME_EXT_MAP = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "video/3gpp": ".3gp",
    "video/webm": ".webm",
    "application/pdf": ".pdf",
}

INVALID_WIN_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def get_sync_dir_and_mode() -> tuple[Path, bool]:
    cfg = config_manager.load()
    raw = cfg.sync_dir or os.getenv("SYNC_DIR", DEFAULT_SYNC_DIR)
    target = ensure_sync_directories(raw, cfg.sync_auto_sort)
    return target, cfg.sync_auto_sort


def resolve_clean_filename(
    raw_filename: Optional[str],
    filename_hint: Optional[str],
    content_type: Optional[str],
) -> str:
    candidate = (raw_filename or "").strip()
    hint = (filename_hint or "").strip()

    # Decode URL-encoded SAF names like image%3A1000012345 if needed
    candidate_decoded = os.path.basename(unquote(candidate)) if candidate else ""
    hint_decoded = os.path.basename(unquote(hint)) if hint else ""

    # Prefer hint if candidate is generic ('upload', 'blob') or lacks an extension while hint has one
    chosen = candidate_decoded
    if (not chosen or chosen.lower() in {"upload", "file", "blob"} or not Path(chosen).suffix) and hint_decoded:
        if Path(hint_decoded).suffix or not chosen:
            chosen = hint_decoded

    if not chosen:
        chosen = f"phone_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    chosen = INVALID_WIN_CHARS.sub("_", chosen).strip(" .")
    if not chosen:
        chosen = f"phone_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # Ensure extension exists if content_type gives us one
    if not Path(chosen).suffix and content_type:
        ct = content_type.split(";")[0].strip().lower()
        ext = MIME_EXT_MAP.get(ct) or mimetypes.guess_extension(ct) or ""
        if ext == ".jpe":
            ext = ".jpg"
        if ext:
            chosen = f"{chosen}{ext}"

    return chosen


def classify_vault_subfolder(filename: str, content_type: Optional[str]) -> str:
    ext = Path(filename).suffix.lower()
    ct = (content_type or "").split(";")[0].strip().lower()

    if ext in IMAGE_EXTS or ct.startswith("image/"):
        return "Photos"
    if ext in VIDEO_EXTS or ct.startswith("video/"):
        return "Videos"
    return "Files"


def resolve_unique_dest(dest_dir: Path, clean_name: str, file_hash: Optional[str] = None) -> Path:
    dest_path = dest_dir / clean_name
    if not dest_path.exists():
        return dest_path

    stem = dest_path.stem
    suffix = dest_path.suffix

    if file_hash:
        short_hash = file_hash[:8]
        if stem.endswith(f"_{short_hash}"):
            return dest_path
        hashed_candidate = dest_dir / f"{stem}_{short_hash}{suffix}"
        if not hashed_candidate.exists():
            return hashed_candidate
        return hashed_candidate

    counter = 1
    while True:
        candidate = dest_dir / f"{stem}_{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


async def store_uploaded_file(
    upload: UploadFile,
    dest_dir: Path,
    filename_hint: Optional[str] = None,
    file_hash: Optional[str] = None,
    log_source: str = "CAM_SYNC",
) -> Dict[str, Any]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    clean_name = resolve_clean_filename(upload.filename, filename_hint, upload.content_type)
    dest_path = resolve_unique_dest(dest_dir, clean_name, file_hash=file_hash)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(upload.file, buffer, length=1024 * 1024)

    size_bytes = dest_path.stat().st_size
    size_kb = round(size_bytes / 1024, 1)
    await logger_bus.log(
        "EXEC",
        log_source,
        f"Saved '{dest_path.name}' ({size_kb} KB)",
        f"dest: {dest_dir}",
    )
    return {
        "status": "stored",
        "filename": dest_path.name,
        "path": str(dest_path),
        "folder": str(dest_dir),
        "size_bytes": size_bytes,
        "size_kb": size_kb,
        "file_hash": file_hash,
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/status")
async def get_sync_status():
    sync_dir, auto_sort = get_sync_dir_and_mode()
    all_files = [f for f in sync_dir.rglob("*") if f.is_file()]
    total_bytes = sum(f.stat().st_size for f in all_files)

    photos_dir = sync_dir / "Photos"
    videos_dir = sync_dir / "Videos"
    files_dir = sync_dir / "Files"

    photos_count = sum(1 for f in photos_dir.rglob("*") if f.is_file()) if photos_dir.exists() else 0
    videos_count = sum(1 for f in videos_dir.rglob("*") if f.is_file()) if videos_dir.exists() else 0
    other_count = sum(1 for f in files_dir.rglob("*") if f.is_file()) if files_dir.exists() else 0

    return {
        "sync_dir": str(sync_dir),
        "auto_sort": auto_sort,
        "file_count": len(all_files),
        "photos_count": photos_count,
        "videos_count": videos_count,
        "files_count": other_count,
        "total_mb": round(total_bytes / (1024 * 1024), 2),
    }


@router.post("/upload")
async def upload_media_file(
    file: UploadFile = File(...),
    asset_id: Optional[str] = Form(None),
    file_hash: Optional[str] = Form(None),
    created_at: Optional[str] = Form(None),
    filename_hint: Optional[str] = Form(None),
):
    sync_dir, auto_sort = get_sync_dir_and_mode()
    clean_name = resolve_clean_filename(file.filename, filename_hint, file.content_type)
    subfolder = classify_vault_subfolder(clean_name, file.content_type) if auto_sort else ""
    target_dir = (sync_dir / subfolder) if subfolder else sync_dir

    try:
        saved = await store_uploaded_file(
            upload=file,
            dest_dir=target_dir,
            filename_hint=clean_name,
            file_hash=file_hash,
            log_source="PHONE_VAULT",
        )
        saved["category"] = subfolder or "Root"
        saved["asset_id"] = asset_id
        saved["created_at"] = created_at
        return saved
    except Exception as exc:
        await logger_bus.log("ERROR", "PHONE_VAULT", f"Failed saving '{clean_name}': {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from core.auth import require_mobile_auth
from core.logger import logger_bus

router = APIRouter(prefix="/api/sync", tags=["CameraSync"], dependencies=[Depends(require_mobile_auth)])


def get_sync_dir() -> Path:
    raw = os.getenv("SYNC_DIR", r"C:\CommandCenter\Sync")
    target = Path(raw)
    target.mkdir(parents=True, exist_ok=True)
    return target


@router.get("/status")
async def get_sync_status():
    sync_dir = get_sync_dir()
    files = [f for f in sync_dir.iterdir() if f.is_file()]
    total_bytes = sum(f.stat().st_size for f in files)
    return {
        "sync_dir": str(sync_dir),
        "file_count": len(files),
        "total_mb": round(total_bytes / (1024 * 1024), 2),
    }


@router.post("/upload")
async def upload_media_file(
    file: UploadFile = File(...),
    asset_id: Optional[str] = Form(None),
    file_hash: Optional[str] = Form(None),
    created_at: Optional[str] = Form(None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename in upload.")

    sync_dir = get_sync_dir()
    safe_name = os.path.basename(file.filename)
    dest_path = sync_dir / safe_name

    # Prevent accidental overwrite of a different file with the same name unless identical size/hash
    if dest_path.exists() and file_hash:
        stem = dest_path.stem
        suffix = dest_path.suffix
        short_hash = file_hash[:8]
        if not stem.endswith(f"_{short_hash}"):
            dest_path = sync_dir / f"{stem}_{short_hash}{suffix}"

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        size_kb = round(dest_path.stat().st_size / 1024, 1)
        await logger_bus.log(
            "EXEC",
            "CAM_SYNC",
            f"Synced media '{dest_path.name}' ({size_kb} KB)",
            f"dest: {sync_dir}",
        )
        return {
            "status": "stored",
            "filename": dest_path.name,
            "path": str(dest_path),
            "size_kb": size_kb,
            "asset_id": asset_id,
            "file_hash": file_hash,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as exc:
        await logger_bus.log("ERROR", "CAM_SYNC", f"Failed saving '{safe_name}': {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


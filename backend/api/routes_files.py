import mimetypes
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from core.auth import require_mobile_auth
from core.config_manager import config_manager
from core.logger import logger_bus

router = APIRouter(prefix="/api/files", tags=["Files"], dependencies=[Depends(require_mobile_auth)])


def _is_path_whitelisted(target_path: str, whitelisted_roots: List[str]) -> bool:
    try:
        resolved_target = os.path.abspath(target_path).lower()
        for root in whitelisted_roots:
            resolved_root = os.path.abspath(root).lower()
            if resolved_target == resolved_root or resolved_target.startswith(resolved_root + os.sep):
                return True
        return False
    except Exception:
        return False


def _classify_file(ext: str) -> str:
    ext = ext.lower()
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
        return "image"
    if ext in {".mp4", ".mkv", ".mov", ".avi", ".webm"}:
        return "video"
    if ext in {".pdf"}:
        return "pdf"
    if ext in {".py", ".ts", ".tsx", ".js", ".json", ".md", ".txt", ".log", ".yml", ".yaml", ".env"}:
        return "code"
    return "binary"


@router.get("/roots")
async def list_whitelisted_roots():
    cfg = config_manager.load()
    roots = []
    for raw_path in cfg.whitelisted_paths:
        norm = os.path.abspath(raw_path)
        exists = os.path.exists(norm) and os.path.isdir(norm)
        roots.append(
            {
                "name": os.path.basename(norm) or norm,
                "path": norm,
                "exists": exists,
            }
        )
    return {"roots": roots}


@router.get("/browse")
async def browse_directory(path: str = Query(..., description="Absolute Windows directory path")):
    cfg = config_manager.load()
    norm_path = os.path.abspath(path.strip())

    if not _is_path_whitelisted(norm_path, cfg.whitelisted_paths):
        await logger_bus.log(
            "WARN",
            "FILE_ACL",
            f"Blocked non-whitelisted directory browse attempt: '{norm_path}'",
        )
        raise HTTPException(status_code=403, detail="Directory is outside whitelisted PC paths.")

    if not os.path.exists(norm_path) or not os.path.isdir(norm_path):
        raise HTTPException(status_code=404, detail="Directory does not exist on PC.")

    entries: List[Dict[str, Any]] = []
    try:
        with os.scandir(norm_path) as it:
            for entry in it:
                try:
                    stat = entry.stat()
                    is_dir = entry.is_dir()
                    ext = Path(entry.name).suffix if not is_dir else ""
                    entries.append(
                        {
                            "name": entry.name,
                            "path": entry.path,
                            "is_dir": is_dir,
                            "size_bytes": 0 if is_dir else stat.st_size,
                            "modified_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                            "category": "folder" if is_dir else _classify_file(ext),
                            "extension": ext.lower(),
                        }
                    )
                except PermissionError:
                    continue
    except PermissionError:
        raise HTTPException(status_code=403, detail="OS Permission Denied reading directory.")

    # Sort folders first, then alphabetically
    entries.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

    # Determine if parent directory is also whitelisted
    parent_path = str(Path(norm_path).parent)
    can_go_up = (
        parent_path.lower() != norm_path.lower()
        and _is_path_whitelisted(parent_path, cfg.whitelisted_paths)
    )

    await logger_bus.log(
        "INFO",
        "FILE_EXP",
        f"Listed {len(entries)} items in '{norm_path}'",
    )

    return {
        "current_path": norm_path,
        "parent_path": parent_path if can_go_up else None,
        "entries": entries,
    }


@router.get("/download")
async def download_or_stream_file(path: str = Query(..., description="Absolute Windows file path")):
    cfg = config_manager.load()
    norm_path = os.path.abspath(path.strip())

    if not _is_path_whitelisted(norm_path, cfg.whitelisted_paths):
        await logger_bus.log(
            "WARN",
            "FILE_ACL",
            f"Blocked non-whitelisted file download attempt: '{norm_path}'",
        )
        raise HTTPException(status_code=403, detail="File is outside whitelisted PC paths.")

    if not os.path.exists(norm_path) or not os.path.isfile(norm_path):
        raise HTTPException(status_code=404, detail="File not found on PC.")

    mime_type, _ = mimetypes.guess_type(norm_path)
    await logger_bus.log(
        "EXEC",
        "FILE_STREAM",
        f"Streaming file '{os.path.basename(norm_path)}' to mobile client",
        norm_path,
    )
    return FileResponse(
        path=norm_path,
        media_type=mime_type or "application/octet-stream",
        filename=os.path.basename(norm_path),
    )


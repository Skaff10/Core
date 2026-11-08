import mimetypes
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from core.auth import require_mobile_auth
from core.config_manager import config_manager, ensure_sync_directories, CoreConfig
from core.logger import logger_bus
from api.routes_sync import (
    store_uploaded_file,
    get_sync_dir_and_mode,
    resolve_clean_filename,
    classify_vault_subfolder,
)
from services.transfer_manager import transfer_manager

router = APIRouter(prefix="/api/files", tags=["Files"], dependencies=[Depends(require_mobile_auth)])


def _get_effective_roots(cfg: CoreConfig) -> List[str]:
    roots = list(cfg.whitelisted_paths)
    if cfg.sync_dir:
        ensure_sync_directories(cfg.sync_dir, cfg.sync_auto_sort)
        norm_sync = os.path.abspath(cfg.sync_dir.strip())
        if norm_sync.lower() not in {os.path.abspath(p).lower() for p in roots}:
            roots.append(norm_sync)
    return roots


def _is_path_whitelisted(target_path: str, whitelisted_roots: List[str]) -> bool:
    try:
        resolved_target = os.path.abspath(target_path).lower()
        for root in whitelisted_roots:
            resolved_root = os.path.abspath(root).lower()
            sep_root = resolved_root if resolved_root.endswith(os.sep) else resolved_root + os.sep
            if resolved_target == resolved_root or resolved_target.startswith(sep_root):
                return True
        return False
    except Exception:
        return False


def _classify_file(ext: str) -> str:
    ext = ext.lower()
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif", ".avif"}:
        return "image"
    if ext in {".mp4", ".mkv", ".mov", ".avi", ".webm", ".3gp", ".m4v"}:
        return "video"
    if ext in {".pdf"}:
        return "pdf"
    if ext in {".py", ".ts", ".tsx", ".js", ".json", ".md", ".txt", ".log", ".yml", ".yaml", ".env"}:
        return "code"
    return "binary"


@router.get("/roots")
async def list_whitelisted_roots():
    cfg = config_manager.load()
    effective_roots = _get_effective_roots(cfg)
    sync_norm = os.path.abspath(cfg.sync_dir.strip()).lower() if cfg.sync_dir else ""
    roots = []
    for raw_path in effective_roots:
        norm = os.path.abspath(raw_path)
        exists = os.path.exists(norm) and os.path.isdir(norm)
        is_vault = norm.lower() == sync_norm
        base_label = os.path.basename(norm) or norm
        roots.append(
            {
                "name": f"{base_label} (Phone Vault)" if is_vault else base_label,
                "path": norm,
                "exists": exists,
                "is_vault": is_vault,
            }
        )
    return {"roots": roots, "sync_dir": os.path.abspath(cfg.sync_dir) if cfg.sync_dir else None}


@router.get("/browse")
async def browse_directory(path: str = Query(..., description="Absolute Windows directory path")):
    cfg = config_manager.load()
    allowed_roots = _get_effective_roots(cfg)
    norm_path = os.path.abspath(path.strip())

    if not _is_path_whitelisted(norm_path, allowed_roots):
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

    entries.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

    parent_path = str(Path(norm_path).parent)
    can_go_up = (
        parent_path.lower() != norm_path.lower()
        and _is_path_whitelisted(parent_path, allowed_roots)
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


@router.post("/upload")
async def upload_file_from_mobile(
    file: UploadFile = File(...),
    target_dir: Optional[str] = Form(None),
    filename_hint: Optional[str] = Form(None),
    file_hash: Optional[str] = Form(None),
):
    cfg = config_manager.load()
    allowed_roots = _get_effective_roots(cfg)

    if target_dir and target_dir.strip():
        norm_dir = os.path.abspath(target_dir.strip())
        if not _is_path_whitelisted(norm_dir, allowed_roots):
            await logger_bus.log(
                "WARN",
                "FILE_ACL",
                f"Blocked non-whitelisted file upload attempt into '{norm_dir}'",
            )
            raise HTTPException(status_code=403, detail="Target directory is outside whitelisted PC paths.")
        if not os.path.exists(norm_dir) or not os.path.isdir(norm_dir):
            raise HTTPException(status_code=404, detail="Target PC directory does not exist.")
        dest_dir = Path(norm_dir)
    else:
        sync_dir, auto_sort = get_sync_dir_and_mode()
        clean_name = resolve_clean_filename(file.filename, filename_hint, file.content_type)
        subfolder = classify_vault_subfolder(clean_name, file.content_type) if auto_sort else ""
        dest_dir = (sync_dir / subfolder) if subfolder else sync_dir

    try:
        return await store_uploaded_file(
            upload=file,
            dest_dir=dest_dir,
            filename_hint=filename_hint,
            file_hash=file_hash,
            log_source="FILE_UPLOAD",
        )
    except Exception as exc:
        await logger_bus.log("ERROR", "FILE_UPLOAD", f"Upload failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/download")
async def download_or_stream_file(path: str = Query(..., description="Absolute Windows file path")):
    cfg = config_manager.load()
    allowed_roots = _get_effective_roots(cfg)
    norm_path = os.path.abspath(path.strip())

    if not _is_path_whitelisted(norm_path, allowed_roots):
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


@router.get("/transfers/pending")
async def get_pending_transfers():
    """
    Returns files queued for mobile delivery (e.g. from Windows Explorer Right-Click).
    """
    pending = transfer_manager.get_pending()
    return {"transfers": pending}


@router.get("/transfers/{transfer_id}/download")
async def download_transfer_file(transfer_id: str):
    """
    Streams a file queued via 'Send to Mobile' to the authenticated mobile device.
    """
    transfer = transfer_manager.get_transfer(transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found or expired.")

    if not os.path.exists(transfer.file_path) or not os.path.isfile(transfer.file_path):
        transfer_manager.delete_transfer(transfer_id)
        raise HTTPException(status_code=404, detail="Source file no longer exists on PC.")

    await logger_bus.log(
        "EXEC",
        "PC_TO_MOBILE",
        f"Delivering '{transfer.filename}' to phone ({transfer.file_size} bytes)",
        transfer.file_path,
    )
    transfer_manager.mark_downloaded(transfer_id)
    return FileResponse(
        path=transfer.file_path,
        media_type=transfer.mime_type,
        filename=transfer.filename,
    )


@router.post("/transfers/{transfer_id}/ack")
async def acknowledge_transfer(transfer_id: str):
    """
    Called by mobile after saving the file to clear it from pending queue.
    """
    transfer = transfer_manager.get_transfer(transfer_id)
    if transfer:
        transfer_manager.delete_transfer(transfer_id)
        await logger_bus.log(
            "INFO",
            "PC_TO_MOBILE",
            f"Phone confirmed receipt & save of '{transfer.filename}'",
            transfer.file_path,
        )
    return {"success": True, "transfer_id": transfer_id}


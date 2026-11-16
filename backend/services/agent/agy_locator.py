import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from core.config_manager import config_manager


def get_antigravity_data_dir() -> Path:
    cfg = config_manager.load()
    sub = (cfg.agy_app_data_dir or "antigravity").strip()
    p = Path(sub)
    if p.is_absolute():
        return p
    return Path.home() / ".gemini" / sub


def get_conversation_db_signature(session_id: str) -> Optional[str]:
    """
    Returns a compact string signature (mtime_ns + size) for the Antigravity
    conversation .db and .db-wal files on disk so we detect PC-side edits.
    """
    if not session_id:
        return None
    conv_dir = get_antigravity_data_dir() / "conversations"
    db_file = conv_dir / f"{session_id}.db"
    wal_file = conv_dir / f"{session_id}.db-wal"

    parts = []
    for path in (db_file, wal_file):
        try:
            if path.is_file():
                st = path.stat()
                parts.append(f"{path.name}:{st.st_mtime_ns}:{st.st_size}")
        except OSError:
            continue

    return "|".join(parts) if parts else None


def locate_agy_binary() -> Dict[str, Any]:
    cfg = config_manager.load()
    candidate_paths = []

    if cfg.agy_path and os.path.isfile(cfg.agy_path):
        candidate_paths.append(Path(cfg.agy_path))

    which_path = shutil.which("agy") or shutil.which("agy.exe")
    if which_path:
        candidate_paths.append(Path(which_path))

    home_gemini = Path.home() / ".gemini" / "bin" / "agy.exe"
    if home_gemini.exists():
        candidate_paths.append(home_gemini)

    # Alternate windows locations
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        alt_path = Path(local_app_data) / "Programs" / "Antigravity" / "bin" / "agy.exe"
        if alt_path.exists():
            candidate_paths.append(alt_path)

    for path in candidate_paths:
        if path.is_file():
            resolved = str(path.resolve())
            version = _get_version(path)
            return {
                "found": True,
                "path": resolved,
                "version": version or "unknown",
            }

    return {
        "found": False,
        "path": None,
        "version": None,
    }


def _get_version(exe_path: Path) -> Optional[str]:
    # 1. Check adjacent agy.version.json
    version_json = exe_path.parent / "agy.version.json"
    if version_json.is_file():
        try:
            with open(version_json, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "version" in data:
                    return str(data["version"])
        except Exception:
            pass

    # 2. Try executing agy --version or reading changelog
    try:
        proc = subprocess.run(
            [str(exe_path), "--version"],
            capture_output=True,
            text=True,
            timeout=3,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        out = (proc.stdout or proc.stderr or "").strip()
        if out:
            return out.splitlines()[0]
    except Exception:
        pass

    return None


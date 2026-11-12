import hashlib
import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from urllib.parse import unquote

try:
    import pygetwindow as gw
    HAS_GW = True
except ImportError:
    HAS_GW = False


def normalize_cwd(raw: Optional[str]) -> str:
    """
    Normalizes chaotic CWD formats from Antigravity ACP into canonical Windows absolute path:
      - /f%3A/Temporary%20Codebae/Core -> F:\\Temporary Codebae\\Core
      - /d%3A/FTune -> D:\\FTune
      - /C:/Users/skaf/... -> C:\\Users\\skaf\\...
      - F:\\Temporary Codebae\\Core -> F:\\Temporary Codebae\\Core
    """
    if not raw or not raw.strip():
        return ""

    cleaned = unquote(raw.strip())

    # Fix leading slash before Windows drive letter: e.g. /f:/... or /F:/... or /c:/...
    match = re.match(r"^/([a-zA-Z]):(.*)$", cleaned)
    if match:
        drive_letter = match.group(1).upper()
        rest = match.group(2)
        cleaned = f"{drive_letter}:{rest}"

    # Replace forward slashes with backslashes on Windows
    cleaned = cleaned.replace("/", "\\")

    try:
        norm = os.path.normpath(cleaned)
        # Ensure drive letter is uppercase
        if len(norm) >= 2 and norm[1] == ":":
            norm = norm[0].upper() + norm[1:]
        return norm
    except Exception:
        return cleaned


def compute_project_id(normalized_path: str) -> str:
    """
    Produces deterministic 12-char identifier for a workspace directory.
    Case-insensitive on Windows.
    """
    canonical = normalized_path.lower().strip()
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]


def is_scratch_or_internal(normalized_path: str) -> bool:
    """
    Filters out internal scratch and brain working directories from the project selector.
    """
    lower = normalized_path.lower()
    if "\\.gemini\\antigravity\\brain\\" in lower:
        return True
    if "\\.gemini\\tmp" in lower:
        return True
    if "\\appdata\\local\\temp" in lower:
        return True
    return False


def get_open_window_titles() -> List[str]:
    """
    Collects active desktop window titles to detect which projects are open on PC.
    """
    titles: List[str] = []
    if HAS_GW:
        try:
            for w in gw.getAllWindows():
                if w.title and w.title.strip():
                    titles.append(w.title.strip())
        except Exception:
            pass
    return titles


def group_sessions_by_project(
    raw_sessions: List[Dict[str, Any]],
    running_session_ids: Optional[set] = None,
    awaiting_permission_ids: Optional[set] = None,
) -> List[Dict[str, Any]]:
    """
    Groups ACP sessions into rich Project workspaces.
    """
    running_set = running_session_ids or set()
    perm_set = awaiting_permission_ids or set()
    open_windows = get_open_window_titles()

    projects_map: Dict[str, Dict[str, Any]] = {}

    for s in raw_sessions:
        raw_cwd = s.get("cwd", "")
        norm_cwd = normalize_cwd(raw_cwd)
        if not norm_cwd or is_scratch_or_internal(norm_cwd):
            continue

        pid = compute_project_id(norm_cwd)
        path_obj = Path(norm_cwd)
        dir_name = path_obj.name or norm_cwd
        dir_exists = path_obj.is_dir()

        sid = s.get("sessionId", "")
        updated_at = s.get("updatedAt", "")
        title = s.get("title") or "Untitled Session"

        is_running = sid in running_set
        is_awaiting_perm = sid in perm_set

        session_entry = {
            "sessionId": sid,
            "title": title,
            "cwd": norm_cwd,
            "updatedAt": updated_at,
            "isRunning": is_running,
            "isAwaitingPermission": is_awaiting_perm,
        }

        if pid not in projects_map:
            # Heuristic for open_on_pc: check if window title contains folder name or Antigravity
            open_on_pc = any(
                dir_name.lower() in wt.lower() for wt in open_windows
            )

            projects_map[pid] = {
                "id": pid,
                "name": dir_name,
                "path": norm_cwd,
                "exists": dir_exists,
                "openOnPc": open_on_pc,
                "sessionCount": 0,
                "lastActivity": updated_at,
                "hasRunningTurn": is_running,
                "hasPendingPermission": is_awaiting_perm,
                "sessions": [],
            }

        proj = projects_map[pid]
        proj["sessions"].append(session_entry)
        proj["sessionCount"] += 1

        if is_running:
            proj["hasRunningTurn"] = True
        if is_awaiting_perm:
            proj["hasPendingPermission"] = True

        if updated_at and (not proj["lastActivity"] or updated_at > proj["lastActivity"]):
            proj["lastActivity"] = updated_at

    # Sort sessions newest first in each project
    for proj in projects_map.values():
        proj["sessions"].sort(
            key=lambda item: item.get("updatedAt") or "",
            reverse=True,
        )

    # Sort projects newest activity first
    sorted_projects = sorted(
        projects_map.values(),
        key=lambda item: item.get("lastActivity") or "",
        reverse=True,
    )

    return sorted_projects


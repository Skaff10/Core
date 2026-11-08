import os
import time
from datetime import datetime
from typing import Dict, Any

import psutil
import pygetwindow as gw

try:
    import win32process
    import win32gui
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False


def get_foreground_telemetry() -> Dict[str, Any]:
    """
    Captures the active Windows foreground window title, owning process name,
    PID, and live CPU / RAM utilization using pygetwindow, win32process, and psutil.
    """
    window_title = "Desktop / Idle"
    process_name = "explorer.exe"
    pid = 0

    try:
        active_win = gw.getActiveWindow()
        if active_win and active_win.title:
            window_title = active_win.title.strip()
            hwnd = getattr(active_win, "_hWnd", None)
            if HAS_WIN32 and hwnd:
                _, found_pid = win32process.GetWindowThreadProcessId(hwnd)
                if found_pid and found_pid > 0:
                    pid = int(found_pid)
                    proc = psutil.Process(pid)
                    process_name = proc.name()
    except Exception:
        if HAS_WIN32:
            try:
                hwnd = win32gui.GetForegroundWindow()
                if hwnd:
                    title = win32gui.GetWindowText(hwnd)
                    if title:
                        window_title = title.strip()
                    _, found_pid = win32process.GetWindowThreadProcessId(hwnd)
                    if found_pid and found_pid > 0:
                        pid = int(found_pid)
                        process_name = psutil.Process(pid).name()
            except Exception:
                pass

    cpu_percent = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()

    return {
        "window_title": window_title or "System Foreground",
        "process_name": process_name,
        "pid": pid,
        "cpu_percent": round(cpu_percent, 1),
        "ram_percent": round(mem.percent, 1),
        "ram_used_gb": round(mem.used / (1024 ** 3), 2),
        "ram_total_gb": round(mem.total / (1024 ** 3), 2),
        "timestamp": datetime.now().strftime("%H:%M:%S"),
    }


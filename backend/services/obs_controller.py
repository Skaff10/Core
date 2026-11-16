import asyncio
import base64
import ctypes
import hashlib
import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

import psutil
import websockets

from core.config_manager import config_manager
from core.logger import logger_bus

# obs-websocket v5 EventSubscription bitmask for Outputs (RecordStateChanged)
OBS_EVENT_SUB_OUTPUTS = 1 << 6  # 64


def format_duration_ms(duration_ms: int) -> str:
    total_secs = max(0, int(duration_ms // 1000))
    hours = total_secs // 3600
    minutes = (total_secs % 3600) // 60
    seconds = total_secs % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def compute_obs_auth(password: str, salt: str, challenge: str) -> str:
    secret_hash = hashlib.sha256((password + salt).encode("utf-8")).digest()
    secret_b64 = base64.b64encode(secret_hash).decode("ascii")
    auth_hash = hashlib.sha256((secret_b64 + challenge).encode("utf-8")).digest()
    return base64.b64encode(auth_hash).decode("ascii")


def default_obs_ws_config_path() -> Path:
    appdata = os.getenv("APPDATA")
    if appdata:
        return Path(appdata) / "obs-studio" / "plugin_config" / "obs-websocket" / "config.json"
    return Path.home() / "AppData" / "Roaming" / "obs-studio" / "plugin_config" / "obs-websocket" / "config.json"


def locate_obs_binary(configured_path: Optional[str] = None) -> Dict[str, Any]:
    candidates = []
    if configured_path and configured_path.strip():
        candidates.append(Path(configured_path.strip()))

    candidates.extend([
        Path(r"C:\Program Files\obs-studio\bin\64bit\obs64.exe"),
        Path(r"C:\Program Files (x86)\obs-studio\bin\64bit\obs64.exe"),
    ])

    for exe_name in ("obs64", "obs64.exe", "obs"):
        found = shutil.which(exe_name)
        if found:
            candidates.append(Path(found))

    for p in candidates:
        if p.is_file():
            return {"found": True, "path": str(p.resolve())}

    return {"found": False, "path": None}


class ObsController:
    """
    Controls OBS Studio on Windows:
    - Process detection & safe launch (preserving OBS working directory)
    - obs-websocket v5 protocol client with SHA-256 challenge auth
    - Live recording status tracking (idle/recording/paused/offline)
    """

    def __init__(self, ws_config_path: Optional[Path] = None):
        self._ws_config_path = ws_config_path or default_obs_ws_config_path()
        self._ws: Any = None
        self._recv_task: Optional[asyncio.Task] = None
        self._monitor_task: Optional[asyncio.Task] = None
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._connect_lock = asyncio.Lock()
        self._running = False

        self.on_status_change: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None

        self._last_output_path: Optional[str] = None
        self._last_error: Optional[str] = None
        self._auth_failed = False
        self._recording = False
        self._paused = False
        self._duration_ms = 0
        self._bytes = 0

    def is_obs_running(self) -> Tuple[bool, Optional[int]]:
        for proc in psutil.process_iter(["name", "pid"]):
            try:
                name = (proc.info.get("name") or "").lower()
                if name in {"obs64.exe", "obs.exe", "obs"}:
                    return True, int(proc.info["pid"])
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return False, None

    def _read_obs_ws_file(self) -> Dict[str, Any]:
        if not self._ws_config_path.is_file():
            return {}
        try:
            with open(self._ws_config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _resolve_ws_settings(self) -> Dict[str, Any]:
        cfg = config_manager.load()
        file_cfg = self._read_obs_ws_file()

        host = (cfg.obs_ws_host or "127.0.0.1").strip()
        port = cfg.obs_ws_port or int(file_cfg.get("server_port") or 4455)
        password = cfg.obs_ws_password if cfg.obs_ws_password is not None else file_cfg.get("server_password", "")
        auth_required = bool(file_cfg.get("auth_required", bool(password)))
        server_enabled = bool(file_cfg.get("server_enabled", False))

        return {
            "host": host,
            "port": port,
            "password": password or "",
            "auth_required": auth_required,
            "server_enabled": server_enabled,
        }

    def enable_ws_when_stopped(self) -> bool:
        """
        Safely enables obs-websocket in OBS's config.json ONLY when OBS is not running,
        creating a .bak backup first. Preserves port and password.
        """
        running, _ = self.is_obs_running()
        if running or not self._ws_config_path.is_file():
            return False

        try:
            with open(self._ws_config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("server_enabled") is True:
                return True

            backup_path = self._ws_config_path.with_suffix(".json.bak")
            if not backup_path.exists():
                shutil.copy2(self._ws_config_path, backup_path)

            data["server_enabled"] = True
            with open(self._ws_config_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            return True
        except Exception:
            return False

    async def start_monitor(self):
        if self._monitor_task and not self._monitor_task.done():
            return
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self):
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None
        await self._disconnect_ws()

    async def _monitor_loop(self):
        last_signature: Optional[Tuple[Any, ...]] = None
        while self._running:
            try:
                running, _ = self.is_obs_running()
                if running:
                    if not self._is_ws_connected():
                        await self._try_connect_ws()
                    if self._is_ws_connected():
                        try:
                            await self._refresh_record_status()
                        except Exception:
                            await self._disconnect_ws()
                else:
                    if self._is_ws_connected():
                        await self._disconnect_ws()
                    self._recording = False
                    self._paused = False
                    self._duration_ms = 0
                    self._bytes = 0
                    self._auth_failed = False

                status = self.build_status_snapshot()
                sig = (
                    status["running"],
                    status["ws_connected"],
                    status["state"],
                    status["recording"],
                    status["paused"],
                    status["duration_text"] if status["recording"] else "",
                    status["last_output_path"],
                    status["error"],
                )
                if sig != last_signature:
                    last_signature = sig
                    await self._emit_status(status)

                await asyncio.sleep(1.0 if self._recording else 2.5)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(2.5)

    async def _emit_status(self, status: Optional[Dict[str, Any]] = None):
        if self.on_status_change:
            try:
                await self.on_status_change(status or self.build_status_snapshot())
            except Exception:
                pass

    def _is_ws_connected(self) -> bool:
        if self._ws is None:
            return False
        state = getattr(self._ws, "state", None)
        if state is not None:
            return getattr(state, "name", str(state)) == "OPEN"
        return not getattr(self._ws, "closed", True)

    async def _disconnect_ws(self):
        if self._recv_task:
            self._recv_task.cancel()
            try:
                await self._recv_task
            except asyncio.CancelledError:
                pass
            self._recv_task = None

        ws = self._ws
        self._ws = None
        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass

        for fut in list(self._pending_requests.values()):
            if not fut.done():
                fut.set_exception(ConnectionError("OBS WebSocket disconnected"))
        self._pending_requests.clear()

    async def _try_connect_ws(self) -> bool:
        async with self._connect_lock:
            if self._is_ws_connected():
                return True

            ws_cfg = self._resolve_ws_settings()
            url = f"ws://{ws_cfg['host']}:{ws_cfg['port']}"

            try:
                ws = await websockets.connect(url, open_timeout=2.5, close_timeout=2.0)
            except Exception as exc:
                self._last_error = str(exc)
                return False

            try:
                hello_raw = await asyncio.wait_for(ws.recv(), timeout=4.0)
                hello = json.loads(hello_raw)
                if hello.get("op") != 0:
                    raise RuntimeError(f"Unexpected OBS hello opcode: {hello.get('op')}")

                hello_data = hello.get("d", {})
                identify_data: Dict[str, Any] = {
                    "rpcVersion": min(int(hello_data.get("rpcVersion", 1)), 1),
                    "eventSubscriptions": OBS_EVENT_SUB_OUTPUTS,
                }
                auth_info = hello_data.get("authentication")
                if auth_info:
                    auth_token = compute_obs_auth(
                        ws_cfg["password"],
                        auth_info.get("salt", ""),
                        auth_info.get("challenge", ""),
                    )
                    identify_data["authentication"] = auth_token

                await ws.send(json.dumps({"op": 1, "d": identify_data}))
                identified_raw = await asyncio.wait_for(ws.recv(), timeout=4.0)
                identified = json.loads(identified_raw)
                if identified.get("op") != 2:
                    self._auth_failed = True
                    raise RuntimeError("OBS WebSocket authentication failed")

                self._ws = ws
                self._auth_failed = False
                self._last_error = None
                self._recv_task = asyncio.create_task(self._recv_loop(ws))
                await logger_bus.log("INFO", "OBS", f"Connected to OBS WebSocket on {url}")
                return True
            except Exception as exc:
                self._last_error = str(exc)
                try:
                    await ws.close()
                except Exception:
                    pass
                return False

    async def _recv_loop(self, ws: Any):
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue

                op = msg.get("op")
                data = msg.get("d", {})

                if op == 7:  # RequestResponse
                    req_id = data.get("requestId")
                    fut = self._pending_requests.pop(req_id, None)
                    if fut and not fut.done():
                        fut.set_result(data)

                elif op == 5:  # Event
                    if data.get("eventType") == "RecordStateChanged":
                        ev = data.get("eventData", {})
                        output_active = bool(ev.get("outputActive", False))
                        output_state = str(ev.get("outputState", ""))
                        output_path = ev.get("outputPath")

                        if output_state == "OBS_WEBSOCKET_OUTPUT_PAUSED":
                            self._recording = True
                            self._paused = True
                        elif output_state in {"OBS_WEBSOCKET_OUTPUT_STARTED", "OBS_WEBSOCKET_OUTPUT_RESUMED"}:
                            self._recording = True
                            self._paused = False
                        elif output_state in {"OBS_WEBSOCKET_OUTPUT_STOPPED", "OBS_WEBSOCKET_OUTPUT_STOPPING"}:
                            self._recording = False
                            self._paused = False
                            if output_path:
                                self._last_output_path = output_path
                        else:
                            self._recording = output_active
                            if not output_active:
                                self._paused = False

                        await self._emit_status()
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        finally:
            if self._ws is ws:
                self._ws = None
                for fut in list(self._pending_requests.values()):
                    if not fut.done():
                        fut.set_exception(ConnectionError("OBS WebSocket closed"))
                self._pending_requests.clear()

    async def _request(self, request_type: str, request_data: Optional[Dict[str, Any]] = None, timeout: float = 5.0) -> Dict[str, Any]:
        if not self._is_ws_connected():
            connected = await self._try_connect_ws()
            if not connected:
                raise RuntimeError(self._last_error or "Unable to connect to OBS WebSocket")

        req_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        self._pending_requests[req_id] = fut

        payload: Dict[str, Any] = {
            "op": 6,
            "d": {
                "requestType": request_type,
                "requestId": req_id,
            },
        }
        if request_data is not None:
            payload["d"]["requestData"] = request_data

        try:
            await self._ws.send(json.dumps(payload))
            resp = await asyncio.wait_for(fut, timeout=timeout)
        except Exception:
            self._pending_requests.pop(req_id, None)
            raise

        status_info = resp.get("requestStatus", {})
        if not status_info.get("result", False):
            comment = status_info.get("comment") or f"OBS request {request_type} failed (code {status_info.get('code')})"
            raise RuntimeError(comment)

        return resp.get("responseData", {})

    async def _refresh_record_status(self):
        data = await self._request("GetRecordStatus")
        self._recording = bool(data.get("outputActive", False))
        self._paused = bool(data.get("outputPaused", False))
        self._duration_ms = int(data.get("outputDuration", 0) or 0)
        self._bytes = int(data.get("outputBytes", 0) or 0)
        self._last_error = None

    def build_status_snapshot(self) -> Dict[str, Any]:
        cfg = config_manager.load()
        binary = locate_obs_binary(cfg.obs_path)
        running, pid = self.is_obs_running()
        ws_cfg = self._resolve_ws_settings()
        ws_connected = self._is_ws_connected()

        if not running:
            state = "offline"
        elif self._auth_failed:
            state = "auth_failed"
        elif not ws_connected:
            state = "ws_disabled" if not ws_cfg["server_enabled"] else "connecting"
        elif self._recording and self._paused:
            state = "paused"
        elif self._recording:
            state = "recording"
        else:
            state = "standby"

        return {
            "installed": binary["found"],
            "obs_path": binary["path"],
            "running": running,
            "pid": pid,
            "ws_configured_enabled": ws_cfg["server_enabled"],
            "ws_port": ws_cfg["port"],
            "ws_connected": ws_connected,
            "state": state,
            "recording": self._recording if running else False,
            "paused": self._paused if running else False,
            "duration_ms": self._duration_ms if running else 0,
            "duration_text": format_duration_ms(self._duration_ms if running else 0),
            "bytes": self._bytes if running else 0,
            "last_output_path": self._last_output_path,
            "error": self._last_error if running else None,
        }

    async def get_status(self, refresh: bool = True) -> Dict[str, Any]:
        running, _ = self.is_obs_running()
        if running and refresh:
            if not self._is_ws_connected():
                await self._try_connect_ws()
            if self._is_ws_connected():
                try:
                    await self._refresh_record_status()
                except Exception as exc:
                    self._last_error = str(exc)
        return self.build_status_snapshot()

    async def open_obs(self, start_recording: bool = False) -> Dict[str, Any]:
        cfg = config_manager.load()
        running, _ = self.is_obs_running()
        if not running:
            binary = locate_obs_binary(cfg.obs_path)
            if not binary["found"] or not binary["path"]:
                raise FileNotFoundError("OBS Studio executable (obs64.exe) not found on PC.")

            if cfg.obs_auto_enable_ws:
                self.enable_ws_when_stopped()

            obs_exe = Path(binary["path"])
            args = ["--minimize-to-tray"] if cfg.obs_minimize_to_tray else []
            cmd = [str(obs_exe), *args]

            creationflags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
            try:
                subprocess.Popen(
                    cmd,
                    cwd=str(obs_exe.parent),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creationflags,
                )
            except OSError as exc:
                if os.name == "nt" and getattr(exc, "winerror", None) == 740:
                    # Executable is flagged RUNASADMIN; try standard Windows ShellExecuteW
                    arg_str = " ".join(args)
                    res = ctypes.windll.shell32.ShellExecuteW(
                        None,
                        "open",
                        str(obs_exe),
                        arg_str or None,
                        str(obs_exe.parent),
                        1,
                    )
                    if res <= 32:
                        raise RuntimeError(
                            "OBS is flagged 'Run as administrator' (WinError 740). "
                            "Run Core backend as Admin, uncheck 'Run as administrator' on obs64.exe, or open OBS on PC."
                        ) from exc
                else:
                    raise
            await logger_bus.log("EXEC", "OBS", f"Launched OBS Studio: {obs_exe}")

            # Wait up to 12 seconds for obs-websocket to become ready
            for _ in range(24):
                await asyncio.sleep(0.5)
                if await self._try_connect_ws():
                    break

        if start_recording:
            await self.start_recording(auto_launch=False)

        status = await self.get_status(refresh=True)
        await self._emit_status(status)
        return status

    async def start_recording(self, auto_launch: bool = True) -> Dict[str, Any]:
        running, _ = self.is_obs_running()
        if not running:
            if auto_launch:
                return await self.open_obs(start_recording=True)
            raise RuntimeError("OBS Studio is not running.")

        await self.get_status(refresh=True)
        if self._recording and self._paused:
            await self._request("ResumeRecord")
        elif not self._recording:
            await self._request("StartRecord")

        await asyncio.sleep(0.25)
        status = await self.get_status(refresh=True)
        await self._emit_status(status)
        await logger_bus.log("INFO", "OBS", "OBS recording started/resumed")
        return status

    async def pause_recording(self) -> Dict[str, Any]:
        await self.get_status(refresh=True)
        if not self._recording:
            raise RuntimeError("OBS is not currently recording.")
        if not self._paused:
            await self._request("PauseRecord")
            await asyncio.sleep(0.2)
        status = await self.get_status(refresh=True)
        await self._emit_status(status)
        await logger_bus.log("INFO", "OBS", "OBS recording paused")
        return status

    async def resume_recording(self) -> Dict[str, Any]:
        await self.get_status(refresh=True)
        if not self._recording:
            raise RuntimeError("OBS is not currently recording.")
        if self._paused:
            await self._request("ResumeRecord")
            await asyncio.sleep(0.2)
        status = await self.get_status(refresh=True)
        await self._emit_status(status)
        await logger_bus.log("INFO", "OBS", "OBS recording resumed")
        return status

    async def stop_recording(self) -> Dict[str, Any]:
        await self.get_status(refresh=True)
        if not self._recording:
            raise RuntimeError("OBS is not currently recording.")
        resp = await self._request("StopRecord")
        output_path = resp.get("outputPath")
        if output_path:
            self._last_output_path = output_path
        self._recording = False
        self._paused = False
        await asyncio.sleep(0.25)
        status = await self.get_status(refresh=True)
        await self._emit_status(status)
        await logger_bus.log("INFO", "OBS", f"OBS recording stopped -> {self._last_output_path or 'saved'}")
        return status


obs_controller = ObsController()

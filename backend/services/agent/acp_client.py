import asyncio
import hashlib
import json
import os
import subprocess
import threading
from pathlib import Path
from typing import Dict, Any, Optional, Callable, Awaitable, List

import psutil
from core.config_manager import config_manager
from core.logger import logger_bus
from core.paths import get_data_dir
from services.agent.agy_locator import locate_agy_binary

LOGS_DIR = get_data_dir() / "logs"


class AcpClient:
    """
    Robust JSON-RPC 2.0 stdio client for `agy acp`.
    - Passes `--app-data-dir` so ACP shares the Antigravity Desktop store.
    - Uses threaded readers (avoids Windows asyncio Selector/64KB limits) + ordered asyncio.Queue dispatch.
    """

    def __init__(self, cwd: Optional[str] = None, label: str = "main"):
        self.cwd = cwd or str(Path.home())
        self.label = label
        self.process: Optional[subprocess.Popen] = None
        self._stdin_lock = threading.Lock()
        self._req_id = 0
        self._req_lock = threading.Lock()
        self._pending_futures: Dict[Any, asyncio.Future] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._dispatch_queue: Optional[asyncio.Queue] = None
        self._dispatch_task: Optional[asyncio.Task] = None
        self._running = False
        self._initialized = False
        self._last_version: Optional[str] = None

        # Event callbacks (async, invoked strictly in arrival order)
        self.on_session_update: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None
        self.on_permission_request: Optional[Callable[[Any, str, Dict[str, Any], List[Dict[str, Any]]], Awaitable[None]]] = None
        self.on_process_exit: Optional[Callable[[int], Awaitable[None]]] = None

        self.agent_info: Dict[str, Any] = {}
        self.agent_capabilities: Dict[str, Any] = {}

    def _next_id(self) -> int:
        with self._req_lock:
            self._req_id += 1
            return self._req_id

    def _log_file_path(self) -> Path:
        if self.label == "main":
            return LOGS_DIR / "agy_acp.log"
        digest = hashlib.sha1(self.cwd.lower().encode("utf-8")).hexdigest()[:8]
        return LOGS_DIR / f"agy_acp_{digest}.log"

    async def start(self) -> bool:
        if self.process and self.process.poll() is None and self._initialized:
            return True

        self._loop = asyncio.get_running_loop()
        locator = locate_agy_binary()
        if not locator["found"] or not locator["path"]:
            await logger_bus.log("ERROR", "ACP", "Antigravity binary (agy.exe) not found on PC.")
            return False

        cfg = config_manager.load()
        app_data_dir = (cfg.agy_app_data_dir or "antigravity").strip()

        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        acp_log_file = self._log_file_path()

        spawn_cwd = self.cwd if os.path.isdir(self.cwd) else str(Path.home())
        cmd = [
            locator["path"],
            "acp",
            "--app-data-dir",
            app_data_dir,
            "--process-per-session",
            "--log-file",
            str(acp_log_file),
        ]

        await logger_bus.log("INFO", "ACP", f"Spawning ACP daemon ({self.label}, cwd={spawn_cwd}): {' '.join(cmd)}")

        try:
            self._dispatch_queue = asyncio.Queue()
            if self._dispatch_task and not self._dispatch_task.done():
                self._dispatch_task.cancel()
            self._dispatch_task = asyncio.create_task(self._dispatch_loop())

            self.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                cwd=spawn_cwd,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            self._running = True

            threading.Thread(target=self._stdout_reader, daemon=True, name=f"acp-stdout-{self.label}").start()
            threading.Thread(target=self._stderr_reader, daemon=True, name=f"acp-stderr-{self.label}").start()

            init_res = await self.call(
                "initialize",
                {
                    "protocolVersion": 1,
                    "clientCapabilities": {
                        "fs": {"readTextFile": False, "writeTextFile": False},
                        "terminal": False,
                    },
                },
                timeout=20,
            )

            if "result" in init_res:
                res_data = init_res["result"]
                self.agent_info = res_data.get("agentInfo", {})
                self.agent_capabilities = res_data.get("agentCapabilities", {})
                self._initialized = True
                version = self.agent_info.get("version", "?")
                if self._last_version and self._last_version != version:
                    await logger_bus.log("WARN", "ACP", f"agy version changed: {self._last_version} -> {version}")
                self._last_version = version
                await logger_bus.log(
                    "INFO",
                    "ACP",
                    f"ACP Handshake OK ({self.label}): {self.agent_info.get('name', 'Antigravity')} v{version}",
                )
                return True

            await logger_bus.log("ERROR", "ACP", f"ACP initialize failed: {init_res}")
            await self.stop()
            return False

        except Exception as exc:
            await logger_bus.log("ERROR", "ACP", f"Failed starting ACP process: {exc}")
            await self.stop()
            return False

    def is_alive(self) -> bool:
        return bool(self.process and self.process.poll() is None and self._initialized)

    async def _dispatch_loop(self):
        while self._dispatch_queue is not None:
            try:
                item = await self._dispatch_queue.get()
                kind = item[0]
                if kind == "update" and self.on_session_update:
                    await self.on_session_update(item[1], item[2])
                elif kind == "permission" and self.on_permission_request:
                    await self.on_permission_request(item[1], item[2], item[3], item[4])
                elif kind == "exit":
                    if self.on_process_exit:
                        await self.on_process_exit(item[1])
                    break
            except asyncio.CancelledError:
                break
            except Exception as exc:
                await logger_bus.log("ERROR", "ACP", f"Dispatch handler error: {exc}")

    def _enqueue(self, item: tuple):
        if self._dispatch_queue is not None and self._loop and not self._loop.is_closed():
            try:
                self._loop.call_soon_threadsafe(self._dispatch_queue.put_nowait, item)
            except Exception:
                pass

    def _send_raw_json(self, payload: Dict[str, Any]):
        line = json.dumps(payload, ensure_ascii=False) + "\n"
        with self._stdin_lock:
            if self.process and self.process.stdin:
                try:
                    self.process.stdin.write(line)
                    self.process.stdin.flush()
                except Exception:
                    pass

    async def call(self, method: str, params: Dict[str, Any], timeout: float = 60.0) -> Dict[str, Any]:
        if not self.process or self.process.poll() is not None:
            raise RuntimeError("ACP daemon process is not running.")

        req_id = self._next_id()
        loop = asyncio.get_running_loop()
        self._loop = loop
        fut: asyncio.Future = loop.create_future()
        self._pending_futures[req_id] = fut

        msg = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params,
        }

        self._send_raw_json(msg)

        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_futures.pop(req_id, None)
            raise TimeoutError(f"ACP call '{method}' timed out after {timeout}s")

    def respond_to_permission_request(self, request_id: Any, option_id: Optional[str]):
        """
        Replies to agy's session/request_permission.
        id matches the incoming id type exactly (str or int).
        """
        if option_id:
            payload = {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "outcome": {
                        "outcome": "selected",
                        "optionId": option_id,
                    }
                },
            }
        else:
            payload = {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "outcome": {
                        "outcome": "cancelled",
                    }
                },
            }
        self._send_raw_json(payload)

    def respond_method_not_found(self, request_id: Any):
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": -32601,
                "message": "Method not found",
            },
        }
        self._send_raw_json(payload)

    def _fail_pending_futures(self, reason: str):
        if not self._loop or self._loop.is_closed():
            return
        for req_id in list(self._pending_futures.keys()):
            fut = self._pending_futures.pop(req_id, None)
            if fut and not fut.done():
                try:
                    self._loop.call_soon_threadsafe(fut.set_exception, RuntimeError(reason))
                except Exception:
                    pass

    def _stdout_reader(self):
        proc = self.process
        if not proc or not proc.stdout:
            return

        for raw_line in iter(proc.stdout.readline, ""):
            line = raw_line.strip()
            if not line:
                continue

            try:
                msg = json.loads(line)
            except Exception:
                continue

            # Case 1: Server Response to our client request
            msg_id = msg.get("id")
            if msg_id is not None and ("result" in msg or "error" in msg):
                fut = self._pending_futures.pop(msg_id, None)
                if fut and not fut.done():
                    try:
                        fut_loop = fut.get_loop()
                        if not fut_loop.is_closed():
                            fut_loop.call_soon_threadsafe(fut.set_result, msg)
                    except Exception:
                        pass
                continue

            # Case 2: Notification from Server
            method = msg.get("method")
            if method == "session/update":
                params = msg.get("params", {})
                sid = params.get("sessionId", "")
                update = params.get("update", {})
                self._enqueue(("update", sid, update))
                continue

            # Case 3: Server Request to Client (e.g. session/request_permission)
            if method == "session/request_permission":
                req_id = msg.get("id")
                params = msg.get("params", {})
                sid = params.get("sessionId", "")
                tool_call = params.get("toolCall", {})
                options = params.get("options", [])
                self._enqueue(("permission", req_id, sid, tool_call, options))
                continue

            # Unknown server request requiring response
            if method and msg_id is not None:
                self.respond_method_not_found(msg_id)

        exit_code = (proc.poll() if proc else None) or 0
        was_running = self._running
        self._running = False
        self._initialized = False
        self._fail_pending_futures(f"ACP daemon exited (code {exit_code})")
        if was_running:
            self._enqueue(("exit", exit_code))

    def _stderr_reader(self):
        proc = self.process
        if not proc or not proc.stderr:
            return
        for _ in iter(proc.stderr.readline, ""):
            pass

    async def stop(self):
        self._running = False
        self._initialized = False
        if self.process:
            try:
                parent = psutil.Process(self.process.pid)
                for child in parent.children(recursive=True):
                    try:
                        child.kill()
                    except Exception:
                        pass
                parent.kill()
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None

        if self._dispatch_task and not self._dispatch_task.done():
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass
            self._dispatch_task = None

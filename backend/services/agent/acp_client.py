import asyncio
import json
import os
import subprocess
import threading
from pathlib import Path
from typing import Dict, Any, Optional, Callable, Awaitable, List

import psutil
from core.logger import logger_bus
from services.agent.agy_locator import locate_agy_binary

LOGS_DIR = Path(__file__).resolve().parent.parent.parent / "logs"


class AcpClient:
    """
    Robust JSON-RPC 2.0 stdio client for `agy acp`.
    Threaded readers avoid asyncio Windows Selector/Proactor limitations and 64KB line caps.
    """

    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self._stdin_lock = threading.Lock()
        self._req_id = 0
        self._req_lock = threading.Lock()
        self._pending_futures: Dict[Any, asyncio.Future] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._running = False
        self._initialized = False

        # Event callbacks (async)
        self.on_session_update: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None
        self.on_permission_request: Optional[Callable[[str, str, Dict[str, Any], List[Dict[str, Any]]], Awaitable[None]]] = None
        self.on_process_exit: Optional[Callable[[int], Awaitable[None]]] = None

        self.agent_info: Dict[str, Any] = {}
        self.agent_capabilities: Dict[str, Any] = {}

    def _next_id(self) -> int:
        with self._req_lock:
            self._req_id += 1
            return self._req_id

    async def start(self) -> bool:
        if self.process and self.process.poll() is None:
            return True

        self._loop = asyncio.get_running_loop()
        locator = locate_agy_binary()
        if not locator["found"] or not locator["path"]:
            await logger_bus.log("ERROR", "ACP", "Antigravity binary (agy.exe) not found on PC.")
            return False

        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        acp_log_file = LOGS_DIR / "agy_acp.log"

        cmd = [
            locator["path"],
            "acp",
            "--process-per-session",
            "--log-file",
            str(acp_log_file),
        ]

        await logger_bus.log("INFO", "ACP", f"Spawning ACP daemon: {' '.join(cmd)}")

        try:
            self.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                cwd=str(Path.home()),
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            self._running = True

            threading.Thread(target=self._stdout_reader, daemon=True, name="acp-stdout").start()
            threading.Thread(target=self._stderr_reader, daemon=True, name="acp-stderr").start()

            # Perform protocol initialize handshake
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
                await logger_bus.log(
                    "INFO",
                    "ACP",
                    f"ACP Handshake OK: {self.agent_info.get('name', 'Antigravity')} v{self.agent_info.get('version', '?')}",
                )
                return True
            else:
                await logger_bus.log("ERROR", "ACP", f"ACP initialize failed: {init_res}")
                return False

        except Exception as exc:
            await logger_bus.log("ERROR", "ACP", f"Failed starting ACP process: {exc}")
            return False

    def is_alive(self) -> bool:
        return bool(self.process and self.process.poll() is None and self._initialized)

    def _send_raw_json(self, payload: Dict[str, Any]):
        line = json.dumps(payload, ensure_ascii=False) + "\n"
        with self._stdin_lock:
            if self.process and self.process.stdin:
                try:
                    self.process.stdin.write(line)
                    self.process.stdin.flush()
                except Exception as exc:
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
        id matches the incoming id type exactly.
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

    def _stdout_reader(self):
        if not self.process or not self.process.stdout:
            return

        for raw_line in iter(self.process.stdout.readline, ""):
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
                if self.on_session_update and self._loop and not self._loop.is_closed():
                    try:
                        self._loop.call_soon_threadsafe(
                            lambda s=sid, u=update: asyncio.create_task(self.on_session_update(s, u))
                        )
                    except Exception:
                        pass
                continue

            # Case 3: Server Request to Client (e.g. session/request_permission)
            if method == "session/request_permission":
                req_id = msg.get("id")
                params = msg.get("params", {})
                sid = params.get("sessionId", "")
                tool_call = params.get("toolCall", {})
                options = params.get("options", [])
                if self.on_permission_request and self._loop and not self._loop.is_closed():
                    try:
                        self._loop.call_soon_threadsafe(
                            lambda r=req_id, s=sid, t=tool_call, o=options: asyncio.create_task(
                                self.on_permission_request(r, s, t, o)
                            )
                        )
                    except Exception:
                        pass
                continue

            # Unknown server request requiring response
            if method and msg_id is not None:
                self.respond_method_not_found(msg_id)

        exit_code = self.process.poll() or 0
        self._running = False
        self._initialized = False
        if self.on_process_exit and self._loop and not self._loop.is_closed():
            try:
                self._loop.call_soon_threadsafe(
                    lambda c=exit_code: asyncio.create_task(self.on_process_exit(c))
                )
            except Exception:
                pass

    def _stderr_reader(self):
        if not self.process or not self.process.stderr:
            return
        for line in iter(self.process.stderr.readline, ""):
            # Lines go to agy_acp.log directly via process args; drain pipe
            pass

    async def stop(self):
        self._running = False
        if self.process:
            try:
                # Terminate child worker processes first
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
        self._initialized = False

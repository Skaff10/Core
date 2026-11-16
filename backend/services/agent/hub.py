import asyncio
import ctypes
import os
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Set, List

from fastapi import WebSocket

from core.config_manager import config_manager
from core.logger import logger_bus
from services.agent.acp_client import AcpClient
from services.agent.agy_locator import get_conversation_db_signature
from services.agent.events import (
    truncate_tool_output,
    detect_quota_exhaustion,
    iso_utc_now,
)
from services.agent.projects import (
    group_sessions_by_project,
    compute_project_id,
    normalize_cwd,
    is_allowed_project_cwd,
)
from services.agent.store import agent_store

# Windows API constants for preventing sleep during active AI processing
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


def _set_thread_execution_state(prevent_sleep: bool):
    if os.name == "nt":
        try:
            flags = ES_CONTINUOUS
            if prevent_sleep:
                flags |= ES_SYSTEM_REQUIRED
            ctypes.windll.kernel32.SetThreadExecutionState(flags)
        except Exception:
            pass


class _ReplayCollector:
    """
    Reconstructs ordered user and assistant turns from ACP `session/load`
    replay `session/update` notifications.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.messages: List[Dict[str, Any]] = []
        self.tool_calls: List[Dict[str, Any]] = []
        self._tool_index: Dict[str, Dict[str, Any]] = {}
        self.title: Optional[str] = None
        self.commands: List[Dict[str, Any]] = []
        self.config_options: List[Dict[str, Any]] = []

    def _ensure_turn(self, role: str) -> Dict[str, Any]:
        if self.messages and self.messages[-1]["role"] == role:
            return self.messages[-1]
        idx = len(self.messages) + 1
        msg = {
            "id": f"replay-{self.session_id}-{idx}",
            "role": role,
            "content": "",
            "thoughts": "",
            "stop_reason": "end_turn" if role == "assistant" else "",
            "created_at": iso_utc_now(),
        }
        self.messages.append(msg)
        return msg

    def handle_update(self, update: Dict[str, Any]):
        u_type = update.get("sessionUpdate")

        if u_type == "user_message_chunk":
            text = (update.get("content") or {}).get("text", "")
            if text:
                msg = self._ensure_turn("user")
                msg["content"] += text

        elif u_type in {"agent_thought_chunk", "thought_chunk"}:
            text = (update.get("content") or {}).get("text", "")
            if text:
                msg = self._ensure_turn("assistant")
                msg["thoughts"] += text

        elif u_type == "agent_message_chunk":
            text = (update.get("content") or {}).get("text", "")
            if text:
                msg = self._ensure_turn("assistant")
                msg["content"] += text

        elif u_type == "tool_call":
            msg = self._ensure_turn("assistant")
            tid = str(update.get("toolCallId") or f"tc-{len(self.tool_calls) + 1}")
            raw_output = update.get("rawOutput")
            if raw_output is None and update.get("content"):
                raw_output = update.get("content")
            preview, _ = truncate_tool_output(raw_output)

            existing = self._tool_index.get(tid)
            if existing:
                if update.get("status"):
                    existing["status"] = update.get("status")
                if preview:
                    existing["raw_output"] = preview
            else:
                entry = {
                    "tool_call_id": tid,
                    "session_id": self.session_id,
                    "message_id": msg["id"],
                    "name": update.get("name", ""),
                    "title": update.get("title") or update.get("name", ""),
                    "kind": update.get("kind", ""),
                    "args": update.get("args"),
                    "raw_output": preview,
                    "status": update.get("status", "completed"),
                }
                self._tool_index[tid] = entry
                self.tool_calls.append(entry)

        elif u_type == "tool_call_update":
            tid = str(update.get("toolCallId") or "")
            existing = self._tool_index.get(tid)
            if existing:
                if update.get("status"):
                    existing["status"] = update.get("status")
                raw_output = update.get("rawOutput")
                if raw_output is not None:
                    preview, _ = truncate_tool_output(raw_output)
                    existing["raw_output"] = preview

        elif u_type == "session_info_update":
            if update.get("title"):
                self.title = update.get("title")

        elif u_type == "available_commands_update":
            self.commands = update.get("availableCommands", [])

        elif u_type == "config_option_update":
            self.config_options = update.get("configOptions", [])


class AgentHub:
    """
    Central Coordinator for Antigravity Agents:
    - Maintains a control AcpClient + workspace-scoped AcpClient pool sharing `--app-data-dir antigravity`.
    - Captures full ACP `session/load` history replay (`user_message_chunk`, `agent_thought_chunk`, `tool_call`, `agent_message_chunk`).
    - Watches active subscribed sessions on disk so PC edits auto-sync to mobile in real time.
    - Manages multi-session state machines, prompt queue, permissions, and WS fan-out.
    """

    def __init__(self):
        self.acp = AcpClient(cwd=str(Path.home()), label="main")
        self._clients_by_cwd: OrderedDict[str, AcpClient] = OrderedDict()
        self._session_clients: Dict[str, AcpClient] = {}
        self._session_cwds: Dict[str, str] = {}
        self._known_project_paths: Set[str] = set()

        self._loaded_sessions: OrderedDict[str, str] = OrderedDict()  # sid -> cwd
        self._session_state: Dict[str, str] = {}  # sid -> idle|running|awaiting_permission
        self._session_configs: Dict[str, List[Dict[str, Any]]] = {}
        self._session_commands: Dict[str, List[Dict[str, Any]]] = {}
        self._pending_permissions: Dict[str, Dict[str, Any]] = {}  # req_id -> details
        self._active_turns: Dict[str, Dict[str, Any]] = {}  # sid -> turn buffer details
        self._replaying: Dict[str, _ReplayCollector] = {}  # sid -> replay collector
        self._session_queues: Dict[str, List[Dict[str, Any]]] = {}  # sid -> queued prompts
        self._dedupe_ids: Dict[str, float] = {}  # client_msg_id -> timestamp
        self._subscribers: Dict[str, Set[WebSocket]] = {}  # sid -> set of WebSockets
        self._all_client_sockets: Set[WebSocket] = set()

        self._lock = asyncio.Lock()
        self._session_locks: Dict[str, asyncio.Lock] = {}
        self._watcher_task: Optional[asyncio.Task] = None
        self._initialized = False

    def _get_session_lock(self, session_id: str) -> asyncio.Lock:
        if session_id not in self._session_locks:
            self._session_locks[session_id] = asyncio.Lock()
        return self._session_locks[session_id]

    def _wire_client_callbacks(self, client: AcpClient):
        client.on_session_update = self._on_acp_session_update
        client.on_permission_request = self._on_acp_permission_request

        async def _on_exit(exit_code: int, exiting_client: AcpClient = client):
            await self._on_acp_process_exit(exit_code, exiting_client)

        client.on_process_exit = _on_exit

    async def initialize(self) -> bool:
        async with self._lock:
            self._ensure_watcher_started()
            if self._initialized and self.acp.is_alive():
                return True

            self._wire_client_callbacks(self.acp)
            ok = await self.acp.start()
            self._initialized = ok
            return ok

    def _ensure_watcher_started(self):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._watcher_task is None or self._watcher_task.done():
            self._watcher_task = loop.create_task(self._pc_sync_watcher_loop())

    async def _get_client_for_cwd(self, cwd: str) -> AcpClient:
        await self.initialize()
        norm_cwd = normalize_cwd(cwd)
        if not norm_cwd or not os.path.isdir(norm_cwd):
            return self.acp

        key = norm_cwd.lower()
        existing = self._clients_by_cwd.get(key)
        if existing and existing.is_alive():
            self._clients_by_cwd.move_to_end(key)
            return existing

        # Evict oldest idle workspace client if pool exceeds 4
        if len(self._clients_by_cwd) >= 4:
            for old_key, old_client in list(self._clients_by_cwd.items()):
                in_use = any(
                    self._session_clients.get(sid) is old_client
                    and self._session_state.get(sid, "idle") != "idle"
                    for sid in self._session_clients
                )
                if not in_use:
                    self._clients_by_cwd.pop(old_key, None)
                    for sid, c in list(self._session_clients.items()):
                        if c is old_client:
                            self._session_clients.pop(sid, None)
                            self._loaded_sessions.pop(sid, None)
                    await old_client.stop()
                    break

        client = AcpClient(cwd=norm_cwd, label=Path(norm_cwd).name or "ws")
        self._wire_client_callbacks(client)
        ok = await client.start()
        if not ok:
            return self.acp
        self._clients_by_cwd[key] = client
        return client

    async def shutdown(self):
        if self._watcher_task and not self._watcher_task.done():
            self._watcher_task.cancel()
            try:
                await self._watcher_task
            except asyncio.CancelledError:
                pass
            self._watcher_task = None

        for client in list(self._clients_by_cwd.values()):
            await client.stop()
        self._clients_by_cwd.clear()
        self._session_clients.clear()
        self._loaded_sessions.clear()
        await self.acp.stop()

    def is_healthy(self) -> bool:
        return self.acp.is_alive()

    def register_client_socket(self, ws: WebSocket):
        self._all_client_sockets.add(ws)
        self._ensure_watcher_started()

    def unregister_client_socket(self, ws: WebSocket):
        self._all_client_sockets.discard(ws)
        for sid, subs in list(self._subscribers.items()):
            subs.discard(ws)

    async def subscribe_session(self, ws: WebSocket, session_id: str, since_seq: int = 0):
        self._ensure_watcher_started()
        if session_id not in self._subscribers:
            self._subscribers[session_id] = set()
        self._subscribers[session_id].add(ws)

        # Ensure history is loaded/fresh from Antigravity store on subscribe
        try:
            synced = await self.sync_session_if_stale(session_id, broadcast=False)
            if synced:
                await ws.send_json({
                    "type": "history_synced",
                    "data": {
                        "session_id": session_id,
                        "config_options": self.get_session_config_options(session_id),
                        "commands": self._session_commands.get(session_id, []),
                    },
                })
        except Exception as exc:
            await logger_bus.log("WARN", "HUB", f"Subscribe sync skipped for {session_id}: {exc}")

        if since_seq > 0:
            events = agent_store.get_events_since(session_id, since_seq)
            for ev in events:
                try:
                    await ws.send_json({"type": "event", "data": ev})
                except Exception:
                    break

        await self._send_session_state(ws, session_id)

    async def _send_session_state(self, ws: WebSocket, session_id: str):
        state = self._session_state.get(session_id, "idle")
        active_perm = next(
            (p for p in self._pending_permissions.values() if p.get("sessionId") == session_id),
            None,
        )
        sess = agent_store.get_session(session_id) or {}
        try:
            await ws.send_json(
                {
                    "type": "session_state",
                    "data": {
                        "session_id": session_id,
                        "state": state,
                        "pending_permission": active_perm,
                        "queue_depth": len(self._session_queues.get(session_id, [])),
                        "config_options": self.get_session_config_options(session_id),
                        "commands": self._session_commands.get(session_id, []),
                        "title": sess.get("title"),
                        "cwd": sess.get("cwd") or self._session_cwds.get(session_id, ""),
                    },
                }
            )
        except Exception:
            pass

    def unsubscribe_session(self, ws: WebSocket, session_id: str):
        if session_id in self._subscribers:
            self._subscribers[session_id].discard(ws)

    async def broadcast_to_session(self, session_id: str, kind: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        seq, event = agent_store.append_event(session_id, kind, payload)
        dead = []
        subs = self._subscribers.get(session_id, set())
        for ws in list(subs):
            try:
                await ws.send_json({"type": "event", "data": event})
            except Exception:
                dead.append(ws)

        for ws in dead:
            subs.discard(ws)

        return event

    async def broadcast_session_state(self, session_id: str):
        subs = self._subscribers.get(session_id, set())
        for ws in list(subs):
            await self._send_session_state(ws, session_id)

    async def _broadcast_history_synced(self, session_id: str):
        subs = self._subscribers.get(session_id, set())
        dead = []
        payload = {
            "type": "history_synced",
            "data": {
                "session_id": session_id,
                "config_options": self.get_session_config_options(session_id),
                "commands": self._session_commands.get(session_id, []),
            },
        }
        for ws in list(subs):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            subs.discard(ws)

    # --- Project and Session Management ---

    async def list_projects(self) -> List[Dict[str, Any]]:
        await self.initialize()
        raw_res = await self.acp.call("session/list", {}, timeout=15)
        raw_sessions = raw_res.get("result", {}).get("sessions", [])

        for s in raw_sessions:
            sid = s.get("sessionId")
            norm = normalize_cwd(s.get("cwd", ""))
            if sid and norm:
                self._session_cwds[sid] = norm
                self._known_project_paths.add(norm)

        running_ids = {sid for sid, st in self._session_state.items() if st == "running"}
        perm_ids = {sid for sid, st in self._session_state.items() if st == "awaiting_permission"}

        return group_sessions_by_project(
            raw_sessions,
            running_session_ids=running_ids,
            awaiting_permission_ids=perm_ids,
        )

    async def _resolve_session_cwd(self, session_id: str, fallback_cwd: str = "") -> str:
        if fallback_cwd:
            norm = normalize_cwd(fallback_cwd)
            if norm:
                self._session_cwds[session_id] = norm
                return norm
        if session_id in self._session_cwds:
            return self._session_cwds[session_id]
        stored = agent_store.get_session(session_id)
        if stored and stored.get("cwd"):
            norm = normalize_cwd(stored["cwd"])
            self._session_cwds[session_id] = norm
            return norm
        try:
            await self.list_projects()
        except Exception:
            pass
        return self._session_cwds.get(session_id, str(Path.home()))

    def get_session_config_options(self, session_id: str) -> List[Dict[str, Any]]:
        if session_id in self._session_configs:
            return self._session_configs[session_id]
        stored = agent_store.get_session(session_id)
        if stored and stored.get("config_options"):
            self._session_configs[session_id] = stored["config_options"]
            return stored["config_options"]
        return []

    async def ensure_session_loaded(
        self,
        session_id: str,
        cwd: str = "",
        force_reload: bool = False,
    ) -> Dict[str, Any]:
        resolved_cwd = await self._resolve_session_cwd(session_id, cwd)
        cfg = config_manager.load()

        if force_reload and session_id in self._loaded_sessions:
            old_client = self._session_clients.get(session_id, self.acp)
            try:
                await old_client.call("session/close", {"sessionId": session_id}, timeout=5)
            except Exception:
                pass
            self._loaded_sessions.pop(session_id, None)
            self._session_clients.pop(session_id, None)

        if session_id in self._loaded_sessions:
            self._loaded_sessions.move_to_end(session_id)
            return {"sessionId": session_id, "loaded": True}

        # Evict oldest idle loaded session if over LRU limit
        if len(self._loaded_sessions) >= cfg.agent_max_loaded_sessions:
            for old_sid in list(self._loaded_sessions.keys()):
                if self._session_state.get(old_sid, "idle") == "idle" and old_sid != session_id:
                    old_client = self._session_clients.get(old_sid, self.acp)
                    try:
                        await old_client.call("session/close", {"sessionId": old_sid}, timeout=5)
                    except Exception:
                        pass
                    self._loaded_sessions.pop(old_sid, None)
                    self._session_clients.pop(old_sid, None)
                    break

        client = await self._get_client_for_cwd(resolved_cwd)
        collector = _ReplayCollector(session_id)
        self._replaying[session_id] = collector

        try:
            res = await client.call(
                "session/load",
                {"sessionId": session_id, "cwd": resolved_cwd, "mcpServers": []},
                timeout=30,
            )
        finally:
            self._replaying.pop(session_id, None)

        if "error" in res:
            err_msg = res["error"].get("message", str(res["error"]))
            raise RuntimeError(f"ACP session/load failed: {err_msg}")

        self._loaded_sessions[session_id] = resolved_cwd
        self._session_clients[session_id] = client
        self._session_state.setdefault(session_id, "idle")

        res_data = res.get("result", {})
        config_options = res_data.get("configOptions") or collector.config_options
        if config_options:
            self._session_configs[session_id] = config_options
        if collector.commands:
            self._session_commands[session_id] = collector.commands

        pid = compute_project_id(resolved_cwd)
        title = collector.title or res_data.get("title")
        agent_store.get_or_create_session(
            session_id=session_id,
            project_id=pid,
            cwd=resolved_cwd,
            title=title,
        )

        # Persist replayed history when available
        sig = get_conversation_db_signature(session_id) or ""
        if collector.messages:
            agent_store.replace_session_history(
                session_id=session_id,
                messages_list=collector.messages,
                tool_calls_list=collector.tool_calls,
                synced_sig=sig,
            )
        else:
            agent_store.update_session(session_id, last_synced_sig=sig)

        agent_store.update_session(
            session_id,
            title=title,
            config_options=config_options if config_options else None,
            last_synced_sig=sig,
        )
        return res_data

    async def sync_session_if_stale(
        self,
        session_id: str,
        cwd: str = "",
        force: bool = False,
        broadcast: bool = True,
    ) -> bool:
        """
        Checks if the conversation on disk changed (e.g. from PC desktop app)
        or hasn't been synced into agent.db yet. Reloads from ACP if stale.
        Returns True if history was synced/updated.
        """
        lock = self._get_session_lock(session_id)
        async with lock:
            if self._session_state.get(session_id, "idle") != "idle":
                return False

            disk_sig = get_conversation_db_signature(session_id)
            stored_sig = agent_store.get_synced_signature(session_id)
            msg_count = agent_store.get_message_count(session_id)

            needs_sync = (
                force
                or (disk_sig is not None and disk_sig != stored_sig)
                or (msg_count == 0 and disk_sig is not None)
            )
            if not needs_sync:
                return False

            await self.ensure_session_loaded(session_id, cwd=cwd, force_reload=True)
            if broadcast:
                await self._broadcast_history_synced(session_id)
            return True

    async def _pc_sync_watcher_loop(self):
        """
        Polls active subscribed idle sessions every 2.5s for disk `.db`/`.db-wal`
        changes made by the PC desktop app and pushes live refreshes to mobile.
        """
        while True:
            try:
                await asyncio.sleep(2.5)
                active_sids = [
                    sid for sid, subs in list(self._subscribers.items())
                    if subs and self._session_state.get(sid, "idle") == "idle"
                ]
                for sid in active_sids:
                    disk_sig = get_conversation_db_signature(sid)
                    stored_sig = agent_store.get_synced_signature(sid)
                    if disk_sig and disk_sig != stored_sig:
                        # Short settle delay in case PC SQLite transaction is still flushing
                        await asyncio.sleep(0.6)
                        if self._session_state.get(sid, "idle") == "idle":
                            try:
                                synced = await self.sync_session_if_stale(sid, broadcast=True)
                                if synced:
                                    await logger_bus.log("INFO", "HUB", f"Synced PC changes -> mobile for session {sid[:8]}")
                            except Exception:
                                pass
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(2.5)

    async def create_session(
        self,
        cwd: str,
        model: Optional[str] = None,
        mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        await self.initialize()
        norm_cwd = normalize_cwd(cwd)
        cfg = config_manager.load()

        if not self._known_project_paths:
            try:
                await self.list_projects()
            except Exception:
                pass

        if not is_allowed_project_cwd(norm_cwd, self._known_project_paths, cfg.agent_project_roots):
            raise ValueError(f"Directory is not an allowed workspace path: {norm_cwd}")

        # Spawn/reuse an ACP client rooted at norm_cwd so workspace_uris[0] matches this project!
        client = await self._get_client_for_cwd(norm_cwd)

        res = await client.call(
            "session/new",
            {"cwd": norm_cwd, "mcpServers": []},
            timeout=25,
        )
        res_data = res.get("result", {})
        sid = res_data.get("sessionId")
        if not sid:
            raise RuntimeError(f"Failed to obtain new session from ACP: {res}")

        self._loaded_sessions[sid] = norm_cwd
        self._session_clients[sid] = client
        self._session_cwds[sid] = norm_cwd
        self._session_state[sid] = "idle"
        self._known_project_paths.add(norm_cwd)

        config_options = res_data.get("configOptions") or []
        if config_options:
            self._session_configs[sid] = config_options

        pid = compute_project_id(norm_cwd)
        chosen_model = model or cfg.agent_default_model
        chosen_mode = mode or cfg.agent_default_mode

        if chosen_model:
            try:
                await client.call(
                    "session/set_config_option",
                    {"sessionId": sid, "configId": "model", "value": chosen_model},
                    timeout=5,
                )
            except Exception:
                pass

        if chosen_mode:
            try:
                await client.call(
                    "session/set_config_option",
                    {"sessionId": sid, "configId": "mode", "value": chosen_mode},
                    timeout=5,
                )
            except Exception:
                pass

        agent_store.get_or_create_session(
            session_id=sid,
            project_id=pid,
            cwd=norm_cwd,
            title="New Conversation",
            model=chosen_model,
            mode=chosen_mode,
        )
        agent_store.update_session(
            sid,
            model=chosen_model,
            mode=chosen_mode,
            config_options=config_options if config_options else None,
        )

        return {
            "sessionId": sid,
            "projectId": pid,
            "cwd": norm_cwd,
            "model": chosen_model,
            "mode": chosen_mode,
            "models": res_data.get("models"),
            "modes": res_data.get("modes"),
            "configOptions": config_options,
        }

    async def set_session_option(self, session_id: str, config_id: str, value: str) -> Dict[str, Any]:
        resolved_cwd = await self._resolve_session_cwd(session_id)
        await self.ensure_session_loaded(session_id, resolved_cwd)
        client = self._session_clients.get(session_id, self.acp)

        res = await client.call(
            "session/set_config_option",
            {"sessionId": session_id, "configId": config_id, "value": value},
            timeout=10,
        )
        result = res.get("result", {})
        if config_id == "model":
            agent_store.update_session(session_id, model=value)
        elif config_id == "mode":
            agent_store.update_session(session_id, mode=value)

        if result.get("configOptions"):
            self._session_configs[session_id] = result["configOptions"]
            agent_store.update_session(session_id, config_options=result["configOptions"])
        else:
            # Update local cached config option value
            opts = self.get_session_config_options(session_id)
            for opt in opts:
                if opt.get("id") == config_id:
                    opt["currentValue"] = value
            if opts:
                agent_store.update_session(session_id, config_options=opts)

        await self.broadcast_to_session(
            session_id,
            "config",
            {"configId": config_id, "value": value, "configOptions": self.get_session_config_options(session_id)},
        )
        return result

    # --- Prompt & Turn Execution ---

    async def submit_prompt(
        self,
        session_id: str,
        client_msg_id: str,
        text: str,
        cwd: str = "",
        images: Optional[List[Dict[str, Any]]] = None,
    ):
        await self.initialize()

        now_ts = datetime.now().timestamp()
        if client_msg_id in self._dedupe_ids and (now_ts - self._dedupe_ids[client_msg_id]) < 600:
            return
        self._dedupe_ids[client_msg_id] = now_ts

        current_state = self._session_state.get(session_id, "idle")
        if current_state in {"running", "awaiting_permission"}:
            q = self._session_queues.setdefault(session_id, [])
            if len(q) >= 3:
                await self.broadcast_to_session(
                    session_id,
                    "error",
                    {"message": "Session queue is full (max 3 queued turns)."},
                )
                return

            q.append({"client_msg_id": client_msg_id, "text": text, "cwd": cwd, "images": images})
            await self.broadcast_to_session(
                session_id,
                "queued",
                {"queue_position": len(q), "client_msg_id": client_msg_id},
            )
            await self.broadcast_session_state(session_id)
            return

        await self._start_turn(session_id, client_msg_id, text, cwd, images)

    async def _start_turn(
        self,
        session_id: str,
        client_msg_id: str,
        text: str,
        cwd: str = "",
        images: Optional[List[Dict[str, Any]]] = None,
    ):
        resolved_cwd = await self._resolve_session_cwd(session_id, cwd)

        # Pull latest PC changes before prompting if stale on disk
        try:
            synced = await self.sync_session_if_stale(session_id, cwd=resolved_cwd, broadcast=True)
            if not synced:
                await self.ensure_session_loaded(session_id, resolved_cwd)
        except Exception as exc:
            await self.broadcast_to_session(
                session_id,
                "error",
                {"message": f"Failed loading session before prompt: {exc}"},
            )
            return

        self._session_state[session_id] = "running"
        _set_thread_execution_state(prevent_sleep=True)

        user_msg_id = f"user-{client_msg_id}"
        agent_store.save_message(
            message_id=user_msg_id,
            session_id=session_id,
            role="user",
            content=text,
        )

        await self.broadcast_to_session(
            session_id,
            "user_message",
            {"id": user_msg_id, "text": text, "client_msg_id": client_msg_id},
        )
        await self.broadcast_to_session(session_id, "turn_started", {"turn_id": client_msg_id})
        await self.broadcast_session_state(session_id)

        self._active_turns[session_id] = {
            "turn_id": client_msg_id,
            "user_msg_id": user_msg_id,
            "assistant_msg_id": f"ai-{client_msg_id}",
            "text_chunks": [],
            "thought_chunks": [],
            "start_time": iso_utc_now(),
        }

        prompt_content: List[Dict[str, Any]] = [{"type": "text", "text": text}]
        if images:
            for img in images:
                prompt_content.append({"type": "image", "data": img.get("data"), "mimeType": img.get("mimeType")})

        asyncio.create_task(self._execute_acp_prompt(session_id, prompt_content))

    async def _execute_acp_prompt(self, session_id: str, prompt_content: List[Dict[str, Any]]):
        client = self._session_clients.get(session_id, self.acp)
        try:
            res = await client.call(
                "session/prompt",
                {"sessionId": session_id, "prompt": prompt_content},
                timeout=600,
            )
            if "error" in res:
                err_msg = res["error"].get("message", str(res["error"]))
                await self.broadcast_to_session(session_id, "error", {"message": err_msg})
                await self._finalize_turn(session_id, "error", {})
                return

            res_data = res.get("result", {})
            stop_reason = res_data.get("stopReason", "end_turn")
            usage = res_data.get("usage", {})
            await self._finalize_turn(session_id, stop_reason, usage)
        except Exception as exc:
            await logger_bus.log("ERROR", "HUB", f"Prompt execution error for session {session_id}: {exc}")
            await self.broadcast_to_session(
                session_id,
                "error",
                {"message": f"Execution error: {exc}"},
            )
            await self._finalize_turn(session_id, "error", {})

    async def _finalize_turn(self, session_id: str, stop_reason: str, usage: Dict[str, Any]):
        turn = self._active_turns.pop(session_id, {})
        full_text = "".join(turn.get("text_chunks", []))
        full_thoughts = "".join(turn.get("thought_chunks", []))
        ai_msg_id = turn.get("assistant_msg_id", f"ai-{session_id}")

        agent_store.save_message(
            message_id=ai_msg_id,
            session_id=session_id,
            role="assistant",
            content=full_text,
            thoughts=full_thoughts,
            stop_reason=stop_reason,
            input_tokens=usage.get("inputTokens", 0),
            output_tokens=usage.get("outputTokens", 0),
        )

        # Record current disk signature so watcher does not treat our own turn as a PC edit
        sig = get_conversation_db_signature(session_id) or ""
        if sig:
            agent_store.update_session(session_id, last_synced_sig=sig)

        if detect_quota_exhaustion(full_text):
            await self.broadcast_to_session(
                session_id,
                "warning",
                {
                    "kind": "quota",
                    "message": "Antigravity quota limit reached on this model. Switch to Claude Sonnet or Gemini Flash.",
                },
            )

        await self.broadcast_to_session(
            session_id,
            "turn_ended",
            {
                "stop_reason": stop_reason,
                "usage": usage,
                "full_text": full_text,
            },
        )

        self._session_state[session_id] = "idle"
        await self.broadcast_session_state(session_id)

        if not any(st in {"running", "awaiting_permission"} for st in self._session_state.values()):
            _set_thread_execution_state(prevent_sleep=False)

        q = self._session_queues.get(session_id, [])
        if q:
            next_prompt = q.pop(0)
            await self._start_turn(
                session_id,
                next_prompt["client_msg_id"],
                next_prompt["text"],
                next_prompt["cwd"],
                next_prompt.get("images"),
            )

    async def cancel_turn(self, session_id: str):
        client = self._session_clients.get(session_id, self.acp)
        try:
            await client.call("session/cancel", {"sessionId": session_id}, timeout=10)
        except Exception:
            pass

        self._session_state[session_id] = "idle"
        await self.broadcast_to_session(
            session_id,
            "turn_ended",
            {"stop_reason": "cancelled", "usage": {}},
        )
        await self.broadcast_session_state(session_id)

    # --- Permission Resolution ---

    async def respond_to_permission(self, session_id: str, request_id: str, option_id: Optional[str]):
        perm = self._pending_permissions.pop(str(request_id), None)
        if not perm:
            return

        client = self._session_clients.get(session_id, self.acp)
        raw_req_id = perm.get("rawRequestId", request_id)
        client.respond_to_permission_request(raw_req_id, option_id)

        chosen = option_id or "cancelled"
        status = "allowed" if (option_id and ("allow" in option_id.lower() or "accept" in option_id.lower())) else "denied"
        agent_store.resolve_pending_permission(str(request_id), chosen_option=chosen, status=status)

        self._session_state[session_id] = "running"
        await self.broadcast_to_session(
            session_id,
            "permission_resolved",
            {
                "request_id": str(request_id),
                "option_id": chosen,
                "status": status,
            },
        )
        await self.broadcast_session_state(session_id)

    # --- ACP Callbacks ---

    async def _on_acp_session_update(self, session_id: str, update: Dict[str, Any]):
        # Route `session/load` replay updates to the replay collector
        collector = self._replaying.get(session_id)
        if collector is not None:
            collector.handle_update(update)
            return

        u_type = update.get("sessionUpdate")

        if u_type == "user_message_chunk":
            # Skip live echo if we already persisted/broadcasted user_message in _start_turn
            if session_id in self._active_turns:
                return
            text = (update.get("content") or {}).get("text", "")
            if text:
                uid = f"user-live-{datetime.now().timestamp()}"
                agent_store.save_message(message_id=uid, session_id=session_id, role="user", content=text)
                await self.broadcast_to_session(session_id, "user_message", {"id": uid, "text": text})

        elif u_type == "agent_message_chunk":
            content = update.get("content", {})
            text = content.get("text", "")
            turn = self._active_turns.get(session_id)
            if turn:
                turn["text_chunks"].append(text)
            await self.broadcast_to_session(session_id, "agent_chunk", {"text": text})

        elif u_type in {"agent_thought_chunk", "thought_chunk"}:
            content = update.get("content", {})
            text = content.get("text", "")
            turn = self._active_turns.get(session_id)
            if turn:
                turn["thought_chunks"].append(text)
            await self.broadcast_to_session(session_id, "thought_chunk", {"text": text})

        elif u_type == "tool_call":
            tid = str(update.get("toolCallId") or datetime.now().timestamp())
            turn = self._active_turns.get(session_id, {})
            msg_id = turn.get("assistant_msg_id", "")
            raw_output = update.get("rawOutput")
            preview, has_more = truncate_tool_output(raw_output)

            agent_store.save_tool_call(
                tool_call_id=tid,
                session_id=session_id,
                message_id=msg_id,
                name=update.get("name", ""),
                title=update.get("title", ""),
                kind=update.get("kind", ""),
                args=update.get("args"),
                status=update.get("status", "in_progress"),
                raw_output=preview,
            )
            await self.broadcast_to_session(
                session_id,
                "tool_call",
                {
                    "tool_call_id": tid,
                    "name": update.get("name", ""),
                    "title": update.get("title", ""),
                    "kind": update.get("kind", ""),
                    "args": update.get("args"),
                    "status": update.get("status", "in_progress"),
                    "preview": preview if preview else None,
                    "has_more": has_more,
                },
            )

        elif u_type == "tool_call_update":
            tid = str(update.get("toolCallId") or "")
            status = update.get("status", "completed")
            raw_output = update.get("rawOutput")
            preview, has_more = truncate_tool_output(raw_output)

            agent_store.update_tool_call(
                tool_call_id=tid,
                status=status,
                raw_output=preview if raw_output is not None else None,
            )
            await self.broadcast_to_session(
                session_id,
                "tool_update",
                {
                    "tool_call_id": tid,
                    "status": status,
                    "preview": preview,
                    "has_more": has_more,
                },
            )

        elif u_type == "session_info_update":
            title = update.get("title")
            if title:
                agent_store.update_session(session_id, title=title)
                await self.broadcast_to_session(session_id, "title", {"title": title})

        elif u_type == "available_commands_update":
            cmds = update.get("availableCommands", [])
            self._session_commands[session_id] = cmds
            await self.broadcast_to_session(session_id, "commands", {"commands": cmds})

        elif u_type == "config_option_update":
            opts = update.get("configOptions", [])
            self._session_configs[session_id] = opts
            agent_store.update_session(session_id, config_options=opts)
            await self.broadcast_to_session(session_id, "config", {"configOptions": opts})

    async def _on_acp_permission_request(
        self,
        request_id: Any,
        session_id: str,
        tool_call: Dict[str, Any],
        options: List[Dict[str, Any]],
    ):
        str_req_id = str(request_id)
        self._session_state[session_id] = "awaiting_permission"
        tid = tool_call.get("toolCallId", "")

        self._pending_permissions[str_req_id] = {
            "requestId": str_req_id,
            "rawRequestId": request_id,
            "sessionId": session_id,
            "toolCall": tool_call,
            "options": options,
            "timestamp": iso_utc_now(),
        }

        agent_store.record_pending_permission(
            request_id=str_req_id,
            session_id=session_id,
            tool_call_id=tid,
            options=options,
        )

        await self.broadcast_to_session(
            session_id,
            "permission_request",
            {
                "request_id": str_req_id,
                "tool_call": tool_call,
                "options": options,
            },
        )
        await self.broadcast_session_state(session_id)

    async def _on_acp_process_exit(self, exit_code: int, exiting_client: Optional[AcpClient] = None):
        await logger_bus.log("WARN", "HUB", f"ACP daemon exited (code {exit_code}). Marking affected sessions idle.")
        affected_sids = [
            sid for sid, client in list(self._session_clients.items())
            if exiting_client is None or client is exiting_client
        ]
        for sid in affected_sids:
            self._loaded_sessions.pop(sid, None)
            self._session_clients.pop(sid, None)
            st = self._session_state.get(sid, "idle")
            if st in {"running", "awaiting_permission"}:
                await self.broadcast_to_session(
                    sid,
                    "error",
                    {"message": f"Antigravity process exited (code {exit_code}). Ready to resume."},
                )
                self._session_state[sid] = "idle"
                await self.broadcast_session_state(sid)

        if exiting_client is None or exiting_client is self.acp:
            self._initialized = False

        for req_id, perm in list(self._pending_permissions.items()):
            if perm.get("sessionId") in affected_sids:
                self._pending_permissions.pop(req_id, None)

        if not any(st in {"running", "awaiting_permission"} for st in self._session_state.values()):
            _set_thread_execution_state(prevent_sleep=False)


agent_hub = AgentHub()

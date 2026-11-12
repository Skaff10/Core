import asyncio
import ctypes
import os
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Set, List, Tuple
from fastapi import WebSocket

from core.config_manager import config_manager
from core.logger import logger_bus
from services.agent.acp_client import AcpClient
from services.agent.events import (
    truncate_tool_output,
    detect_quota_exhaustion,
    iso_utc_now,
)
from services.agent.projects import (
    group_sessions_by_project,
    compute_project_id,
    normalize_cwd,
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


class AgentHub:
    """
    Central Coordinator for Antigravity Agents:
    - Maintains single AcpClient connection.
    - Manages multi-session state machines (idle, running, awaiting_permission).
    - Session prompt queueing and turn concurrency.
    - Real-time fanout to mobile WebSockets.
    - Consolidates stream chunks into SQLite store.
    """

    def __init__(self):
        self.acp = AcpClient()
        self._loaded_sessions: OrderedDict[str, str] = OrderedDict()  # sid -> cwd
        self._session_state: Dict[str, str] = {}  # sid -> idle|running|awaiting_permission
        self._pending_permissions: Dict[str, Dict[str, Any]] = {}  # req_id -> details
        self._active_turns: Dict[str, Dict[str, Any]] = {}  # sid -> turn buffer details
        self._session_queues: Dict[str, List[Dict[str, Any]]] = {}  # sid -> queued prompts
        self._dedupe_ids: Dict[str, float] = {}  # client_msg_id -> timestamp
        self._subscribers: Dict[str, Set[WebSocket]] = {}  # sid -> set of WebSockets
        self._all_client_sockets: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._initialized = False

    async def initialize(self) -> bool:
        async with self._lock:
            if self._initialized and self.acp.is_alive():
                return True

            self.acp.on_session_update = self._on_acp_session_update
            self.acp.on_permission_request = self._on_acp_permission_request
            self.acp.on_process_exit = self._on_acp_process_exit

            ok = await self.acp.start()
            self._initialized = ok
            return ok

    def is_healthy(self) -> bool:
        return self.acp.is_alive()

    def register_client_socket(self, ws: WebSocket):
        self._all_client_sockets.add(ws)

    def unregister_client_socket(self, ws: WebSocket):
        self._all_client_sockets.discard(ws)
        for sid, subs in list(self._subscribers.items()):
            subs.discard(ws)

    async def subscribe_session(self, ws: WebSocket, session_id: str, since_seq: int = 0):
        if session_id not in self._subscribers:
            self._subscribers[session_id] = set()
        self._subscribers[session_id].add(ws)

        # Replay any events since `since_seq`
        events = agent_store.get_events_since(session_id, since_seq)
        for ev in events:
            try:
                await ws.send_json({"type": "event", "data": ev})
            except Exception:
                break

        # Also emit current turn state
        state = self._session_state.get(session_id, "idle")
        active_perm = next(
            (p for p in self._pending_permissions.values() if p.get("sessionId") == session_id),
            None,
        )
        try:
            await ws.send_json(
                {
                    "type": "session_state",
                    "data": {
                        "session_id": session_id,
                        "state": state,
                        "pending_permission": active_perm,
                        "queue_depth": len(self._session_queues.get(session_id, [])),
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
        for ws in subs:
            try:
                await ws.send_json({"type": "event", "data": event})
            except Exception:
                dead.append(ws)

        for ws in dead:
            subs.discard(ws)

        return event

    async def broadcast_session_state(self, session_id: str):
        state = self._session_state.get(session_id, "idle")
        active_perm = next(
            (p for p in self._pending_permissions.values() if p.get("sessionId") == session_id),
            None,
        )
        subs = self._subscribers.get(session_id, set())
        dead = []
        for ws in subs:
            try:
                await ws.send_json(
                    {
                        "type": "session_state",
                        "data": {
                            "session_id": session_id,
                            "state": state,
                            "pending_permission": active_perm,
                            "queue_depth": len(self._session_queues.get(session_id, [])),
                        },
                    }
                )
            except Exception:
                dead.append(ws)
        for ws in dead:
            subs.discard(ws)

    # --- Project and Session Management ---

    async def list_projects(self) -> List[Dict[str, Any]]:
        await self.initialize()
        raw_res = await self.acp.call("session/list", {}, timeout=15)
        raw_sessions = raw_res.get("result", {}).get("sessions", [])

        running_ids = {sid for sid, st in self._session_state.items() if st == "running"}
        perm_ids = {sid for sid, st in self._session_state.items() if st == "awaiting_permission"}

        return group_sessions_by_project(
            raw_sessions,
            running_session_ids=running_ids,
            awaiting_permission_ids=perm_ids,
        )

    async def ensure_session_loaded(self, session_id: str, cwd: str) -> Dict[str, Any]:
        await self.initialize()
        norm_cwd = normalize_cwd(cwd)
        cfg = config_manager.load()

        # Enforce LRU eviction if loaded sessions exceed cap
        if len(self._loaded_sessions) >= cfg.agent_max_loaded_sessions:
            for old_sid in list(self._loaded_sessions.keys()):
                if self._session_state.get(old_sid, "idle") == "idle" and old_sid != session_id:
                    try:
                        await self.acp.call("session/close", {"sessionId": old_sid}, timeout=5)
                    except Exception:
                        pass
                    self._loaded_sessions.pop(old_sid, None)
                    break

        if session_id in self._loaded_sessions:
            self._loaded_sessions.move_to_end(session_id)
            return {"sessionId": session_id, "loaded": True}

        res = await self.acp.call(
            "session/load",
            {"sessionId": session_id, "cwd": norm_cwd, "mcpServers": []},
            timeout=30,
        )
        self._loaded_sessions[session_id] = norm_cwd
        self._session_state.setdefault(session_id, "idle")

        res_data = res.get("result", {})
        pid = compute_project_id(norm_cwd)
        agent_store.get_or_create_session(
            session_id=session_id,
            project_id=pid,
            cwd=norm_cwd,
            title=res_data.get("title"),
        )
        return res_data

    async def create_session(
        self,
        cwd: str,
        model: Optional[str] = None,
        mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        await self.initialize()
        norm_cwd = normalize_cwd(cwd)
        cfg = config_manager.load()

        res = await self.acp.call(
            "session/new",
            {"cwd": norm_cwd, "mcpServers": []},
            timeout=25,
        )
        res_data = res.get("result", {})
        sid = res_data.get("sessionId")
        if not sid:
            raise RuntimeError(f"Failed to obtain new session from ACP: {res}")

        self._loaded_sessions[sid] = norm_cwd
        self._session_state[sid] = "idle"

        pid = compute_project_id(norm_cwd)
        chosen_model = model or cfg.agent_default_model
        chosen_mode = mode or cfg.agent_default_mode

        # Set default model and mode
        if chosen_model:
            try:
                await self.acp.call(
                    "session/set_config_option",
                    {"sessionId": sid, "configId": "model", "value": chosen_model},
                    timeout=5,
                )
            except Exception:
                pass

        if chosen_mode:
            try:
                await self.acp.call(
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

        return {
            "sessionId": sid,
            "projectId": pid,
            "cwd": norm_cwd,
            "model": chosen_model,
            "mode": chosen_mode,
            "models": res_data.get("models"),
            "modes": res_data.get("modes"),
            "configOptions": res_data.get("configOptions"),
        }

    async def set_session_option(self, session_id: str, config_id: str, value: str) -> Dict[str, Any]:
        await self.initialize()
        res = await self.acp.call(
            "session/set_config_option",
            {"sessionId": session_id, "configId": config_id, "value": value},
            timeout=10,
        )
        if config_id == "model":
            agent_store.update_session(session_id, model=value)
        elif config_id == "mode":
            agent_store.update_session(session_id, mode=value)

        await self.broadcast_to_session(
            session_id,
            "config",
            {"configId": config_id, "value": value},
        )
        return res.get("result", {})

    # --- Prompt & Turn Execution ---

    async def submit_prompt(
        self,
        session_id: str,
        client_msg_id: str,
        text: str,
        cwd: str,
        images: Optional[List[Dict[str, Any]]] = None,
    ):
        await self.initialize()

        # Deduplication check
        now_ts = datetime.now().timestamp()
        if client_msg_id in self._dedupe_ids and (now_ts - self._dedupe_ids[client_msg_id]) < 600:
            return  # Duplicate prompt detected; ignored
        self._dedupe_ids[client_msg_id] = now_ts

        # Check turn state
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
        cwd: str,
        images: Optional[List[Dict[str, Any]]] = None,
    ):
        await self.ensure_session_loaded(session_id, cwd)

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

        # Initialize active turn buffer
        self._active_turns[session_id] = {
            "turn_id": client_msg_id,
            "user_msg_id": user_msg_id,
            "assistant_msg_id": f"ai-{client_msg_id}",
            "text_chunks": [],
            "thought_chunks": [],
            "start_time": iso_utc_now(),
        }

        # Build ACP prompt structure
        prompt_content = [{"type": "text", "text": text}]
        if images:
            for img in images:
                prompt_content.append({"type": "image", "data": img.get("data"), "mimeType": img.get("mimeType")})

        asyncio.create_task(self._execute_acp_prompt(session_id, prompt_content))

    async def _execute_acp_prompt(self, session_id: str, prompt_content: List[Dict[str, Any]]):
        try:
            res = await self.acp.call(
                "session/prompt",
                {"sessionId": session_id, "prompt": prompt_content},
                timeout=600,
            )
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

        # Check for quota exhaustion
        if detect_quota_exhaustion(full_text):
            await self.broadcast_to_session(
                session_id,
                "warning",
                {
                    "kind": "quota",
                    "message": "Antigravity quota limit reached on this model. Switch to Claude Sonnet or upgrade.",
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

        # Release PC sleep prevention if no other turns are active
        if not any(st in {"running", "awaiting_permission"} for st in self._session_state.values()):
            _set_thread_execution_state(prevent_sleep=False)

        # Drain next prompt from queue if present
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
        try:
            await self.acp.call("session/cancel", {"sessionId": session_id}, timeout=10)
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

        self.acp.respond_to_permission_request(request_id, option_id)
        chosen = option_id or "cancelled"
        status = "allowed" if (option_id and "allow" in option_id.lower()) else "denied"
        agent_store.resolve_pending_permission(request_id, chosen_option=chosen, status=status)

        # Revert session state to running
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
        u_type = update.get("sessionUpdate")

        if u_type == "agent_message_chunk":
            content = update.get("content", {})
            text = content.get("text", "")
            turn = self._active_turns.get(session_id)
            if turn:
                turn["text_chunks"].append(text)
            await self.broadcast_to_session(session_id, "agent_chunk", {"text": text})

        elif u_type == "thought_chunk":
            content = update.get("content", {})
            text = content.get("text", "")
            turn = self._active_turns.get(session_id)
            if turn:
                turn["thought_chunks"].append(text)
            await self.broadcast_to_session(session_id, "thought_chunk", {"text": text})

        elif u_type == "tool_call":
            tid = update.get("toolCallId") or str(datetime.now().timestamp())
            turn = self._active_turns.get(session_id, {})
            msg_id = turn.get("assistant_msg_id", "")
            agent_store.save_tool_call(
                tool_call_id=tid,
                session_id=session_id,
                message_id=msg_id,
                name=update.get("name", ""),
                title=update.get("title", ""),
                kind=update.get("kind", ""),
                args=update.get("args"),
                status=update.get("status", "in_progress"),
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
                },
            )

        elif u_type == "tool_call_update":
            tid = update.get("toolCallId")
            status = update.get("status", "completed")
            raw_output = update.get("rawOutput", {})
            preview, has_more = truncate_tool_output(raw_output)

            agent_store.update_tool_call(
                tool_call_id=tid,
                status=status,
                raw_output=preview,
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
            await self.broadcast_to_session(session_id, "commands", {"commands": cmds})

        elif u_type == "config_option_update":
            opts = update.get("configOptions", [])
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

    async def _on_acp_process_exit(self, exit_code: int):
        await logger_bus.log("WARN", "HUB", f"ACP daemon exited (code {exit_code}). Marking in-flight turns as interrupted.")
        for sid, st in list(self._session_state.items()):
            if st in {"running", "awaiting_permission"}:
                await self.broadcast_to_session(
                    sid,
                    "error",
                    {"message": f"Antigravity process exited (code {exit_code}). Ready to resume."},
                )
                self._session_state[sid] = "idle"
                await self.broadcast_session_state(sid)

        self._pending_permissions.clear()
        self._loaded_sessions.clear()
        _set_thread_execution_state(prevent_sleep=False)


agent_hub = AgentHub()


import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

from services.agent.events import build_phone_event

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "agent.db"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentStore:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    def _init_db(self):
        with self._lock:
            conn = self._get_connection()
            try:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS sessions (
                        session_id TEXT PRIMARY KEY,
                        project_id TEXT,
                        cwd TEXT,
                        title TEXT,
                        model TEXT,
                        mode TEXT,
                        last_seq INTEGER DEFAULT 0,
                        created_at TEXT,
                        updated_at TEXT
                    );

                    CREATE TABLE IF NOT EXISTS messages (
                        id TEXT PRIMARY KEY,
                        session_id TEXT,
                        role TEXT,
                        content TEXT,
                        thoughts TEXT,
                        stop_reason TEXT,
                        input_tokens INTEGER DEFAULT 0,
                        output_tokens INTEGER DEFAULT 0,
                        created_at TEXT
                    );

                    CREATE TABLE IF NOT EXISTS tool_calls (
                        tool_call_id TEXT PRIMARY KEY,
                        session_id TEXT,
                        message_id TEXT,
                        name TEXT,
                        title TEXT,
                        kind TEXT,
                        args_json TEXT,
                        raw_output TEXT,
                        status TEXT,
                        created_at TEXT
                    );

                    CREATE TABLE IF NOT EXISTS pending_permissions (
                        request_id TEXT PRIMARY KEY,
                        session_id TEXT,
                        tool_call_id TEXT,
                        options_json TEXT,
                        status TEXT,
                        created_at TEXT,
                        resolved_at TEXT,
                        chosen_option TEXT
                    );

                    CREATE TABLE IF NOT EXISTS events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT,
                        seq INTEGER,
                        kind TEXT,
                        payload_json TEXT,
                        created_at TEXT
                    );

                    CREATE INDEX IF NOT EXISTS idx_events_session_seq ON events(session_id, seq);
                    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
                    CREATE INDEX IF NOT EXISTS idx_tools_session ON tool_calls(session_id, created_at);
                    """
                )
                conn.commit()
            finally:
                conn.close()

    def get_or_create_session(
        self,
        session_id: str,
        project_id: str,
        cwd: str,
        title: Optional[str] = None,
        model: Optional[str] = None,
        mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.cursor()
                cur.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,))
                row = cur.fetchone()
                now = _iso_now()
                if row:
                    return dict(row)

                cur.execute(
                    """
                    INSERT INTO sessions (session_id, project_id, cwd, title, model, mode, last_seq, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                    """,
                    (session_id, project_id, cwd, title or "Untitled Session", model or "", mode or "default", now, now),
                )
                conn.commit()
                return {
                    "session_id": session_id,
                    "project_id": project_id,
                    "cwd": cwd,
                    "title": title or "Untitled Session",
                    "model": model or "",
                    "mode": mode or "default",
                    "last_seq": 0,
                    "created_at": now,
                    "updated_at": now,
                }
            finally:
                conn.close()

    def update_session(
        self,
        session_id: str,
        title: Optional[str] = None,
        model: Optional[str] = None,
        mode: Optional[str] = None,
        updated_at: Optional[str] = None,
    ):
        with self._lock:
            conn = self._get_connection()
            try:
                updates = []
                params = []
                if title is not None:
                    updates.append("title = ?")
                    params.append(title)
                if model is not None:
                    updates.append("model = ?")
                    params.append(model)
                if mode is not None:
                    updates.append("mode = ?")
                    params.append(mode)
                now = updated_at or _iso_now()
                updates.append("updated_at = ?")
                params.append(now)

                if updates:
                    params.append(session_id)
                    query = f"UPDATE sessions SET {', '.join(updates)} WHERE session_id = ?"
                    conn.execute(query, tuple(params))
                    conn.commit()
            finally:
                conn.close()

    def append_event(self, session_id: str, kind: str, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.cursor()
                cur.execute("SELECT last_seq FROM sessions WHERE session_id = ?", (session_id,))
                row = cur.fetchone()
                current_seq = row["last_seq"] if row else 0
                next_seq = current_seq + 1

                payload_json = json.dumps(payload, ensure_ascii=False)
                now = _iso_now()

                cur.execute(
                    "INSERT INTO events (session_id, seq, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                    (session_id, next_seq, kind, payload_json, now),
                )
                cur.execute(
                    "UPDATE sessions SET last_seq = ?, updated_at = ? WHERE session_id = ?",
                    (next_seq, now, session_id),
                )
                conn.commit()

                event = build_phone_event(session_id, next_seq, kind, payload)
                return next_seq, event
            finally:
                conn.close()

    def get_events_since(self, session_id: str, since_seq: int) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT seq, kind, payload_json, created_at FROM events WHERE session_id = ? AND seq > ? ORDER BY seq ASC",
                    (session_id, since_seq),
                )
                rows = cur.fetchall()
                events = []
                for r in rows:
                    payload = json.loads(r["payload_json"])
                    events.append({
                        "v": 1,
                        "session_id": session_id,
                        "seq": r["seq"],
                        "ts": r["created_at"],
                        "kind": r["kind"],
                        "payload": payload,
                    })
                return events
            finally:
                conn.close()

    def save_message(
        self,
        message_id: str,
        session_id: str,
        role: str,
        content: str,
        thoughts: str = "",
        stop_reason: str = "",
        input_tokens: int = 0,
        output_tokens: int = 0,
    ):
        with self._lock:
            conn = self._get_connection()
            try:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO messages
                    (id, session_id, role, content, thoughts, stop_reason, input_tokens, output_tokens, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (message_id, session_id, role, content, thoughts, stop_reason, input_tokens, output_tokens, _iso_now()),
                )
                conn.commit()
            finally:
                conn.close()

    def save_tool_call(
        self,
        tool_call_id: str,
        session_id: str,
        message_id: str,
        name: str,
        title: str,
        kind: str,
        args: Any,
        status: str = "in_progress",
    ):
        with self._lock:
            conn = self._get_connection()
            try:
                args_json = json.dumps(args, ensure_ascii=False) if args else "{}"
                conn.execute(
                    """
                    INSERT OR REPLACE INTO tool_calls
                    (tool_call_id, session_id, message_id, name, title, kind, args_json, raw_output, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (tool_call_id, session_id, message_id, name, title, kind, args_json, "", status, _iso_now()),
                )
                conn.commit()
            finally:
                conn.close()

    def update_tool_call(
        self,
        tool_call_id: str,
        status: str,
        raw_output: Optional[str] = None,
    ):
        with self._lock:
            conn = self._get_connection()
            try:
                if raw_output is not None:
                    conn.execute(
                        "UPDATE tool_calls SET status = ?, raw_output = ? WHERE tool_call_id = ?",
                        (status, raw_output, tool_call_id),
                    )
                else:
                    conn.execute(
                        "UPDATE tool_calls SET status = ? WHERE tool_call_id = ?",
                        (status, tool_call_id),
                    )
                conn.commit()
            finally:
                conn.close()

    def record_pending_permission(
        self,
        request_id: str,
        session_id: str,
        tool_call_id: str,
        options: List[Dict[str, Any]],
    ):
        with self._lock:
            conn = self._get_connection()
            try:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO pending_permissions
                    (request_id, session_id, tool_call_id, options_json, status, created_at)
                    VALUES (?, ?, ?, ?, 'pending', ?)
                    """,
                    (request_id, session_id, tool_call_id, json.dumps(options, ensure_ascii=False), _iso_now()),
                )
                conn.commit()
            finally:
                conn.close()

    def resolve_pending_permission(
        self,
        request_id: str,
        chosen_option: str,
        status: str = "resolved",
    ):
        with self._lock:
            conn = self._get_connection()
            try:
                conn.execute(
                    """
                    UPDATE pending_permissions
                    SET status = ?, chosen_option = ?, resolved_at = ?
                    WHERE request_id = ?
                    """,
                    (status, chosen_option, _iso_now(), request_id),
                )
                conn.commit()
            finally:
                conn.close()

    def get_tool_call(self, tool_call_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.cursor()
                cur.execute("SELECT * FROM tool_calls WHERE tool_call_id = ?", (tool_call_id,))
                row = cur.fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def get_session_history(
        self,
        session_id: str,
        limit: int = 50,
        before: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.cursor()
                if before:
                    cur.execute(
                        """
                        SELECT * FROM messages
                        WHERE session_id = ? AND created_at < ?
                        ORDER BY created_at DESC
                        LIMIT ?
                        """,
                        (session_id, before, limit),
                    )
                else:
                    cur.execute(
                        """
                        SELECT * FROM messages
                        WHERE session_id = ?
                        ORDER BY created_at DESC
                        LIMIT ?
                        """,
                        (session_id, limit),
                    )
                rows = cur.fetchall()

                # Get tools linked to this session
                cur.execute(
                    "SELECT * FROM tool_calls WHERE session_id = ? ORDER BY created_at ASC",
                    (session_id,),
                )
                tool_rows = cur.fetchall()
                tools_by_msg = {}
                for tr in tool_rows:
                    mid = tr["message_id"] or ""
                    if mid not in tools_by_msg:
                        tools_by_msg[mid] = []
                    t_dict = dict(tr)
                    t_dict["args"] = json.loads(t_dict.get("args_json") or "{}")
                    tools_by_msg[mid].append(t_dict)

                result = []
                for r in reversed(rows):
                    m_dict = dict(r)
                    m_dict["tools"] = tools_by_msg.get(m_dict["id"], [])
                    result.append(m_dict)
                return result
            finally:
                conn.close()


agent_store = AgentStore()


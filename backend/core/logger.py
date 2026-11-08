import asyncio
from datetime import datetime
from typing import List, Dict, Any
from fastapi import WebSocket


class LogBroadcaster:
    def __init__(self, max_history: int = 200):
        self.history: List[Dict[str, Any]] = []
        self.max_history = max_history
        self.connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)
        # Send existing log history upon connection
        for entry in self.history:
            try:
                await websocket.send_json({"type": "log", "data": entry})
            except Exception:
                pass

    def disconnect(self, websocket: WebSocket):
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def log(self, level: str, source: str, message: str, meta: str = ""):
        entry = {
            "timestamp": datetime.now().strftime("%H:%M:%S.%f")[:-3],
            "level": level.upper(),
            "source": source.upper(),
            "message": message,
            "meta": meta,
        }
        self.history.append(entry)
        if len(self.history) > self.max_history:
            self.history.pop(0)

        # Print to console as well
        print(f"[{entry['timestamp']}] [{entry['level']}] [{entry['source']}] {message} {meta}")

        disconnected = []
        for ws in self.connections:
            try:
                await ws.send_json({"type": "log", "data": entry})
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)

    def log_sync(self, level: str, source: str, message: str, meta: str = ""):
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.log(level, source, message, meta))
        except RuntimeError:
            pass


logger_bus = LogBroadcaster()


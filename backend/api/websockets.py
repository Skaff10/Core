import asyncio
from datetime import datetime
from typing import List, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.auth import verify_ws_auth
from core.logger import logger_bus
from services.window_monitor import get_foreground_telemetry
from services.cli_runner import run_cli_agent_stream
from services.web_ai_relay import relay_prompt_to_web_ai

router = APIRouter(tags=["WebSockets"])


class MobileEventBus:
    def __init__(self):
        self.clients: List[WebSocket] = []

    async def register(self, ws: WebSocket):
        self.clients.append(ws)

    def unregister(self, ws: WebSocket):
        if ws in self.clients:
            self.clients.remove(ws)

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        dead = []
        for ws in self.clients:
            try:
                await ws.send_json({"type": event_type, "data": data})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister(ws)


mobile_bus = MobileEventBus()


@router.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    is_valid = await verify_ws_auth(websocket)
    if not is_valid:
        await websocket.close(code=1008)
        return

    await logger_bus.connect(websocket)
    client_host = websocket.client.host if websocket.client else "unknown"
    await logger_bus.log("INFO", "WS_STREAM", f"Live log terminal connected ({client_host})")

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        logger_bus.disconnect(websocket)
    except Exception:
        logger_bus.disconnect(websocket)


@router.websocket("/ws/monitor")
async def websocket_foreground_monitor(websocket: WebSocket):
    is_valid = await verify_ws_auth(websocket)
    if not is_valid:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    await mobile_bus.register(websocket)
    client_host = websocket.client.host if websocket.client else "unknown"
    await logger_bus.log(
        "INFO",
        "WS_MONITOR",
        f"Mobile foreground telemetry stream linked ({client_host})",
    )

    try:
        while True:
            telemetry = get_foreground_telemetry()
            await websocket.send_json({"type": "foreground", "data": telemetry})
            await asyncio.sleep(2.0)
    except WebSocketDisconnect:
        mobile_bus.unregister(websocket)
        await logger_bus.log("INFO", "WS_MONITOR", f"Mobile telemetry stream disconnected ({client_host})")
    except Exception:
        mobile_bus.unregister(websocket)


@router.websocket("/ws/chat")
async def websocket_ai_chat(websocket: WebSocket):
    """
    Phase 4 Real-Time AI Relay WebSocket:
    - Local CLI agents (`antigravity`, `claude-code`, `powershell`): spawns process, pipes prompt, and streams stdout chunks in real time.
    - Web AI agents (`chatgpt`, `gemini`, `claude-web`): dispatches via Playwright headless/persistent Chromium controller and returns scraped Markdown response.
    """
    is_valid = await verify_ws_auth(websocket)
    if not is_valid:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    client_host = websocket.client.host if websocket.client else "unknown"
    await logger_bus.log("INFO", "AI_RELAY", f"Mobile AI Chat session connected ({client_host})")

    try:
        while True:
            payload = await websocket.receive_json()
            agent = str(payload.get("agent", "powershell")).lower()
            prompt = str(payload.get("prompt", "")).strip()
            msg_id = str(payload.get("id", datetime.now().timestamp()))

            if not prompt:
                continue

            await logger_bus.log(
                "EXEC",
                "AI_PROMPT",
                f"[{agent.upper()}] {prompt[:80]}",
                client_host,
            )

            await websocket.send_json(
                {
                    "type": "stream_start",
                    "id": msg_id,
                    "agent": agent,
                    "timestamp": datetime.now().strftime("%H:%M:%S"),
                }
            )

            if agent in {"antigravity", "claude-code", "powershell"}:
                loop = asyncio.get_running_loop()

                def _consume_cli():
                    chunks = []
                    for line in run_cli_agent_stream(agent, prompt):
                        chunks.append(line)
                    return chunks

                lines = await loop.run_in_executor(None, _consume_cli)
                if not lines:
                    await websocket.send_json(
                        {
                            "type": "stream_chunk",
                            "id": msg_id,
                            "chunk": f"[{agent.upper()}] Command completed with no stdout output.",
                        }
                    )
                else:
                    for line in lines:
                        await websocket.send_json(
                            {
                                "type": "stream_chunk",
                                "id": msg_id,
                                "chunk": line,
                            }
                        )
            else:
                response_text = await relay_prompt_to_web_ai(agent, prompt)
                await websocket.send_json(
                    {
                        "type": "stream_chunk",
                        "id": msg_id,
                        "chunk": response_text,
                    }
                )

            await websocket.send_json(
                {
                    "type": "stream_end",
                    "id": msg_id,
                    "agent": agent,
                    "timestamp": datetime.now().strftime("%H:%M:%S"),
                }
            )
    except WebSocketDisconnect:
        await logger_bus.log("INFO", "AI_RELAY", f"Mobile AI Chat session closed ({client_host})")
    except Exception as exc:
        await logger_bus.log("ERROR", "AI_RELAY", f"AI Chat WebSocket error: {exc}")

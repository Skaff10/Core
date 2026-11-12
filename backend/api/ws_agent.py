import json
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.auth import verify_token_value, is_local_request
from core.logger import logger_bus
from services.agent.hub import agent_hub

router = APIRouter(tags=["Agent WebSockets"])


@router.websocket("/ws/agent")
async def websocket_agent_multiplex(websocket: WebSocket):
    """
    Unified real-time ACP agent socket for mobile app.
    Supports session subscription, turn streaming, live tool execution cards,
    interactive Allow/Deny approvals, and model/mode switches.
    """
    client_host = websocket.client.host if websocket.client else "unknown"
    is_local = is_local_request(client_host)

    token = websocket.query_params.get("token")
    auth_verified = is_local or verify_token_value(token)

    await websocket.accept()

    # If not verified via query param, expect first frame to authenticate
    if not auth_verified:
        try:
            init_msg_raw = await websocket.receive_text()
            init_msg = json.loads(init_msg_raw)
            if init_msg.get("type") == "auth":
                provided_token = init_msg.get("token", "")
                if verify_token_value(provided_token):
                    auth_verified = True
                    await websocket.send_json({"type": "auth_ok"})
                else:
                    await websocket.close(code=1008, reason="Invalid token")
                    return
            else:
                await websocket.close(code=1008, reason="First frame must be auth")
                return
        except Exception:
            await websocket.close(code=1008, reason="Authentication failed")
            return

    agent_hub.register_client_socket(websocket)
    await logger_bus.log("INFO", "AGENT_WS", f"Agent WebSocket stream linked ({client_host})")

    try:
        while True:
            raw_text = await websocket.receive_text()
            if not raw_text:
                continue

            try:
                msg = json.loads(raw_text)
            except Exception:
                continue

            m_type = msg.get("type")

            if m_type == "ping":
                await websocket.send_json({"type": "pong", "time": datetime.now().isoformat()})

            elif m_type == "subscribe":
                session_id = msg.get("session_id", "")
                since_seq = int(msg.get("since_seq", 0))
                if session_id:
                    await agent_hub.subscribe_session(websocket, session_id, since_seq)

            elif m_type == "unsubscribe":
                session_id = msg.get("session_id", "")
                if session_id:
                    agent_hub.unsubscribe_session(websocket, session_id)

            elif m_type == "prompt":
                session_id = msg.get("session_id", "")
                client_msg_id = msg.get("client_msg_id", str(datetime.now().timestamp()))
                text = msg.get("text", "").strip()
                cwd = msg.get("cwd", "")
                images = msg.get("images")
                if session_id and text:
                    await agent_hub.submit_prompt(
                        session_id=session_id,
                        client_msg_id=client_msg_id,
                        text=text,
                        cwd=cwd,
                        images=images,
                    )

            elif m_type == "cancel":
                session_id = msg.get("session_id", "")
                if session_id:
                    await agent_hub.cancel_turn(session_id)

            elif m_type == "permission_response":
                session_id = msg.get("session_id", "")
                request_id = str(msg.get("request_id", ""))
                option_id = msg.get("option_id")
                if session_id and request_id:
                    await agent_hub.respond_to_permission(session_id, request_id, option_id)

            elif m_type == "set_option":
                session_id = msg.get("session_id", "")
                config_id = msg.get("config_id", "")
                val = msg.get("value", "")
                if session_id and config_id and val:
                    await agent_hub.set_session_option(session_id, config_id, val)

    except WebSocketDisconnect:
        agent_hub.unregister_client_socket(websocket)
        await logger_bus.log("INFO", "AGENT_WS", f"Agent WebSocket stream closed ({client_host})")
    except Exception as exc:
        agent_hub.unregister_client_socket(websocket)
        await logger_bus.log("ERROR", "AGENT_WS", f"Agent WebSocket error: {exc}")


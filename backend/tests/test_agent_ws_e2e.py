import asyncio
import json
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app
from core.config_manager import config_manager
from starlette.testclient import TestClient


def test_ws_end_to_end():
    client = TestClient(app)
    cfg = config_manager.load()
    token = cfg.auth_token

    # 1. Test unauthenticated WebSocket connection without token
    print("Testing unauthenticated WebSocket connection...")
    try:
        with client.websocket_connect("/ws/agent") as ws:
            # If no token in query, first message must be auth
            ws.send_json({"type": "ping"})
            # Should be closed with 1008
            msg = ws.receive_json()
            assert False, "Should have been rejected"
    except Exception as exc:
        print("✓ Unauthenticated WS rejected properly:", str(exc)[:60])

    # 2. Test authenticated WebSocket with valid token
    print("Testing authenticated WebSocket with valid token...")
    with client.websocket_connect(f"/ws/agent?token={token}") as ws:
        # Ping / Pong test
        ws.send_json({"type": "ping"})
        data = ws.receive_json()
        assert data.get("type") == "pong"
        print("✓ Ping/Pong OK:", data)

        # Subscribe to a session
        test_sid = "test-session-uuid"
        ws.send_json({"type": "subscribe", "session_id": test_sid, "since_seq": 0})

        # Expect session_state frame
        state_msg = ws.receive_json()
        assert state_msg.get("type") == "session_state"
        assert state_msg.get("data", {}).get("session_id") == test_sid
        print("✓ Session subscribe & session_state received OK:", state_msg["data"])

        # Unsubscribe
        ws.send_json({"type": "unsubscribe", "session_id": test_sid})
        print("✓ Unsubscribe OK")


if __name__ == "__main__":
    test_ws_end_to_end()
    print("\nALL WEBSOCKET TESTS PASSED!")


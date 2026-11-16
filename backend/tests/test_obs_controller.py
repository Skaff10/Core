import asyncio
import base64
import hashlib
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import websockets
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.config_manager import config_manager
from main import app
from services.obs_controller import (
    ObsController,
    compute_obs_auth,
    format_duration_ms,
)


def test_helpers():
    assert format_duration_ms(0) == "00:00"
    assert format_duration_ms(65000) == "01:05"
    assert format_duration_ms(3661000) == "01:01:01"

    # Verify SHA256 challenge/salt auth algorithm
    pw, salt, challenge = "secret123", "mysalt", "mychallenge"
    sec = base64.b64encode(hashlib.sha256((pw + salt).encode()).digest()).decode()
    expected = base64.b64encode(hashlib.sha256((sec + challenge).encode()).digest()).decode()
    assert compute_obs_auth(pw, salt, challenge) == expected


def test_enable_ws_when_stopped():
    with tempfile.TemporaryDirectory() as td:
        cfg_path = Path(td) / "config.json"
        cfg_path.write_text(
            json.dumps({
                "server_enabled": False,
                "server_port": 4455,
                "auth_required": True,
                "server_password": "pw",
            }),
            encoding="utf-8",
        )
        ctrl = ObsController(ws_config_path=cfg_path)

        # Should refuse while OBS is running
        with patch.object(ctrl, "is_obs_running", return_value=(True, 1234)):
            assert ctrl.enable_ws_when_stopped() is False

        # Should enable + create backup when OBS is stopped
        with patch.object(ctrl, "is_obs_running", return_value=(False, None)):
            assert ctrl.enable_ws_when_stopped() is True

        updated = json.loads(cfg_path.read_text(encoding="utf-8"))
        assert updated["server_enabled"] is True
        assert updated["server_password"] == "pw"
        assert (Path(td) / "config.json.bak").is_file()


def test_mock_obs_ws_lifecycle():
    async def _run():
        with tempfile.TemporaryDirectory() as td:
            cfg_path = Path(td) / "config.json"
            state = {"active": False, "paused": False, "duration": 0, "bytes": 0}
            salt = "test_salt"
            challenge = "test_challenge"
            password = "obs_test_password"
            expected_auth = compute_obs_auth(password, salt, challenge)

            async def handler(ws):
                await ws.send(json.dumps({
                    "op": 0,
                    "d": {
                        "obsWebSocketVersion": "5.5.0",
                        "rpcVersion": 1,
                        "authentication": {"challenge": challenge, "salt": salt},
                    },
                }))
                ident_raw = await ws.recv()
                ident = json.loads(ident_raw)
                assert ident["op"] == 1
                assert ident["d"]["authentication"] == expected_auth
                await ws.send(json.dumps({"op": 2, "d": {"negotiatedRpcVersion": 1}}))

                async for raw in ws:
                    req = json.loads(raw)
                    if req.get("op") != 6:
                        continue
                    d = req["d"]
                    rtype = d["requestType"]
                    rid = d["requestId"]
                    resp_data = {}

                    if rtype == "GetRecordStatus":
                        resp_data = {
                            "outputActive": state["active"],
                            "outputPaused": state["paused"],
                            "outputDuration": state["duration"],
                            "outputBytes": state["bytes"],
                        }
                    elif rtype == "StartRecord":
                        state["active"] = True
                        state["paused"] = False
                        state["duration"] = 12000
                        state["bytes"] = 2048000
                    elif rtype == "PauseRecord":
                        state["paused"] = True
                    elif rtype == "ResumeRecord":
                        state["paused"] = False
                    elif rtype == "StopRecord":
                        state["active"] = False
                        state["paused"] = False
                        resp_data = {"outputPath": "F:/Recording/test_clip.mkv"}

                    await ws.send(json.dumps({
                        "op": 7,
                        "d": {
                            "requestType": rtype,
                            "requestId": rid,
                            "requestStatus": {"result": True, "code": 100},
                            "responseData": resp_data,
                        },
                    }))

            server = await websockets.serve(handler, "127.0.0.1", 0)
            port = server.sockets[0].getsockname()[1]
            cfg_path.write_text(
                json.dumps({
                    "server_enabled": True,
                    "server_port": port,
                    "auth_required": True,
                    "server_password": password,
                }),
                encoding="utf-8",
            )

            ctrl = ObsController(ws_config_path=cfg_path)
            status_events = []

            async def _on_change(st):
                status_events.append(st["state"])

            ctrl.on_status_change = _on_change

            try:
                with patch.object(ctrl, "is_obs_running", return_value=(True, 9999)):
                    st0 = await ctrl.get_status(refresh=True)
                    assert st0["state"] == "standby"
                    assert st0["ws_connected"] is True

                    st1 = await ctrl.start_recording(auto_launch=False)
                    assert st1["state"] == "recording"
                    assert st1["recording"] is True
                    assert st1["duration_text"] == "00:12"

                    st2 = await ctrl.pause_recording()
                    assert st2["state"] == "paused"
                    assert st2["paused"] is True

                    st3 = await ctrl.resume_recording()
                    assert st3["state"] == "recording"
                    assert st3["paused"] is False

                    st4 = await ctrl.stop_recording()
                    assert st4["state"] == "standby"
                    assert st4["recording"] is False
                    assert st4["last_output_path"] == "F:/Recording/test_clip.mkv"
            finally:
                await ctrl.stop()
                server.close()
                await server.wait_closed()

            assert "recording" in status_events
            assert "paused" in status_events

    asyncio.run(_run())


def test_obs_routes_auth_and_actions():
    client = TestClient(app)
    cfg = config_manager.load()
    headers = {"Authorization": f"Bearer {cfg.auth_token}"}

    # Unauthenticated fails
    assert client.get("/api/obs/status").status_code == 401

    fake_status = {
        "installed": True,
        "obs_path": "C:/Program Files/obs-studio/bin/64bit/obs64.exe",
        "running": True,
        "pid": 4242,
        "ws_configured_enabled": True,
        "ws_port": 4455,
        "ws_connected": True,
        "state": "recording",
        "recording": True,
        "paused": False,
        "duration_ms": 5000,
        "duration_text": "00:05",
        "bytes": 1024,
        "last_output_path": None,
        "error": None,
    }

    with patch("api.routes_obs.obs_controller.get_status", return_value=fake_status), \
         patch("api.routes_obs.obs_controller.start_recording", return_value=fake_status), \
         patch("api.routes_obs.obs_controller.pause_recording", return_value={**fake_status, "state": "paused", "paused": True}), \
         patch("api.routes_obs.obs_controller.stop_recording", return_value={**fake_status, "state": "standby", "recording": False, "last_output_path": "F:/Recording/out.mkv"}):

        r1 = client.get("/api/obs/status", headers=headers)
        assert r1.status_code == 200
        assert r1.json()["state"] == "recording"

        r2 = client.post("/api/obs/record/pause", headers=headers)
        assert r2.status_code == 200
        assert r2.json()["obs"]["paused"] is True

        r3 = client.post("/api/obs/record/stop", headers=headers)
        assert r3.status_code == 200
        assert r3.json()["obs"]["last_output_path"] == "F:/Recording/out.mkv"


def test_elevation_error_740_message():
    async def _run():
        with tempfile.TemporaryDirectory() as td:
            obs_exe = Path(td) / "obs64.exe"
            obs_exe.write_text("stub")
            ctrl = ObsController(ws_config_path=Path(td) / "missing.json")
            err = OSError(740, "Elevation required")
            err.winerror = 740

            with patch("services.obs_controller.locate_obs_binary", return_value={"found": True, "path": str(obs_exe)}), \
                 patch.object(ctrl, "is_obs_running", return_value=(False, None)), \
                 patch("services.obs_controller.subprocess.Popen", side_effect=err), \
                 patch("services.obs_controller.ctypes.windll.shell32.ShellExecuteW", return_value=5):
                try:
                    await ctrl.open_obs(start_recording=False)
                    assert False, "Expected elevation RuntimeError"
                except RuntimeError as exc:
                    assert "WinError 740" in str(exc)

    asyncio.run(_run())


if __name__ == "__main__":
    test_helpers()
    test_enable_ws_when_stopped()
    test_mock_obs_ws_lifecycle()
    test_obs_routes_auth_and_actions()
    test_elevation_error_740_message()
    print("ALL OBS CONTROLLER TESTS PASSED!")

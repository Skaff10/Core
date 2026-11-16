import sys
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app
from core.config_manager import config_manager


def test_routes_agent():
    cfg = config_manager.load()
    token = cfg.auth_token
    headers = {"Authorization": f"Bearer {token}"}

    with TestClient(app) as client:
        # 1. Unauthenticated request should fail with 401
        res = client.get("/api/agent/status")
        assert res.status_code == 401, f"Expected 401 without auth, got {res.status_code}"

        # 2. Authenticated status check
        res = client.get("/api/agent/status", headers=headers)
        assert res.status_code == 200, f"Expected 200 with auth, got {res.status_code}"
        data = res.json()
        assert data["binary"]["found"] is True
        assert data["appDataDir"] == "antigravity"
        print("Status API OK:", data["binary"]["version"], "dataDir:", data["appDataDir"])

        # 3. List projects
        res = client.get("/api/agent/projects", headers=headers)
        assert res.status_code == 200
        projects = res.json().get("projects", [])
        print(f"Projects API OK: found {len(projects)} active projects")
        assert len(projects) > 0

        core_proj = next((p for p in projects if p["name"] == "Core"), projects[0])
        pid = core_proj["id"]
        res = client.get(f"/api/agent/projects/{pid}/sessions", headers=headers)
        assert res.status_code == 200
        sessions = res.json().get("sessions", [])
        print(f"Project {core_proj['name']} sessions OK ({len(sessions)} sessions)")

        # Verify history replay on real desktop session (ffdbcb55 or newest Core session)
        target_sid = next(
            (s["sessionId"] for s in sessions if s["sessionId"] == "ffdbcb55-8dbd-4f55-873d-99c642812db4"),
            sessions[0]["sessionId"],
        )
        res = client.get(
            f"/api/agent/sessions/{target_sid}/history?cwd={core_proj['path']}",
            headers=headers,
        )
        assert res.status_code == 200
        hist = res.json()
        msgs = hist.get("messages", [])
        print(f"Session history API OK for {target_sid}: {len(msgs)} messages, {len(hist.get('config_options', []))} configOptions")
        assert len(msgs) > 0, "Expected non-empty replayed history from desktop session!"


if __name__ == "__main__":
    test_routes_agent()
    print("\nALL AGENT API TESTS PASSED!")

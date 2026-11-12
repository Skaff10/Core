import os
import sys
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app
from core.config_manager import config_manager


def test_routes_agent():
    client = TestClient(app)
    cfg = config_manager.load()
    token = cfg.auth_token

    # 1. Unauthenticated request should fail with 401
    res = client.get("/api/agent/status")
    assert res.status_code == 401, f"Expected 401 without auth, got {res.status_code}"

    # 2. Authenticated status check
    headers = {"Authorization": f"Bearer {token}"}
    res = client.get("/api/agent/status", headers=headers)
    assert res.status_code == 200, f"Expected 200 with auth, got {res.status_code}"
    data = res.json()
    assert data["binary"]["found"] is True
    print("✓ Status API OK:", data["binary"]["version"])

    # 3. List projects
    res = client.get("/api/agent/projects", headers=headers)
    assert res.status_code == 200
    projects = res.json().get("projects", [])
    print(f"✓ Projects API OK: found {len(projects)} active projects")

    if projects:
        first_proj = projects[0]
        pid = first_proj["id"]
        res = client.get(f"/api/agent/projects/{pid}/sessions", headers=headers)
        assert res.status_code == 200
        print(f"✓ Project {first_proj['name']} sessions OK ({len(first_proj['sessions'])} sessions)")

        if first_proj["sessions"]:
            sid = first_proj["sessions"][0]["sessionId"]
            res = client.get(f"/api/agent/sessions/{sid}/history", headers=headers)
            assert res.status_code == 200
            print(f"✓ Session history API OK for {sid}")


if __name__ == "__main__":
    test_routes_agent()
    print("\nALL AGENT API TESTS PASSED!")


import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.agent.agy_locator import locate_agy_binary
from services.agent.projects import normalize_cwd, compute_project_id, group_sessions_by_project
from services.agent.store import AgentStore
from services.agent.events import build_phone_event, truncate_tool_output, detect_quota_exhaustion


def test_agy_locator():
    loc = locate_agy_binary()
    assert loc["found"] is True
    assert loc["path"] is not None
    assert "agy.exe" in loc["path"].lower()
    print("✓ test_agy_locator passed:", loc)


def test_projects_normalization():
    cases = {
        "/f%3A/Temporary%20Codebae/Core": "F:\\Temporary Codebae\\Core",
        "/d%3A/FTune": "D:\\FTune",
        "/C:/Users/skaf/test": "C:\\Users\\skaf\\test",
        "F:\\Temporary Codebae\\Core": "F:\\Temporary Codebae\\Core",
    }
    for raw, expected in cases.items():
        norm = normalize_cwd(raw)
        assert norm == expected, f"Failed: {raw} -> {norm} != {expected}"

    pid1 = compute_project_id("F:\\Temporary Codebae\\Core")
    pid2 = compute_project_id("f:\\temporary codebae\\core")
    assert pid1 == pid2, "compute_project_id must be case-insensitive"

    raw_sessions = [
        {"sessionId": "s1", "cwd": "/f%3A/Temporary%20Codebae/Core", "title": "Session 1", "updatedAt": "2026-11-12T10:00:00Z"},
        {"sessionId": "s2", "cwd": "F:\\Temporary Codebae\\Core", "title": "Session 2", "updatedAt": "2026-11-12T11:00:00Z"},
        {"sessionId": "s3", "cwd": "/d%3A/FTune", "title": "FTune Session", "updatedAt": "2026-11-12T09:00:00Z"},
        {"sessionId": "s4", "cwd": "C:\\Users\\skaf\\.gemini\\antigravity\\brain\\xxx", "title": "Scratch", "updatedAt": "2026-11-12T08:00:00Z"},
    ]
    projects = group_sessions_by_project(raw_sessions, running_session_ids={"s2"})
    assert len(projects) == 2, f"Expected 2 projects (excluding scratch), got {len(projects)}"

    core_proj = next(p for p in projects if p["name"] == "Core")
    assert core_proj["sessionCount"] == 2
    assert core_proj["hasRunningTurn"] is True
    assert core_proj["sessions"][0]["sessionId"] == "s2"  # Newest first
    print("✓ test_projects_normalization passed")


def test_events_and_quota():
    assert detect_quota_exhaustion("⚠ Individual quota reached. Please upgrade...") is True
    assert detect_quota_exhaustion("Normal model response") is False

    short_out, has_more = truncate_tool_output("short", max_chars=10)
    assert short_out == "short" and has_more is False

    long_out, has_more = truncate_tool_output("A" * 50, max_chars=10)
    assert has_more is True
    assert "truncated" in long_out

    ev = build_phone_event("sid1", 1, "agent_chunk", {"text": "hello"})
    assert ev["v"] == 1
    assert ev["session_id"] == "sid1"
    assert ev["seq"] == 1
    print("✓ test_events_and_quota passed")


def test_store(tmp_path):
    store = AgentStore(db_path=tmp_path / "test_agent.db")
    s = store.get_or_create_session("sess1", "proj1", "C:\\test", "Test Session")
    assert s["session_id"] == "sess1"

    seq1, ev1 = store.append_event("sess1", "agent_chunk", {"text": "chunk1"})
    assert seq1 == 1

    seq2, ev2 = store.append_event("sess1", "agent_chunk", {"text": "chunk2"})
    assert seq2 == 2

    since = store.get_events_since("sess1", 1)
    assert len(since) == 1
    assert since[0]["seq"] == 2

    store.save_message("msg1", "sess1", "user", "Hello agent")
    store.save_tool_call("tool1", "sess1", "msg1", "run_command", "Run cmd", "execute", {"cmd": "ls"})
    store.update_tool_call("tool1", "completed", "output 123")

    history = store.get_session_history("sess1")
    assert len(history) == 1
    assert history[0]["id"] == "msg1"
    assert len(history[0]["tools"]) == 1
    assert history[0]["tools"][0]["status"] == "completed"

    store.record_pending_permission("req1", "sess1", "tool1", [{"optionId": "allow"}])
    store.resolve_pending_permission("req1", "allow", "allowed")
    print("✓ test_store passed")


if __name__ == "__main__":
    import tempfile
    test_agy_locator()
    test_projects_normalization()
    test_events_and_quota()
    with tempfile.TemporaryDirectory() as td:
        test_store(Path(td))
    print("\nALL AGENT CORE UNIT TESTS PASSED!")


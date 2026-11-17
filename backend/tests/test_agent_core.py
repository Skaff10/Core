import asyncio
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.agent.agy_locator import locate_agy_binary, get_conversation_db_signature
from services.agent.projects import (
    normalize_cwd,
    compute_project_id,
    group_sessions_by_project,
    is_allowed_project_cwd,
)
from services.agent.store import AgentStore
from services.agent.hub import _ReplayCollector, AgentHub
from services.agent.events import build_phone_event, truncate_tool_output, detect_quota_exhaustion


def test_agy_locator():
    loc = locate_agy_binary()
    assert loc["found"] is True
    assert loc["path"] is not None
    assert "agy.exe" in loc["path"].lower()


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
    assert pid1 == pid2

    raw_sessions = [
        {"sessionId": "s1", "cwd": "/f%3A/Temporary%20Codebae/Core", "title": "Session 1", "updatedAt": "2026-11-12T10:00:00Z"},
        {"sessionId": "s2", "cwd": "F:\\Temporary Codebae\\Core", "title": "Session 2", "updatedAt": "2026-11-12T11:00:00Z"},
        {"sessionId": "s3", "cwd": "/d%3A/FTune", "title": "FTune Session", "updatedAt": "2026-11-12T09:00:00Z"},
        {"sessionId": "s4", "cwd": "C:\\Users\\skaf\\.gemini\\antigravity\\brain\\xxx", "title": "Scratch", "updatedAt": "2026-11-12T08:00:00Z"},
    ]
    projects = group_sessions_by_project(raw_sessions, running_session_ids={"s2"})
    assert len(projects) == 2

    core_proj = next(p for p in projects if p["name"] == "Core")
    assert core_proj["sessionCount"] == 2
    assert core_proj["hasRunningTurn"] is True
    assert core_proj["sessions"][0]["sessionId"] == "s2"


def test_allowed_project_cwd():
    assert is_allowed_project_cwd(r"F:\Temporary Codebae\Core", [r"F:\Temporary Codebae\Core"]) is True
    assert is_allowed_project_cwd(r"C:\Windows", [r"C:\Windows"]) is False
    assert is_allowed_project_cwd("C:\\", ["C:\\"]) is False
    assert is_allowed_project_cwd(r"C:\Users\skaf\.gemini\antigravity\brain\123") is False


def test_events_and_quota():
    assert detect_quota_exhaustion("⚠ Individual quota reached. Please upgrade...") is True
    assert detect_quota_exhaustion("Normal model response") is False

    short_out, has_more = truncate_tool_output("short", max_chars=10)
    assert short_out == "short" and has_more is False

    dict_out, has_more2 = truncate_tool_output({"output": "line 1\nline 2"})
    assert dict_out == "line 1\nline 2" and has_more2 is False

    long_out, has_more3 = truncate_tool_output("A" * 50, max_chars=10)
    assert has_more3 is True
    assert "truncated" in long_out

    ev = build_phone_event("sid1", 1, "agent_chunk", {"text": "hello"})
    assert ev["v"] == 1
    assert ev["session_id"] == "sid1"
    assert ev["seq"] == 1


def test_store_and_replay_order():
    with tempfile.TemporaryDirectory() as td:
        store = AgentStore(db_path=Path(td) / "test_agent.db")
        s = store.get_or_create_session("sess1", "proj1", "C:\\test", "Test Session")
        assert s["session_id"] == "sess1"

        seq1, _ = store.append_event("sess1", "agent_chunk", {"text": "chunk1"})
        seq2, _ = store.append_event("sess1", "agent_chunk", {"text": "chunk2"})
        assert (seq1, seq2) == (1, 2)

        since = store.get_events_since("sess1", 1)
        assert len(since) == 1 and since[0]["seq"] == 2

        collector = _ReplayCollector("sess1")
        # Multi-chunk user message followed by thoughts before text, tool call, and answer
        collector.handle_update({"sessionUpdate": "user_message_chunk", "content": {"text": "proceed ; "}})
        collector.handle_update({"sessionUpdate": "user_message_chunk", "content": {"text": "keep going"}})
        collector.handle_update({"sessionUpdate": "agent_thought_chunk", "content": {"text": "Thinking step 1"}})
        collector.handle_update({
            "sessionUpdate": "tool_call",
            "toolCallId": "tc1",
            "name": "read_file",
            "title": "Read plan.md",
            "kind": "read",
            "args": {"Path": "plan.md"},
            "status": "completed",
            "rawOutput": {"output": "file contents"},
        })
        collector.handle_update({"sessionUpdate": "agent_message_chunk", "content": {"text": "Done!"}})
        collector.handle_update({"sessionUpdate": "session_info_update", "title": "Synced Title"})

        assert len(collector.messages) == 2
        assert collector.messages[0]["role"] == "user"
        assert collector.messages[0]["content"] == "proceed ; keep going"
        assert collector.messages[1]["role"] == "assistant"
        assert collector.messages[1]["thoughts"] == "Thinking step 1"
        assert collector.messages[1]["content"] == "Done!"
        assert collector.title == "Synced Title"

        store.replace_session_history("sess1", collector.messages, collector.tool_calls, synced_sig="sig-v1")
        history = store.get_session_history("sess1")
        assert len(history) == 2
        assert history[0]["role"] == "user"
        assert history[1]["role"] == "assistant"
        assert history[1]["tools"][0]["preview"] == "file contents"
        assert store.get_synced_signature("sess1") == "sig-v1"


def test_hub_live_updates_and_permission_id_type():
    async def _run():
        with tempfile.TemporaryDirectory() as td:
            local_store = AgentStore(db_path=Path(td) / "hub_test.db")
            hub = AgentHub()
            sent_perm_replies = []

            class FakeAcp:
                def is_alive(self):
                    return True

                async def start(self):
                    return True

                async def stop(self):
                    return None

                def respond_to_permission_request(self, request_id, option_id):
                    sent_perm_replies.append((request_id, type(request_id), option_id))

                async def call(self, method, params, timeout=60):
                    if method == "session/load":
                        await hub._on_acp_session_update("s1", {
                            "sessionUpdate": "user_message_chunk",
                            "content": {"text": "PC question"},
                        })
                        await hub._on_acp_session_update("s1", {
                            "sessionUpdate": "agent_message_chunk",
                            "content": {"text": "PC answer"},
                        })
                        return {"result": {"sessionId": "s1", "configOptions": [{"id": "model", "name": "Model", "currentValue": "claude-sonnet-5-5", "options": []}]}}
                    return {"result": {}}

            hub.acp = FakeAcp()
            hub._initialized = True
            fake_cwd = str(Path(td) / "virtual_proj")
            hub._session_cwds["s1"] = fake_cwd

            try:
                with patch("services.agent.hub.agent_store", local_store), \
                     patch("services.agent.hub.get_conversation_db_signature", return_value="sig-123"):

                    synced = await hub.sync_session_if_stale("s1", cwd=fake_cwd, broadcast=False)
                    assert synced is True
                    hist = local_store.get_session_history("s1")
                    assert len(hist) == 2
                    assert hist[0]["content"] == "PC question"
                    assert hist[1]["content"] == "PC answer"

                    # Test string/int permission id preservation
                    await hub._on_acp_permission_request("perm-str-1", "s1", {"toolCallId": "t1", "name": "run_command"}, [{"optionId": "allow_once", "name": "Allow once"}])
                    await hub.respond_to_permission("s1", "perm-str-1", "allow_once")
                    assert sent_perm_replies == [("perm-str-1", str, "allow_once")]

                    # Test agent_thought_chunk mapping during live turn
                    hub._active_turns["s1"] = {"turn_id": "t1", "assistant_msg_id": "ai-1", "text_chunks": [], "thought_chunks": []}
                    await hub._on_acp_session_update("s1", {"sessionUpdate": "agent_thought_chunk", "content": {"text": "deep thought"}})
                    assert hub._active_turns["s1"]["thought_chunks"] == ["deep thought"]
            finally:
                await hub.shutdown()

    asyncio.run(_run())


def test_db_signature_ignores_empty_wal():
    with tempfile.TemporaryDirectory() as td:
        conv_dir = Path(td) / "conversations"
        conv_dir.mkdir(parents=True)
        db_file = conv_dir / "s1.db"
        wal_file = conv_dir / "s1.db-wal"
        db_file.write_bytes(b"sqlite-db")

        with patch("services.agent.agy_locator.get_antigravity_data_dir", return_value=Path(td)):
            sig1 = get_conversation_db_signature("s1")
            assert sig1 is not None and "s1.db-wal" not in sig1

            # 0-byte WAL file touched by SQLite open/close must not change signature
            wal_file.write_bytes(b"")
            sig2 = get_conversation_db_signature("s1")
            assert sig2 == sig1

            # Non-empty WAL file with uncheckpointed writes must change signature
            wal_file.write_bytes(b"wal-frame-data")
            sig3 = get_conversation_db_signature("s1")
            assert sig3 != sig1 and "s1.db-wal" in sig3


def test_config_options_persist_across_reload():
    async def _run():
        with tempfile.TemporaryDirectory() as td:
            local_store = AgentStore(db_path=Path(td) / "hub_cfg_test.db")
            proj_dir = Path(td) / "proj"
            proj_dir.mkdir()
            hub = AgentHub()

            def make_opts(model="gemini-4-argon", thought="medium", mode="default"):
                tl_options = [
                    {"value": "low", "name": "Low"},
                    {"value": "medium", "name": "Medium"},
                    {"value": "high", "name": "High"},
                ]
                if model == "gemini-4-hydrogen":
                    tl_options.append({"value": "xhigh", "name": "Extra"})
                return [
                    {
                        "id": "model",
                        "name": "Model",
                        "currentValue": model,
                        "options": [
                            {"value": "gemini-4-argon", "name": "Gemini 4 Argon"},
                            {"value": "gemini-4-hydrogen", "name": "Gemini 4 Hydrogen"},
                            {"value": "gemini-3.8-flash", "name": "Gemini 3.8 Flash"},
                        ],
                    },
                    {
                        "id": "thought_level",
                        "name": "Thinking Level",
                        "currentValue": thought,
                        "options": tl_options,
                    },
                    {
                        "id": "mode",
                        "name": "Mode",
                        "currentValue": mode,
                        "options": [
                            {"value": "default", "name": "Default"},
                            {"value": "plan", "name": "Plan"},
                        ],
                    },
                ]

            state = {"model": "gemini-4-argon", "thought": "medium", "mode": "default", "load_calls": 0}

            class FakeAcp:
                def is_alive(self):
                    return True

                async def start(self):
                    return True

                async def stop(self):
                    return None

                async def call(self, method, params, timeout=60):
                    if method == "session/new":
                        state.update(model="gemini-4-argon", thought="medium", mode="default")
                        return {"result": {"sessionId": "new-s1", "configOptions": make_opts()}}
                    if method == "session/load":
                        state["load_calls"] += 1
                        # Simulate agy acp resetting configOptions to default on load
                        state.update(model="gemini-4-argon", thought="medium", mode="default")
                        return {"result": {"sessionId": params["sessionId"], "configOptions": make_opts()}}
                    if method == "session/set_config_option":
                        cid = params["configId"]
                        val = params["value"]
                        if cid == "model":
                            state["model"] = val
                        elif cid == "thought_level":
                            state["thought"] = val
                        elif cid == "mode":
                            state["mode"] = val
                        return {"result": {"configOptions": make_opts(state["model"], state["thought"], state["mode"])}}
                    return {"result": {}}

            hub.acp = FakeAcp()
            hub._initialized = True
            hub._known_project_paths.add(str(proj_dir))

            try:
                with patch("services.agent.hub.agent_store", local_store), \
                     patch("services.agent.hub.get_conversation_db_signature", return_value="sig-initial"), \
                     patch("services.agent.hub.is_allowed_project_cwd", return_value=True), \
                     patch.object(hub, "_get_client_for_cwd", return_value=hub.acp):

                    created = await hub.create_session(
                        cwd=str(proj_dir),
                        model="gemini-4-hydrogen",
                        mode="plan",
                        thought_level="xhigh",
                    )
                    assert created["model"] == "gemini-4-hydrogen"
                    assert created["thought_level"] == "xhigh"
                    assert created["mode"] == "plan"
                    assert next(o["currentValue"] for o in created["configOptions"] if o["id"] == "model") == "gemini-4-hydrogen"
                    assert next(o["currentValue"] for o in created["configOptions"] if o["id"] == "thought_level") == "xhigh"

                    # Empty newly-created session with matching sig must NOT force-reload
                    synced = await hub.sync_session_if_stale("new-s1", cwd=str(proj_dir), broadcast=False)
                    assert synced is False
                    assert state["load_calls"] == 0

                    # Change thinking level and model via set_session_option
                    res_opt = await hub.set_session_option("new-s1", "thought_level", "high")
                    assert next(o["currentValue"] for o in res_opt["configOptions"] if o["id"] == "thought_level") == "high"

                    # Simulate forced reload (like PC edit or restart) where ACP resets to gemini-4-argon/medium
                    await hub.ensure_session_loaded("new-s1", cwd=str(proj_dir), force_reload=True)
                    assert state["load_calls"] == 1
                    assert state["model"] == "gemini-4-hydrogen"
                    assert state["thought"] == "high"
                    assert state["mode"] == "plan"
            finally:
                await hub.shutdown()

    asyncio.run(_run())


if __name__ == "__main__":
    test_agy_locator()
    test_projects_normalization()
    test_allowed_project_cwd()
    test_events_and_quota()
    test_store_and_replay_order()
    test_hub_live_updates_and_permission_id_type()
    test_db_signature_ignores_empty_wal()
    test_config_options_persist_across_reload()
    print("\nALL AGENT CORE UNIT TESTS PASSED!")

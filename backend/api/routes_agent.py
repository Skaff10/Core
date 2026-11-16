from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.auth import require_mobile_auth
from core.config_manager import config_manager
from services.agent.agy_locator import locate_agy_binary, get_antigravity_data_dir
from services.agent.hub import agent_hub
from services.agent.store import agent_store

router = APIRouter(prefix="/api/agent", tags=["Agent"])


class CreateSessionRequest(BaseModel):
    cwd: str
    model: Optional[str] = None
    mode: Optional[str] = None


class PermissionResponseRequest(BaseModel):
    request_id: str
    option_id: Optional[str] = None


class SetOptionRequest(BaseModel):
    config_id: str
    value: str


class SyncSessionRequest(BaseModel):
    cwd: Optional[str] = None
    force: bool = True


@router.get("/status", dependencies=[Depends(require_mobile_auth)])
async def get_agent_status():
    locator = locate_agy_binary()
    is_alive = agent_hub.is_healthy()
    cfg = config_manager.load()
    return {
        "status": "online" if is_alive else "offline",
        "binary": locator,
        "appDataDir": cfg.agy_app_data_dir,
        "resolvedDataPath": str(get_antigravity_data_dir()),
        "agentInfo": agent_hub.acp.agent_info if is_alive else None,
        "agentCapabilities": agent_hub.acp.agent_capabilities if is_alive else None,
    }


@router.get("/projects", dependencies=[Depends(require_mobile_auth)])
async def list_projects():
    try:
        projects = await agent_hub.list_projects()
        return {"projects": projects}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed listing projects: {exc}")


@router.get("/projects/{project_id}/sessions", dependencies=[Depends(require_mobile_auth)])
async def list_project_sessions(project_id: str):
    projects = await agent_hub.list_projects()
    match = next((p for p in projects if p["id"] == project_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Project not found.")
    return {"project": match, "sessions": match["sessions"]}


@router.post("/sessions", dependencies=[Depends(require_mobile_auth)])
async def create_new_session(payload: CreateSessionRequest):
    try:
        session_info = await agent_hub.create_session(
            cwd=payload.cwd,
            model=payload.model,
            mode=payload.mode,
        )
        return {"status": "created", "session": session_info}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed creating session: {exc}")


@router.get("/sessions/{session_id}/history", dependencies=[Depends(require_mobile_auth)])
async def get_session_history(
    session_id: str,
    cwd: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    before: Optional[str] = Query(default=None),
):
    sync_error: Optional[str] = None
    try:
        await agent_hub.sync_session_if_stale(session_id, cwd=cwd or "", broadcast=False)
    except Exception as exc:
        sync_error = str(exc)

    history = agent_store.get_session_history(session_id=session_id, limit=limit, before=before)
    sess = agent_store.get_session(session_id)
    return {
        "session_id": session_id,
        "messages": history,
        "session": sess,
        "config_options": agent_hub.get_session_config_options(session_id),
        "commands": agent_hub._session_commands.get(session_id, []),
        "sync_error": sync_error,
    }


@router.post("/sessions/{session_id}/sync", dependencies=[Depends(require_mobile_auth)])
async def sync_session_from_pc(session_id: str, payload: SyncSessionRequest = SyncSessionRequest()):
    try:
        updated = await agent_hub.sync_session_if_stale(
            session_id,
            cwd=payload.cwd or "",
            force=payload.force,
            broadcast=True,
        )
        history = agent_store.get_session_history(session_id=session_id, limit=50)
        return {
            "status": "synced" if updated else "up_to_date",
            "session_id": session_id,
            "messages": history,
            "config_options": agent_hub.get_session_config_options(session_id),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed syncing session: {exc}")


@router.get("/sessions/{session_id}/tool/{tool_call_id}", dependencies=[Depends(require_mobile_auth)])
async def get_tool_call_details(session_id: str, tool_call_id: str):
    tool = agent_store.get_tool_call(tool_call_id)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool call record not found.")
    return {"tool": tool}


@router.post("/sessions/{session_id}/cancel", dependencies=[Depends(require_mobile_auth)])
async def cancel_session_turn(session_id: str):
    await agent_hub.cancel_turn(session_id)
    return {"status": "cancelled", "session_id": session_id}


@router.post("/sessions/{session_id}/permission", dependencies=[Depends(require_mobile_auth)])
async def respond_session_permission(session_id: str, payload: PermissionResponseRequest):
    await agent_hub.respond_to_permission(
        session_id=session_id,
        request_id=payload.request_id,
        option_id=payload.option_id,
    )
    return {"status": "resolved", "request_id": payload.request_id}


@router.post("/sessions/{session_id}/options", dependencies=[Depends(require_mobile_auth)])
async def set_session_config_option(session_id: str, payload: SetOptionRequest):
    try:
        res = await agent_hub.set_session_option(
            session_id=session_id,
            config_id=payload.config_id,
            value=payload.value,
        )
        return {"status": "updated", "result": res}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

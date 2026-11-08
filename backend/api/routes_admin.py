import os
import socket
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.auth import require_local_admin
from core.config_manager import config_manager
from core.logger import logger_bus

router = APIRouter(prefix="/api/admin", tags=["Admin"], dependencies=[Depends(require_local_admin)])


class ActionCreateRequest(BaseModel):
    name: str
    icon: str
    command: str


class PathCreateRequest(BaseModel):
    path: str


class TestActionRequest(BaseModel):
    action_id: str


def get_lan_ipv4() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


@router.get("/state")
async def get_admin_state():
    cfg = config_manager.load()
    paths_with_status = [
        {"path": p, "exists": os.path.exists(p) and os.path.isdir(p)}
        for p in cfg.whitelisted_paths
    ]
    return {
        "hostname": socket.gethostname(),
        "lan_ip": get_lan_ipv4(),
        "port": int(os.getenv("PORT", "8000")),
        "auth_token": cfg.auth_token,
        "pin_code": cfg.pin_code,
        "quick_actions": cfg.quick_actions,
        "whitelisted_paths": paths_with_status,
    }


@router.post("/token/rotate")
async def rotate_token():
    cfg = config_manager.rotate_credentials()
    await logger_bus.log(
        "WARN",
        "SECURITY",
        "Rotated Bearer Token & PIN credentials via Web Control Panel",
        f"New PIN: {cfg.pin_code}",
    )
    return {
        "auth_token": cfg.auth_token,
        "pin_code": cfg.pin_code,
    }


@router.post("/actions")
async def create_quick_action(payload: ActionCreateRequest):
    if not payload.name.strip() or not payload.command.strip():
        raise HTTPException(status_code=400, detail="Name and CLI command are required.")
    action = config_manager.add_action(
        name=payload.name,
        icon=payload.icon or "terminal",
        command=payload.command,
    )
    await logger_bus.log(
        "INFO",
        "ACTION_MGR",
        f"Created Quick Action '{action.name}'",
        f"cmd: {action.command}",
    )
    return action


@router.delete("/actions/{action_id}")
async def delete_quick_action(action_id: str):
    removed = config_manager.remove_action(action_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Quick Action not found.")
    await logger_bus.log("INFO", "ACTION_MGR", f"Deleted Quick Action ID '{action_id}'")
    return {"deleted": True, "id": action_id}


@router.post("/actions/test")
async def test_quick_action(payload: TestActionRequest):
    cfg = config_manager.load()
    target = next((a for a in cfg.quick_actions if a.id == payload.action_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Quick Action not found.")

    await logger_bus.log(
        "EXEC",
        "CLI_RUNNER",
        f"Executing Quick Action '{target.name}'",
        target.command,
    )
    try:
        subprocess.Popen(
            target.command,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0,
        )
        return {"status": "dispatched", "action": target.name, "command": target.command}
    except Exception as exc:
        await logger_bus.log("ERROR", "CLI_RUNNER", f"Execution failed: {exc}", target.command)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/paths")
async def add_whitelisted_path(payload: PathCreateRequest):
    if not payload.path.strip():
        raise HTTPException(status_code=400, detail="Windows path cannot be empty.")
    entry = config_manager.add_whitelisted_path(payload.path)
    status_str = "VALID" if entry["exists"] else "PATH NOT FOUND ON DISK"
    await logger_bus.log(
        "INFO",
        "PERM_MGR",
        f"Whitelisted directory '{entry['path']}'",
        status_str,
    )
    return entry


@router.delete("/paths")
async def remove_whitelisted_path(path: str):
    removed = config_manager.remove_whitelisted_path(path)
    if not removed:
        raise HTTPException(status_code=404, detail="Path not found in whitelist.")
    await logger_bus.log("INFO", "PERM_MGR", f"Removed directory from whitelist: '{path}'")
    return {"deleted": True, "path": path}


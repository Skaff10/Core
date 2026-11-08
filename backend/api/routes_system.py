import os
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.auth import require_mobile_auth
from core.config_manager import config_manager
from core.logger import logger_bus
from services.window_monitor import get_foreground_telemetry
from api.websockets import mobile_bus

router = APIRouter(prefix="/api/system", tags=["System"])


class ExecuteActionRequest(BaseModel):
    action_id: str


class ShutdownRequest(BaseModel):
    confirm: bool = False


@router.get("/health")
async def server_health():
    """
    Public unauthenticated health probe to verify host reachability and network link
    before attempting authenticated handshake.
    """
    return {
        "status": "online",
        "service": "Core PC Backend",
        "version": "1.0.0",
    }


@router.get("/ping", dependencies=[Depends(require_mobile_auth)])
async def ping_server():
    await logger_bus.log("INFO", "MOBILE", "Authenticated handshake / ping received")
    return {
        "status": "online",
        "service": "Core PC Backend",
        "telemetry": get_foreground_telemetry(),
    }


@router.get("/actions", dependencies=[Depends(require_mobile_auth)])
async def list_actions():
    cfg = config_manager.load()
    return {"actions": cfg.quick_actions}


@router.post("/actions/execute", dependencies=[Depends(require_mobile_auth)])
async def execute_action(payload: ExecuteActionRequest):
    cfg = config_manager.load()
    target = next((a for a in cfg.quick_actions if a.id == payload.action_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Quick Action not found.")

    await logger_bus.log(
        "EXEC",
        "MOBILE_CMD",
        f"Mobile executed Quick Action '{target.name}'",
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
        # Phase 4 requirement: Broadcast WebSocket launch notification event to mobile phone
        await mobile_bus.broadcast(
            "notification",
            {
                "title": f"{target.name} is now running.",
                "body": f"Dispatched CLI: {target.command}",
                "command": target.command,
            },
        )
        return {"status": "executed", "action": target}
    except Exception as exc:
        await logger_bus.log("ERROR", "MOBILE_CMD", f"Failed executing '{target.name}': {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/shutdown", dependencies=[Depends(require_mobile_auth)])
async def shutdown_pc(payload: ShutdownRequest):
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Explicit confirmation required to shut down PC.")

    await logger_bus.log(
        "WARN",
        "POWER_CTL",
        "CRITICAL: Mobile issued PC Shutdown command",
        "shutdown /s /t 1",
    )
    os.system("shutdown /s /t 1")
    return {"status": "shutting_down", "command": "shutdown /s /t 1"}

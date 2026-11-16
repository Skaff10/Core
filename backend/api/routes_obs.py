from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.auth import require_mobile_auth
from services.obs_controller import obs_controller

router = APIRouter(prefix="/api/obs", tags=["OBS"], dependencies=[Depends(require_mobile_auth)])


class OpenObsRequest(BaseModel):
    start_recording: bool = False


@router.get("/status")
async def get_obs_status():
    return await obs_controller.get_status(refresh=True)


@router.post("/open")
async def open_obs(payload: OpenObsRequest = OpenObsRequest()):
    try:
        status = await obs_controller.open_obs(start_recording=payload.start_recording)
        return {"status": "ok", "obs": status}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/record/start")
async def start_obs_recording():
    try:
        status = await obs_controller.start_recording(auto_launch=True)
        return {"status": "ok", "obs": status}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/record/pause")
async def pause_obs_recording():
    try:
        status = await obs_controller.pause_recording()
        return {"status": "ok", "obs": status}
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/record/resume")
async def resume_obs_recording():
    try:
        status = await obs_controller.resume_recording()
        return {"status": "ok", "obs": status}
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/record/stop")
async def stop_obs_recording():
    try:
        status = await obs_controller.stop_recording()
        return {"status": "ok", "obs": status}
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

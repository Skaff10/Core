import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from core.auth import require_local_admin
from core.config_manager import config_manager
from core.logger import logger_bus
from api.routes_admin import router as admin_router, get_lan_ipv4
from api.routes_system import router as system_router
from api.routes_sync import router as sync_router
from api.routes_files import router as files_router
from api.websockets import router as ws_router

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
WEB_PANEL_DIR = BASE_DIR / "web_panel"


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = config_manager.load()
    lan_ip = get_lan_ipv4()
    port = int(os.getenv("PORT", "8000"))
    sync_dir = os.getenv("SYNC_DIR", r"C:\CommandCenter\Sync")
    os.makedirs(sync_dir, exist_ok=True)

    await logger_bus.log(
        "INFO",
        "BOOT",
        f"Core PC Server listening on 0.0.0.0:{port} (LAN: {lan_ip}:{port})",
        f"PIN: {cfg.pin_code}",
    )
    await logger_bus.log(
        "INFO",
        "SECURITY",
        f"Loaded {len(cfg.quick_actions)} Quick Actions and {len(cfg.whitelisted_paths)} Whitelisted Paths",
    )
    yield
    await logger_bus.log("WARN", "SHUTDOWN", "Core PC Server shutting down")


app = FastAPI(
    title="Core PC Backend Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
)


@app.middleware("http")
async def request_telemetry_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    path = request.url.path
    if not path.startswith("/static") and path != "/favicon.ico":
        client_host = request.client.host if request.client else "unknown"
        await logger_bus.log(
            "INFO" if response.status_code < 400 else "WARN",
            "HTTP",
            f"{request.method} {path} -> {response.status_code}",
            f"{client_host} | {elapsed_ms:.1f}ms",
        )
    return response


app.include_router(admin_router)
app.include_router(system_router)
app.include_router(sync_router)
app.include_router(files_router)
app.include_router(ws_router)

app.mount("/static", StaticFiles(directory=str(WEB_PANEL_DIR)), name="static")


@app.get("/", dependencies=[Depends(require_local_admin)])
async def serve_web_control_panel():
    return FileResponse(str(WEB_PANEL_DIR / "index.html"))


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)

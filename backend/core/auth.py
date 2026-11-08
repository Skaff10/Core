from typing import Optional
from fastapi import Request, HTTPException, status, Security, WebSocket
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.config_manager import config_manager
from core.logger import logger_bus

bearer_scheme = HTTPBearer(auto_error=False)

LOCAL_IPS = {"127.0.0.1", "::1", "localhost"}


def is_local_request(client_host: Optional[str]) -> bool:
    if not client_host:
        return False
    return client_host in LOCAL_IPS


def verify_token_value(token: Optional[str]) -> bool:
    if not token:
        return False
    cfg = config_manager.load()
    cleaned = token.strip()
    return cleaned == cfg.auth_token or cleaned == cfg.pin_code


async def require_local_admin(request: Request):
    """
    Ensures the Web Control Panel and admin endpoints are strictly accessible
    only from the local PC (127.0.0.1 / ::1), or with a valid Bearer token.
    """
    client_host = request.client.host if request.client else None
    if is_local_request(client_host):
        return True

    # Fallback: allow if a valid Bearer token is explicitly provided
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "", 1)
        if verify_token_value(token):
            return True

    await logger_bus.log(
        "WARN",
        "AUTH",
        f"Blocked non-local admin access attempt from {client_host}",
        request.url.path,
    )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Web Control Panel is restricted to localhost (PC only).",
    )


async def require_mobile_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
):
    """
    Validates Bearer Token or PIN passed by the mobile app (or allows localhost for testing).
    """
    token = credentials.credentials if credentials else None
    if not token:
        token = request.headers.get("X-Core-Token") or request.query_params.get("token")

    if verify_token_value(token):
        return token

    client_host = request.client.host if request.client else "unknown"
    await logger_bus.log(
        "ERROR",
        "AUTH",
        f"Unauthorized API request from {client_host}",
        request.url.path,
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing Core Auth Token / PIN.",
    )


async def verify_ws_auth(websocket: WebSocket) -> bool:
    """
    Validates WebSocket connection via query param ?token=... or Header, or localhost for admin log viewer.
    """
    client_host = websocket.client.host if websocket.client else None
    if is_local_request(client_host):
        return True

    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "", 1)

    return verify_token_value(token)


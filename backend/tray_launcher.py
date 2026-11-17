import argparse
import os
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

from PIL import Image, ImageDraw
import pystray
import uvicorn

from core.paths import get_data_dir, is_frozen


RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE_NAME = "CoreCommandCenter"


def _setup_stdio_logging():
    """Ensure stdout/stderr are writable when packaged with --noconsole."""
    if sys.stdout is not None and sys.stderr is not None:
        return
    logs_dir = get_data_dir() / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = open(logs_dir / "core_server.log", "a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = log_file
    if sys.stderr is None:
        sys.stderr = log_file


def _is_server_running(port: int) -> bool:
    url = f"http://127.0.0.1:{port}/api/system/health"
    try:
        with urllib.request.urlopen(url, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def _create_tray_icon_image() -> Image.Image:
    size = 64
    img = Image.new("RGBA", (size, size), (7, 10, 15, 255))
    draw = ImageDraw.Draw(img)
    # Outer cyan ring
    draw.ellipse((6, 6, size - 6, size - 6), outline=(56, 189, 248, 255), width=5)
    # Inner glowing core
    draw.ellipse((21, 21, size - 21, size - 21), fill=(56, 189, 248, 255))
    return img


def _is_autostart_enabled() -> bool:
    if os.name != "nt":
        return False
    try:
        import winreg
        for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(root, RUN_KEY_PATH, 0, winreg.KEY_READ) as key:
                    winreg.QueryValueEx(key, RUN_VALUE_NAME)
                    return True
            except FileNotFoundError:
                continue
        return False
    except Exception:
        return False


def _set_autostart(enabled: bool):
    if os.name != "nt":
        return
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY_PATH, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                exe_path = sys.executable if is_frozen() else f'"{sys.executable}" "{Path(__file__).resolve()}"'
                cmd = f'"{exe_path}" --startup' if is_frozen() else f'{exe_path} --startup'
                winreg.SetValueEx(key, RUN_VALUE_NAME, 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, RUN_VALUE_NAME)
                except FileNotFoundError:
                    pass
    except Exception as exc:
        print(f"[TRAY] Failed updating auto-start registry: {exc}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="CORE Command Center PC Server")
    parser.add_argument("--port", type=int, default=None, help="Override listening port for this run")
    parser.add_argument("--set-port", type=int, default=None, help="Persist default server port in config.json and exit")
    parser.add_argument("--startup", action="store_true", help="Started automatically on Windows login")
    parser.add_argument("--no-tray", action="store_true", help="Run server without system tray icon")
    args = parser.parse_args()

    _setup_stdio_logging()

    from core.config_manager import config_manager, resolve_server_port

    if args.set_port is not None:
        saved_port = config_manager.set_server_port(args.set_port)
        print(f"Configured Core Server port: {saved_port}", flush=True)
        return

    if args.port is not None:
        os.environ["PORT"] = str(args.port)

    port = resolve_server_port()
    panel_url = f"http://127.0.0.1:{port}/"

    # Single-instance check: if already running on this port, open control panel and exit
    if _is_server_running(port):
        if not args.startup:
            webbrowser.open(panel_url)
        return

    from main import app
    from api.routes_admin import get_lan_ipv4

    config = uvicorn.Config(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=port,
        reload=False,
        log_config=None,
    )
    server = uvicorn.Server(config)

    if args.no_tray:
        server.run()
        return

    server_thread = threading.Thread(target=server.run, daemon=True, name="core-uvicorn")
    server_thread.start()

    def _open_panel_when_ready():
        for _ in range(25):
            if _is_server_running(port):
                if not args.startup:
                    webbrowser.open(panel_url)
                return
            time.sleep(0.25)

    threading.Thread(target=_open_panel_when_ready, daemon=True).start()

    lan_ip = get_lan_ipv4()

    def on_open_panel(icon, item):
        webbrowser.open(panel_url)

    def on_toggle_autostart(icon, item):
        _set_autostart(not _is_autostart_enabled())
        icon.update_menu()

    def on_quit(icon, item):
        server.should_exit = True
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem(f"CORE // {lan_ip}:{port}", None, enabled=False),
        pystray.MenuItem(lambda item: f"Pairing PIN: {config_manager.load().pin_code}", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Open Web Control Panel", on_open_panel, default=True),
        pystray.MenuItem(
            "Start with Windows",
            on_toggle_autostart,
            checked=lambda item: _is_autostart_enabled(),
        ),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit CORE Server", on_quit),
    )

    tray = pystray.Icon(
        "CoreCommandCenter",
        _create_tray_icon_image(),
        f"CORE Command Center ({lan_ip}:{port})",
        menu,
    )
    tray.run()

    server.should_exit = True
    server_thread.join(timeout=5)


if __name__ == "__main__":
    main()

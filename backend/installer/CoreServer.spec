# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None
BACKEND_DIR = Path(SPECPATH).resolve().parent

hiddenimports = (
    collect_submodules("uvicorn")
    + collect_submodules("fastapi")
    + collect_submodules("starlette")
    + collect_submodules("pydantic")
    + collect_submodules("websockets")
    + collect_submodules("pystray")
    + [
        "main",
        "multipart",
        "python_multipart",
        "dotenv",
        "psutil",
        "pygetwindow",
        "pyrect",
        "PIL",
        "PIL.Image",
        "PIL.ImageDraw",
        "win32timezone",
        "win32api",
        "win32con",
        "win32gui",
        "anyio._backends._asyncio",
        "watchfiles",
    ]
)

a = Analysis(
    [str(BACKEND_DIR / "tray_launcher.py")],
    pathex=[str(BACKEND_DIR)],
    binaries=[],
    datas=[
        (str(BACKEND_DIR / "web_panel"), "web_panel"),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["playwright", "pytest", "tkinter"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="CoreServer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="CoreServer",
)

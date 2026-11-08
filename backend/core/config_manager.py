import json
import os
import secrets
import threading
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"


class QuickAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str
    icon: str
    command: str


class CoreConfig(BaseModel):
    auth_token: str
    pin_code: str
    quick_actions: List[QuickAction]
    whitelisted_paths: List[str]


class ConfigManager:
    def __init__(self, path: Path = CONFIG_PATH):
        self.path = path
        self._lock = threading.Lock()
        self._ensure_exists()

    def _generate_token(self) -> str:
        return f"core_{secrets.token_hex(16)}"

    def _generate_pin(self) -> str:
        return f"{secrets.randbelow(900000) + 100000}"

    def _ensure_exists(self):
        if not self.path.exists():
            default_desktop = str(Path.home() / "Desktop")
            default_downloads = str(Path.home() / "Downloads")
            initial_config = CoreConfig(
                auth_token=self._generate_token(),
                pin_code=self._generate_pin(),
                quick_actions=[
                    QuickAction(
                        id="act-taskmgr",
                        name="Task Manager",
                        icon="activity",
                        command="taskmgr",
                    ),
                    QuickAction(
                        id="act-explorer",
                        name="File Explorer",
                        icon="folder",
                        command="explorer.exe",
                    ),
                    QuickAction(
                        id="act-lock",
                        name="Lock Workstation",
                        icon="lock",
                        command="rundll32.exe user32.dll,LockWorkStation",
                    ),
                    QuickAction(
                        id="act-calc",
                        name="Calculator",
                        icon="terminal",
                        command="calc.exe",
                    ),
                ],
                whitelisted_paths=[
                    p for p in [default_desktop, default_downloads] if os.path.exists(p)
                ],
            )
            self.save(initial_config)

    def load(self) -> CoreConfig:
        with self._lock:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return CoreConfig(**data)

    def save(self, config: CoreConfig):
        with self._lock:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(config.model_dump(), f, indent=2)

    def rotate_credentials(self) -> CoreConfig:
        config = self.load()
        config.auth_token = self._generate_token()
        config.pin_code = self._generate_pin()
        self.save(config)
        return config

    def add_action(self, name: str, icon: str, command: str) -> QuickAction:
        config = self.load()
        action = QuickAction(name=name.strip(), icon=icon.strip(), command=command.strip())
        config.quick_actions.append(action)
        self.save(config)
        return action

    def remove_action(self, action_id: str) -> bool:
        config = self.load()
        before = len(config.quick_actions)
        config.quick_actions = [a for a in config.quick_actions if a.id != action_id]
        if len(config.quick_actions) < before:
            self.save(config)
            return True
        return False

    def add_whitelisted_path(self, raw_path: str) -> Dict[str, Any]:
        norm_path = os.path.abspath(raw_path.strip())
        exists = os.path.exists(norm_path) and os.path.isdir(norm_path)
        config = self.load()
        # Case-insensitive check on Windows
        existing_lower = [p.lower() for p in config.whitelisted_paths]
        if norm_path.lower() not in existing_lower:
            config.whitelisted_paths.append(norm_path)
            self.save(config)
        return {"path": norm_path, "exists": exists}

    def remove_whitelisted_path(self, target_path: str) -> bool:
        config = self.load()
        before = len(config.whitelisted_paths)
        config.whitelisted_paths = [
            p for p in config.whitelisted_paths if p.lower() != target_path.strip().lower()
        ]
        if len(config.whitelisted_paths) < before:
            self.save(config)
            return True
        return False


config_manager = ConfigManager()


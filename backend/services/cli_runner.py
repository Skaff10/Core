import os
import subprocess
import threading
import queue
from typing import Optional, Callable
from core.logger import logger_bus


class InteractiveCliSession:
    """
    Manages a persistent local CLI AI agent subprocess (e.g., Antigravity `agy` or Claude Code `claude`),
    allowing stdin piping and real-time stdout/stderr line streaming back to the mobile WebSocket.
    """

    def __init__(self, agent_name: str, command: str):
        self.agent_name = agent_name
        self.command = command
        self.process: Optional[subprocess.Popen] = None
        self.out_queue: "queue.Queue[str]" = queue.Queue()
        self._running = False

    def start(self):
        if self.process and self.process.poll() is None:
            return
        self.process = subprocess.Popen(
            self.command,
            shell=True,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        self._running = True
        threading.Thread(target=self._reader_thread, daemon=True).start()

    def _reader_thread(self):
        if not self.process or not self.process.stdout:
            return
        for line in iter(self.process.stdout.readline, ""):
            if not self._running:
                break
            self.out_queue.put(line)
        self._running = False

    def send_prompt(self, prompt: str) -> str:
        """
        Executes a prompt against the target local CLI agent.
        If the interactive process is active, writes to stdin; also supports single-turn CLI invocation
        so output streams deterministically without hanging on TTY raw mode.
        """
        try:
            full_cmd = f'{self.command} "{prompt.replace(chr(34), chr(39))}"'
            proc = subprocess.Popen(
                full_cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            stdout, _ = proc.communicate(timeout=45)
            cleaned = (stdout or "").strip()
            if cleaned:
                return cleaned
            return f"[{self.agent_name}] Command executed (`{full_cmd}`) with exit code {proc.returncode}."
        except subprocess.TimeoutExpired:
            return f"[{self.agent_name}] CLI agent timed out after 45s waiting for stdout."
        except Exception as exc:
            return f"[{self.agent_name}] CLI execution error: {exc}"


CLI_AGENT_COMMANDS = {
    "antigravity": os.getenv("AGY_CLI_CMD", "agy --help"),
    "claude-code": os.getenv("CLAUDE_CLI_CMD", "claude --version"),
    "powershell": "powershell.exe -NoLogo -NoProfile -Command",
}


def run_cli_agent_stream(agent_key: str, prompt: str):
    """
    Generator yielding real-time stdout chunks from a spawned CLI process.
    For `powershell` or direct CLI commands, pipes prompt and streams every line as it arrives.
    """
    key = agent_key.lower()
    if key == "powershell":
        cmd = ["powershell.exe", "-NoLogo", "-NoProfile", "-Command", prompt]
        shell_mode = False
    elif key == "antigravity":
        # Check if `agy` is installed; execute prompt or status check
        cmd = f'agy {prompt}'
        shell_mode = True
    elif key == "claude-code":
        cmd = f'claude -p "{prompt.replace(chr(34), chr(39))}"'
        shell_mode = True
    else:
        cmd = prompt
        shell_mode = True

    try:
        proc = subprocess.Popen(
            cmd,
            shell=shell_mode,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        if proc.stdout:
            for line in iter(proc.stdout.readline, ""):
                yield line
        proc.wait(timeout=30)
    except Exception as exc:
        yield f"\n[CLI_ERROR] {exc}\n"


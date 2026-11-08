import sys
import os
import json
import urllib.request
import urllib.error
import subprocess
import ctypes


def show_toast(title: str, message: str):
    # Escape quotes for PowerShell
    clean_title = title.replace('"', '`"')
    clean_msg = message.replace('"', '`"')
    ps_script = f"""
try {{
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $nodes = $template.GetElementsByTagName("text")
    $nodes.Item(0).AppendChild($template.CreateTextNode("{clean_title}")) | Out-Null
    $nodes.Item(1).AppendChild($template.CreateTextNode("{clean_msg}")) | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("CORE Command Center").Show($toast)
}} catch {{}}
"""
    try:
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            creationflags=flags,
            timeout=4,
        )
    except Exception:
        pass


def main():
    if len(sys.argv) < 2:
        return

    raw_path = sys.argv[1].strip().strip('"')
    if not raw_path:
        return

    full_path = os.path.abspath(raw_path)
    if not os.path.exists(full_path):
        ctypes.windll.user32.MessageBoxW(0, f"File does not exist:\n{full_path}", "CORE Send to Mobile", 0x10)
        return

    if os.path.isdir(full_path):
        ctypes.windll.user32.MessageBoxW(0, "Sending entire folders is not yet supported. Please select individual files.", "CORE Send to Mobile", 0x30)
        return

    filename = os.path.basename(full_path)
    port = int(os.environ.get("PORT", "8000"))
    url = f"http://127.0.0.1:{port}/api/admin/push-to-mobile"
    payload = json.dumps({"file_path": full_path}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                show_toast("Sending to Mobile", f"'{filename}' pushed to connected phone")
            else:
                show_toast("Send Failed", f"Could not queue '{filename}'")
    except urllib.error.URLError:
        ctypes.windll.user32.MessageBoxW(
            0,
            "CORE Command Center is not running on your PC.\nPlease start the CORE backend server first.",
            "CORE - Backend Offline",
            0x30,
        )
    except Exception as exc:
        ctypes.windll.user32.MessageBoxW(0, f"Failed to send file:\n{exc}", "CORE Send to Mobile Error", 0x10)


if __name__ == "__main__":
    main()


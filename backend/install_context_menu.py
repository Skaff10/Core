import os
import sys
import winreg


def install():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    pythonw = os.path.join(base_dir, ".venv", "Scripts", "pythonw.exe")
    script = os.path.join(base_dir, "send_to_mobile.pyw")

    if not os.path.exists(pythonw):
        print(f"Error: pythonw.exe not found at '{pythonw}'")
        sys.exit(1)

    if not os.path.exists(script):
        print(f"Error: script not found at '{script}'")
        sys.exit(1)

    cmd_string = f'"{pythonw}" "{script}" "%1"'

    # 1. Register in HKCU context menu for all files
    key_path = r"Software\Classes\*\shell\SendToMobile"
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, "Send to Mobile (CORE)")
            winreg.SetValueEx(key, "Icon", 0, winreg.REG_SZ, "imageres.dll,-5302")

        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path + r"\command") as cmd_key:
            winreg.SetValueEx(cmd_key, "", 0, winreg.REG_SZ, cmd_string)

        print("[OK] HKCU context menu registered successfully.")
    except Exception as exc:
        print(f"[ERROR] Failed to set HKCU context menu registry keys: {exc}")
        sys.exit(1)

    # 2. Register in Windows 'Send to' menu (%APPDATA%\Microsoft\Windows\SendTo)
    appdata = os.environ.get("APPDATA")
    if appdata:
        sendto_dir = os.path.join(appdata, "Microsoft", "Windows", "SendTo")
        if os.path.exists(sendto_dir):
            bat_path = os.path.join(sendto_dir, "Mobile (CORE).bat")
            try:
                with open(bat_path, "w", encoding="utf-8") as f:
                    f.write(f'@start "" "{pythonw}" "{script}" "%~1"\n')
                print(f"[OK] Added to 'Send to' menu: {bat_path}")
            except Exception as exc:
                print(f"[WARN] Failed to write SendTo batch helper: {exc}")

    print("\n[SUCCESS] 'Send to Mobile (CORE)' is now installed!")
    print("Right-click any file on your PC -> 'Send to Mobile (CORE)' or 'Send to' -> 'Mobile (CORE)'.")


if __name__ == "__main__":
    install()


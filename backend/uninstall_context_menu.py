import os
import sys
import winreg


def uninstall():
    # 1. Remove HKCU registry keys
    key_path = r"Software\Classes\*\shell\SendToMobile"
    try:
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key_path + r"\command")
        except FileNotFoundError:
            pass
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key_path)
            print("[OK] Removed HKCU context menu registry keys.")
        except FileNotFoundError:
            print("[INFO] Registry keys were already absent.")
    except Exception as exc:
        print(f"[WARN] Error removing registry keys: {exc}")

    # 2. Remove from SendTo directory
    appdata = os.environ.get("APPDATA")
    if appdata:
        sendto_dir = os.path.join(appdata, "Microsoft", "Windows", "SendTo")
        for name in ("Mobile (CORE).bat", "Mobile (CORE).lnk"):
            target = os.path.join(sendto_dir, name)
            if os.path.exists(target):
                try:
                    os.remove(target)
                    print(f"[OK] Removed '{target}'")
                except Exception as exc:
                    print(f"[WARN] Could not remove '{target}': {exc}")

    print("\n[SUCCESS] 'Send to Mobile (CORE)' context menu uninstalled.")


if __name__ == "__main__":
    uninstall()


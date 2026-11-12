import json
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional


def iso_utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def detect_quota_exhaustion(text: Optional[str]) -> bool:
    if not text:
        return False
    lower = text.lower()
    return "quota reached" in lower or ("⚠" in text and "limits" in lower)


def truncate_tool_output(raw_output: Any, max_chars: int = 4096) -> Tuple[str, bool]:
    if raw_output is None:
        return "", False
    if not isinstance(raw_output, str):
        try:
            text = json.dumps(raw_output, indent=2, ensure_ascii=False)
        except Exception:
            text = str(raw_output)
    else:
        text = raw_output

    if len(text) <= max_chars:
        return text, False
    return text[:max_chars] + f"\n... [truncated, {len(text) - max_chars} more chars]", True


def build_phone_event(
    session_id: str,
    seq: int,
    kind: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "v": 1,
        "session_id": session_id,
        "seq": seq,
        "ts": iso_utc_now(),
        "kind": kind,
        "payload": payload,
    }


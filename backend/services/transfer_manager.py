import os
import mimetypes
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional


def classify_file_category(ext: str) -> str:
    ext = ext.lower()
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif", ".avif"}:
        return "photo"
    if ext in {".mp4", ".mkv", ".mov", ".avi", ".webm", ".3gp", ".m4v"}:
        return "video"
    return "file"


class OutboundTransfer:
    def __init__(self, transfer_id: str, file_path: str):
        self.id = transfer_id
        self.file_path = os.path.abspath(file_path)
        self.filename = os.path.basename(self.file_path)
        self.file_size = os.path.getsize(self.file_path) if os.path.exists(self.file_path) else 0
        _, ext = os.path.splitext(self.filename)
        self.extension = ext.lower()
        self.category = classify_file_category(ext)
        guess, _ = mimetypes.guess_type(self.file_path)
        self.mime_type = guess or "application/octet-stream"
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.status = "pending"  # "pending", "downloaded", "failed"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "transfer_id": self.id,
            "filename": self.filename,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "category": self.category,
            "created_at": self.created_at,
            "status": self.status,
            "download_url": f"/api/files/transfers/{self.id}/download",
        }


class TransferManager:
    def __init__(self):
        self._transfers: Dict[str, OutboundTransfer] = {}

    def create_transfer(self, file_path: str) -> OutboundTransfer:
        norm_path = os.path.abspath(file_path)
        if not os.path.exists(norm_path) or not os.path.isfile(norm_path):
            raise FileNotFoundError(f"File not found on PC: '{norm_path}'")

        transfer_id = uuid.uuid4().hex
        transfer = OutboundTransfer(transfer_id, norm_path)
        self._transfers[transfer_id] = transfer
        return transfer

    def get_transfer(self, transfer_id: str) -> Optional[OutboundTransfer]:
        return self._transfers.get(transfer_id)

    def get_pending(self) -> List[Dict[str, Any]]:
        return [
            t.to_dict()
            for t in self._transfers.values()
            if t.status == "pending" and os.path.exists(t.file_path)
        ]

    def mark_downloaded(self, transfer_id: str):
        if transfer_id in self._transfers:
            self._transfers[transfer_id].status = "downloaded"

    def delete_transfer(self, transfer_id: str):
        self._transfers.pop(transfer_id, None)


transfer_manager = TransferManager()


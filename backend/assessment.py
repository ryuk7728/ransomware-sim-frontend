import json
import time
from pathlib import Path


def _load_snapshot(base_dir: Path) -> dict:
    snapshot_path = base_dir / "event_log.json"
    if not snapshot_path.exists():
        return {}

    try:
        return json.loads(snapshot_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def compute_metrics(event_log: dict, base_path: str, strategy: int) -> dict:
    base_dir = Path(base_path).resolve()
    snapshot = _load_snapshot(base_dir)
    merged = {**snapshot, **event_log}

    total_files = int(merged.get("total_files", 0))
    files_encrypted = int(merged.get("files_encrypted", 0))
    files_recovered = int(merged.get("files_recovered", 0))

    if files_recovered == 0 and strategy in (3, 4):
        files_recovered = min(files_encrypted, total_files)

    data_loss_percent = merged.get("data_loss_percent")
    if data_loss_percent is None:
        data_loss_files = max(files_encrypted - files_recovered, 0)
        data_loss_percent = round((data_loss_files / total_files) * 100, 2) if total_files else 0.0
    else:
        data_loss_percent = round(float(data_loss_percent), 2)
        data_loss_files = round((data_loss_percent / 100) * total_files) if total_files else 0

    attack_start = merged.get("attack_start")
    attack_end = merged.get("attack_end")
    detection_time = merged.get("detection_time")
    recovery_complete_time = merged.get("recovery_complete_time")
    projected_hours = merged.get("projected_downtime_hours")
    downtime_is_projected = strategy in (1, 2)

    attack_duration_seconds = None
    if attack_start is not None and attack_end is not None:
        attack_duration_seconds = round(float(attack_end) - float(attack_start), 2)

    detection_time_seconds = None
    if attack_start is not None and detection_time is not None:
        detection_time_seconds = round(float(detection_time) - float(attack_start), 2)

    if downtime_is_projected:
        downtime_seconds = float(projected_hours or 0) * 3600
    elif attack_start is not None and recovery_complete_time is not None:
        downtime_seconds = round(float(recovery_complete_time) - float(attack_start), 2)
    else:
        downtime_seconds = 0.0

    return {
        "strategy": strategy,
        "total_files": total_files,
        "files_encrypted": files_encrypted,
        "files_recovered": files_recovered,
        "data_loss_percent": data_loss_percent,
        "data_loss_files": data_loss_files,
        "attack_duration_seconds": attack_duration_seconds,
        "detection_time_seconds": detection_time_seconds,
        "downtime_seconds": downtime_seconds,
        "downtime_is_projected": downtime_is_projected,
        "suspect_process": merged.get("suspect_process"),
        "recovery_possible": bool(merged.get("recovery_possible", False)),
        "timestamp": time.time(),
    }

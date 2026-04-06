import hashlib
import json
import os
import shutil
import time
from pathlib import Path
from queue import Queue
from threading import Event

import psutil


def _write_event_snapshot(base_dir: Path, event_log: dict) -> None:
    snapshot_path = base_dir / "event_log.json"
    serializable = {k: v for k, v in event_log.items() if not k.startswith("_")}
    snapshot_path.write_text(json.dumps(serializable, indent=2, default=str), encoding="utf-8")


def _iter_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*") if path.is_file() and path.name != "README_RANSOM.txt")


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def setup_defense(strategy: int, base_path: str, event_log: dict) -> None:
    base_dir = Path(base_path).resolve()
    org_dir = base_dir / "org_files"
    isolated_backup_dir = base_dir / "isolated_backup"
    connected_backup_dir = base_dir / "connected_backup"

    for target in (isolated_backup_dir, connected_backup_dir):
        if target.exists():
            shutil.rmtree(target)

    event_log.pop("hash_manifest", None)

    if strategy == 1:
        _write_event_snapshot(base_dir, event_log)
        return

    if strategy == 2:
        shutil.copytree(org_dir, connected_backup_dir)
        event_log["backup_type"] = "connected"
        event_log["backup_created_at"] = time.time()
        _write_event_snapshot(base_dir, event_log)
        return

    shutil.copytree(org_dir, isolated_backup_dir)
    event_log["backup_type"] = "isolated"
    event_log["backup_timestamp"] = time.time()

    if strategy == 4:
        hash_manifest = {}
        for file_path in _iter_files(isolated_backup_dir):
            rel_path = file_path.relative_to(isolated_backup_dir).as_posix()
            hash_manifest[rel_path] = _hash_file(file_path)
        event_log["hash_manifest"] = hash_manifest
        event_log["backup_type"] = "isolated+hashed"

    _write_event_snapshot(base_dir, event_log)


def count_recently_modified_files(target_dir: str, seconds: int) -> int:
    cutoff = time.time() - seconds
    count = 0

    for root, _, files in os.walk(target_dir):
        root_path = Path(root)
        for filename in files:
            path = root_path / filename
            if path.name == "README_RANSOM.txt":
                continue
            try:
                if path.stat().st_mtime >= cutoff:
                    count += 1
            except FileNotFoundError:
                continue

    return count


def find_suspicious_process(target_dir: str) -> dict | None:
    suspects = []
    normalized_target = str(Path(target_dir).resolve())

    # In production, the security agent would terminate this process via OS signal.
    # In this simulation, stop_event serves as the termination mechanism.
    for proc in psutil.process_iter(["pid", "name", "open_files", "cpu_percent"]):
        try:
            open_files = proc.info["open_files"] or []
            matching = [file.path for file in open_files if normalized_target in file.path]
            if matching:
                suspects.append(
                    {
                        "pid": proc.info["pid"],
                        "name": proc.info["name"],
                        "cpu_percent": proc.info["cpu_percent"],
                        "open_files_in_target": matching,
                        "file_count": len(matching),
                    }
                )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    suspects.sort(key=lambda item: item["file_count"], reverse=True)
    return suspects[0] if suspects else None


def run_watcher(strategy: int, target_dir: str, stop_event: Event, event_log: dict, ws_queue: Queue) -> None:
    if strategy not in (3, 4):
        return

    base_dir = Path(target_dir).resolve().parent
    threshold = 5 if strategy == 3 else 2
    window_seconds = 10 if strategy == 3 else 2

    while not stop_event.is_set():
        modified_count = count_recently_modified_files(target_dir, window_seconds)

        if modified_count >= threshold:
            detection_time = time.time()
            event_log["detection_time"] = detection_time
            event_log["attack_stopped_by_watcher"] = True

            suspect = find_suspicious_process(target_dir)
            if suspect:
                event_log["suspect_process"] = suspect
                ws_queue.put_nowait(
                    {
                        "type": "detection",
                        "message": (
                            f"Suspicious process detected: PID {suspect['pid']} "
                            f"({suspect['name']}) with {suspect['file_count']} open handles"
                        ),
                        "timestamp": detection_time,
                    }
                )
            else:
                ws_queue.put_nowait(
                    {
                        "type": "detection",
                        "message": (
                            f"File modification threshold exceeded: {modified_count} files "
                            f"in the last {window_seconds} seconds"
                        ),
                        "timestamp": detection_time,
                    }
                )

            _write_event_snapshot(base_dir, event_log)
            stop_event.set()
            break

        time.sleep(1)


def _remove_locked_files(org_dir: Path) -> None:
    for locked_file in org_dir.rglob("*.locked"):
        locked_file.unlink(missing_ok=True)


def _restore_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def run_recovery(strategy: int, base_path: str, event_log: dict, ws_queue: Queue) -> None:
    base_dir = Path(base_path).resolve()
    org_dir = base_dir / "org_files"
    isolated_backup_dir = base_dir / "isolated_backup"
    connected_backup_dir = base_dir / "connected_backup"
    total_files = int(event_log.get("total_files", 0))
    encrypted_count = int(event_log.get("files_encrypted", 0))

    if strategy == 1:
        event_log["recovery_possible"] = False
        event_log["files_recovered"] = 0
        event_log["projected_downtime_hours"] = 72
        event_log["data_loss_percent"] = 100.0
        ws_queue.put_nowait(
            {
                "type": "recovery",
                "message": "No viable recovery path exists. Downtime and loss remain projected.",
                "timestamp": time.time(),
            }
        )
        _write_event_snapshot(base_dir, event_log)
        return

    if strategy == 2:
        recovered_count = 0
        if org_dir.exists():
            shutil.rmtree(org_dir)
        org_dir.mkdir(parents=True, exist_ok=True)

        for backup_file in _iter_files(connected_backup_dir):
            relative_path = backup_file.relative_to(connected_backup_dir)
            if backup_file.suffix == ".locked":
                continue
            _restore_file(backup_file, org_dir / relative_path)
            recovered_count += 1

        data_loss_files = max(total_files - recovered_count, 0)
        event_log["recovery_possible"] = recovered_count > 0
        event_log["files_recovered"] = recovered_count
        event_log["projected_downtime_hours"] = 36
        event_log["data_loss_percent"] = round((data_loss_files / total_files) * 100, 2) if total_files else 0.0
        ws_queue.put_nowait(
            {
                "type": "recovery",
                "message": (
                    f"Connected backup reviewed. {recovered_count} files remain usable; "
                    f"{data_loss_files} files are still lost."
                ),
                "timestamp": time.time(),
            }
        )
        _write_event_snapshot(base_dir, event_log)
        return

    event_log["recovery_possible"] = True

    if strategy == 3:
        ws_queue.put_nowait(
            {
                "type": "recovery",
                "message": "Restoring full dataset from isolated backup...",
                "timestamp": time.time(),
            }
        )
        _remove_locked_files(org_dir)
        if org_dir.exists():
            shutil.rmtree(org_dir)
        time.sleep(8)
        shutil.copytree(isolated_backup_dir, org_dir)
        event_log["files_recovered"] = min(encrypted_count, total_files)
        event_log["recovery_complete_time"] = time.time()
        _write_event_snapshot(base_dir, event_log)
        return

    hash_manifest = event_log.get("hash_manifest", {})
    restored_count = 0
    ws_queue.put_nowait(
        {
            "type": "recovery",
            "message": "Verifying hashes and performing surgical restore...",
            "timestamp": time.time(),
        }
    )
    time.sleep(3)

    for relative_path, expected_hash in hash_manifest.items():
        live_path = org_dir / Path(relative_path)
        locked_path = live_path.with_suffix(live_path.suffix + ".locked")
        backup_path = isolated_backup_dir / Path(relative_path)

        restore_needed = False
        if locked_path.exists():
            restore_needed = True
            locked_path.unlink(missing_ok=True)
        elif not live_path.exists():
            restore_needed = True
        else:
            current_hash = _hash_file(live_path)
            if current_hash != expected_hash:
                restore_needed = True

        if restore_needed:
            _restore_file(backup_path, live_path)
            restored_count += 1

    event_log["files_recovered"] = max(restored_count, encrypted_count)
    event_log["data_loss_percent"] = 0.0
    event_log["recovery_complete_time"] = time.time()
    _write_event_snapshot(base_dir, event_log)

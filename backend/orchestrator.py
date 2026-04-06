import asyncio
import json
import time
from pathlib import Path
from queue import Queue
from threading import Event, Thread

from .assessment import compute_metrics
from .generate_org_files import generate_org_files
from .ransomware_sim import run_ransomware
from .strategy_engine import run_recovery, run_watcher, setup_defense


def _workspace_base_path() -> Path:
    return Path(__file__).resolve().parent / "sim_workspace"


def _persist_event_log(base_path: str, event_log: dict) -> None:
    base_dir = Path(base_path).resolve()
    snapshot_path = base_dir / "event_log.json"
    serializable = {key: value for key, value in event_log.items() if not key.startswith("_")}
    snapshot_path.write_text(json.dumps(serializable, indent=2, default=str), encoding="utf-8")


def _queue_message(ws_queue: Queue, message_type: str, message: str, timestamp: float | None = None) -> None:
    ws_queue.put_nowait(
        {
            "type": message_type,
            "message": message,
            "timestamp": timestamp or time.time(),
        }
    )


def _load_event_log(base_path: str) -> dict:
    snapshot_path = Path(base_path).resolve() / "event_log.json"
    if not snapshot_path.exists():
        return {}

    try:
        return json.loads(snapshot_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _build_workspace_details(base_path: str, event_log: dict) -> dict:
    base_dir = Path(base_path).resolve()
    org_dir = base_dir / "org_files"
    isolated_backup_dir = base_dir / "isolated_backup"
    connected_backup_dir = base_dir / "connected_backup"
    backup_dir = connected_backup_dir if connected_backup_dir.exists() else isolated_backup_dir

    return {
        "prepared": True,
        "strategy": event_log.get("strategy"),
        "total_files": event_log.get("total_files", 0),
        "backup_type": event_log.get("backup_type", "none"),
        "prepared_at": event_log.get("workspace_created_at", time.time()),
        "org_files_path": str(org_dir.resolve()),
        "backup_path": str(backup_dir.resolve()) if backup_dir.exists() else None,
    }


def _prepare_workspace_sync(strategy: int, base_path: str) -> dict:
    event_log = {"strategy": strategy}
    file_info = generate_org_files(base_path)
    event_log["total_files"] = file_info["total_files"]
    event_log["file_list"] = file_info["file_list"]
    event_log["workspace_created_at"] = file_info["created_at"]
    _persist_event_log(base_path, event_log)
    setup_defense(strategy, base_path, event_log)
    _persist_event_log(base_path, event_log)
    return event_log


async def prepare_workspace(strategy: int) -> dict:
    base_path = _workspace_base_path()
    event_log = await asyncio.to_thread(_prepare_workspace_sync, strategy, str(base_path))
    return _build_workspace_details(str(base_path), event_log)


async def run_simulation(strategy: int, ws_queue: Queue, use_existing_workspace: bool = False) -> dict:
    base_path = _workspace_base_path()
    event_log = {"strategy": strategy}
    stop_event = Event()

    try:
        if use_existing_workspace:
            event_log = _load_event_log(str(base_path))
            if not event_log:
                raise RuntimeError("Workspace not prepared. Create organisation files before launching the simulation.")
            if event_log.get("strategy") != strategy:
                raise RuntimeError("Prepared workspace does not match the selected strategy. Recreate organisation files first.")
            _queue_message(ws_queue, "log", f"Using prepared workspace for Strategy {strategy}.")
            _queue_message(ws_queue, "log", f"Prepared org files detected: {event_log.get('total_files', 0)} files ready for attack.")
        else:
            _queue_message(ws_queue, "log", "Generating organizational file system...")
            event_log = await asyncio.to_thread(_prepare_workspace_sync, strategy, str(base_path))
            _queue_message(ws_queue, "log", f"Setting up security posture: Strategy {strategy}...")

        _queue_message(ws_queue, "log", "Attack initiated. Ransomware spreading...")
        event_log["attack_start"] = time.time()
        _persist_event_log(str(base_path), event_log)

        ransomware_thread = Thread(
            target=run_ransomware,
            args=(str(base_path / "org_files"), stop_event, event_log, ws_queue),
            name=f"ransomware-strategy-{strategy}",
        )

        watcher_thread = None
        if strategy in (3, 4):
            watcher_thread = Thread(
                target=run_watcher,
                args=(strategy, str(base_path / "org_files"), stop_event, event_log, ws_queue),
                name=f"watcher-strategy-{strategy}",
            )

        ransomware_thread.start()
        if watcher_thread:
            watcher_thread.start()

        await asyncio.to_thread(ransomware_thread.join)
        stop_event.set()
        if watcher_thread:
            await asyncio.to_thread(watcher_thread.join)

        event_log["attack_end"] = time.time()
        _persist_event_log(str(base_path), event_log)

        _queue_message(ws_queue, "log", "Running recovery procedure...")
        await asyncio.to_thread(run_recovery, strategy, str(base_path), event_log, ws_queue)

        metrics = await asyncio.to_thread(compute_metrics, event_log, str(base_path), strategy)
        ws_queue.put_nowait({"type": "complete", "metrics": metrics, "timestamp": time.time()})
        return metrics
    except Exception as exc:
        ws_queue.put_nowait(
            {
                "type": "error",
                "message": f"Simulation failed: {exc}",
                "timestamp": time.time(),
            }
        )
        raise

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


async def run_simulation(strategy: int, ws_queue: Queue) -> dict:
    base_path = Path(__file__).resolve().parent / "sim_workspace"
    event_log = {"strategy": strategy}
    stop_event = Event()

    try:
        _queue_message(ws_queue, "log", "Generating organizational file system...")
        file_info = await asyncio.to_thread(generate_org_files, str(base_path))
        event_log["total_files"] = file_info["total_files"]
        event_log["file_list"] = file_info["file_list"]
        event_log["workspace_created_at"] = file_info["created_at"]
        _persist_event_log(str(base_path), event_log)

        _queue_message(ws_queue, "log", f"Setting up security posture: Strategy {strategy}...")
        await asyncio.to_thread(setup_defense, strategy, str(base_path), event_log)

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

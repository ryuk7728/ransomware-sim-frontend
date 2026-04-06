import asyncio
from pathlib import Path
from queue import Empty, Queue
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .orchestrator import run_simulation


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)


class SimulationRequest(BaseModel):
    strategy: int


STRATEGIES = [
    {
        "id": 1,
        "name": "No defense",
        "description": "No backups, no monitoring. Organization has no security controls.",
        "backup_type": "none",
        "monitoring": False,
        "isolated_backup": False,
    },
    {
        "id": 2,
        "name": "Basic backup",
        "description": "Backups exist but are stored on the same network — vulnerable to encryption.",
        "backup_type": "connected",
        "monitoring": False,
        "isolated_backup": False,
    },
    {
        "id": 3,
        "name": "Isolated backup + monitoring",
        "description": "Offline backups unreachable by ransomware. File-change monitoring detects attack.",
        "backup_type": "isolated",
        "monitoring": True,
        "isolated_backup": True,
    },
    {
        "id": 4,
        "name": "Full defense (best practice)",
        "description": "Immutable isolated backups, aggressive real-time monitoring, hash verification, surgical restore.",
        "backup_type": "isolated+hashed",
        "monitoring": True,
        "isolated_backup": True,
    },
]

app = FastAPI(title="Threat-Sim Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SIMULATION_QUEUES: dict[str, Queue] = {}
SIMULATION_RESULTS: dict[str, dict] = {}
SIMULATION_TASKS: dict[str, asyncio.Task] = {}


async def _run_and_store(simulation_id: str, strategy: int) -> None:
    queue = SIMULATION_QUEUES[simulation_id]
    metrics = await run_simulation(strategy, queue)
    SIMULATION_RESULTS[simulation_id] = metrics


@app.post("/simulate")
async def simulate(payload: SimulationRequest) -> dict:
    if payload.strategy not in {1, 2, 3, 4}:
        raise HTTPException(status_code=400, detail="Strategy must be 1, 2, 3, or 4.")

    simulation_id = str(uuid4())
    SIMULATION_QUEUES[simulation_id] = Queue()
    SIMULATION_TASKS[simulation_id] = asyncio.create_task(_run_and_store(simulation_id, payload.strategy))
    return {"simulation_id": simulation_id}


@app.get("/strategies")
async def get_strategies() -> list[dict]:
    return STRATEGIES


@app.get("/results/{simulation_id}", response_model=None)
async def get_results(simulation_id: str):
    if simulation_id in SIMULATION_RESULTS:
        return SIMULATION_RESULTS[simulation_id]

    task = SIMULATION_TASKS.get(simulation_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Unknown simulation_id.")

    if task.done():
        exc = task.exception()
        if exc:
            raise HTTPException(status_code=500, detail=str(exc))

    return JSONResponse({"status": "pending"}, status_code=202)


@app.websocket("/ws/{simulation_id}")
async def websocket_feed(websocket: WebSocket, simulation_id: str) -> None:
    if simulation_id not in SIMULATION_QUEUES:
        await websocket.close(code=1008)
        return

    queue = SIMULATION_QUEUES[simulation_id]
    task = SIMULATION_TASKS.get(simulation_id)
    await websocket.accept()

    try:
        while True:
            try:
                message = await asyncio.to_thread(queue.get, True, 0.5)
            except Empty:
                if task and task.done() and queue.empty():
                    break
                continue

            await websocket.send_json(message)

            if message.get("type") in {"complete", "error"}:
                break
    except WebSocketDisconnect:
        return


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

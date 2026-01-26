import uuid
from typing import Dict

from fastapi import APIRouter, HTTPException

from app.data.presets import DEFAULT_COUNT, DEFAULT_RAMP, DEFAULT_RULES, ILLUSTRIOUS_18_FAB_4
from app.models import SimulationRequest, SimulationResult, SimulationStatus
from app.services.sim_runner import InMemorySimulationRunner

router = APIRouter(tags=["simulations"])

runner = InMemorySimulationRunner()


@router.post("/simulations")
async def create_simulation(request: SimulationRequest) -> Dict[str, str]:
    sim_id = str(uuid.uuid4())
    runner.start(sim_id, request)
    return {"id": sim_id}


@router.get("/simulations/{sim_id}", response_model=SimulationResult)
async def get_simulation(sim_id: str) -> SimulationResult:
    result = runner.get(sim_id)
    if not result:
        raise HTTPException(status_code=404, detail="Simulation not found or not complete")
    return result


@router.get("/simulations/{sim_id}/status", response_model=SimulationStatus)
async def get_simulation_status(sim_id: str) -> SimulationStatus:
    status = runner.status(sim_id)
    if not status:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return status


@router.post("/simulations/{sim_id}/stop")
async def stop_simulation(sim_id: str) -> Dict[str, bool]:
    stopped = runner.stop(sim_id)
    if not stopped:
        raise HTTPException(status_code=404, detail="Simulation not found or already stopped")
    return {"stopped": True}


@router.get("/libraries/defaults")
async def get_defaults() -> Dict:
    return {
        "rules": DEFAULT_RULES,
        "count": DEFAULT_COUNT,
        "deviations": ILLUSTRIOUS_18_FAB_4,
        "bet_ramp": DEFAULT_RAMP,
    }

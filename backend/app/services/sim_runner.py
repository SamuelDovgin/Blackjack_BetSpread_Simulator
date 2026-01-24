import concurrent.futures
from typing import Dict, Optional

from app.engine.simulation import run_simulation
from app.models import SimulationRequest, SimulationResult, SimulationStatus


class InMemorySimulationRunner:
    """Simple in-memory runner; replace with queue/worker if needed."""

    def __init__(self) -> None:
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        self._futures: Dict[str, concurrent.futures.Future] = {}
        self._progress: Dict[str, SimulationStatus] = {}

    def start(self, sim_id: str, request: SimulationRequest) -> None:
        def _progress_cb(done: int, total: int, profit_sum: float, profit_sq_sum: float, bet_sum: float) -> None:
            ev_per_100_est = None
            stdev_per_100_est = None
            avg_initial_bet_est = None
            if done > 0:
                mean = profit_sum / done
                variance = max(profit_sq_sum / done - mean * mean, 0.0)
                stdev = variance ** 0.5
                ev_per_100_est = mean * 100
                stdev_per_100_est = stdev * 10
                avg_initial_bet_est = bet_sum / done
            self._progress[sim_id] = SimulationStatus(
                status="running",
                progress=done / total if total else 0.0,
                hands_done=done,
                hands_total=total,
                ev_per_100_est=ev_per_100_est,
                stdev_per_100_est=stdev_per_100_est,
                avg_initial_bet_est=avg_initial_bet_est,
            )

        future = self._executor.submit(run_simulation, request, _progress_cb)
        self._futures[sim_id] = future
        self._progress[sim_id] = SimulationStatus(status="queued", progress=0.0, hands_done=0, hands_total=request.hands)

    def get(self, sim_id: str) -> Optional[SimulationResult]:
        future = self._futures.get(sim_id)
        if not future or not future.done():
            return None
        return future.result()

    def status(self, sim_id: str) -> Optional[SimulationStatus]:
        future = self._futures.get(sim_id)
        if not future:
            return None
        if future.done():
            return SimulationStatus(status="done", progress=1.0, hands_done=self._progress.get(sim_id, SimulationStatus(status="done", progress=1.0, hands_done=0, hands_total=0)).hands_total, hands_total=self._progress.get(sim_id, SimulationStatus(status="done", progress=1.0, hands_done=0, hands_total=0)).hands_total)
        return self._progress.get(sim_id)

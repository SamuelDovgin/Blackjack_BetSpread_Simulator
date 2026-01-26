import concurrent.futures
import threading
from typing import Dict, Optional

from app.engine.simulation import run_simulation, run_simulation_parallel
from app.models import SimulationRequest, SimulationResult, SimulationStatus


class InMemorySimulationRunner:
    """Simulation runner with optional multi-processing support."""

    def __init__(self) -> None:
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
        self._futures: Dict[str, concurrent.futures.Future] = {}
        self._progress: Dict[str, SimulationStatus] = {}
        self._cancel_flags: Dict[str, threading.Event] = {}
        self._partial_results: Dict[str, SimulationResult] = {}

    def start(self, sim_id: str, request: SimulationRequest) -> None:
        cancel_flag = threading.Event()
        self._cancel_flags[sim_id] = cancel_flag

        def _cancel_check() -> bool:
            return cancel_flag.is_set()

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

        # Choose simulation function based on multiprocessing flag
        if request.use_multiprocessing and request.hands >= 100_000:
            # Use parallel processing for large simulations
            num_workers = min(request.processes, 8)  # Cap at 8 workers
            future = self._executor.submit(
                run_simulation_parallel,
                request,
                num_workers,
                _progress_cb,
                _cancel_check,
            )
        else:
            # Use single-threaded simulation
            future = self._executor.submit(run_simulation, request, _progress_cb, _cancel_check)

        self._futures[sim_id] = future
        self._progress[sim_id] = SimulationStatus(status="queued", progress=0.0, hands_done=0, hands_total=request.hands)

    def stop(self, sim_id: str) -> bool:
        """Stop a running simulation and return partial results."""
        cancel_flag = self._cancel_flags.get(sim_id)
        if cancel_flag:
            cancel_flag.set()
            return True
        return False

    def get(self, sim_id: str) -> Optional[SimulationResult]:
        future = self._futures.get(sim_id)
        if not future or not future.done():
            return None
        try:
            return future.result()
        except Exception:
            return None

    def status(self, sim_id: str) -> Optional[SimulationStatus]:
        future = self._futures.get(sim_id)
        if not future:
            return None
        cancel_flag = self._cancel_flags.get(sim_id)
        if future.done():
            # Check if it was cancelled
            if cancel_flag and cancel_flag.is_set():
                prog = self._progress.get(sim_id)
                if prog:
                    return SimulationStatus(
                        status="stopped",
                        progress=prog.progress,
                        hands_done=prog.hands_done,
                        hands_total=prog.hands_total,
                        ev_per_100_est=prog.ev_per_100_est,
                        stdev_per_100_est=prog.stdev_per_100_est,
                        avg_initial_bet_est=prog.avg_initial_bet_est,
                    )
            return SimulationStatus(status="done", progress=1.0, hands_done=self._progress.get(sim_id, SimulationStatus(status="done", progress=1.0, hands_done=0, hands_total=0)).hands_total, hands_total=self._progress.get(sim_id, SimulationStatus(status="done", progress=1.0, hands_done=0, hands_total=0)).hands_total)
        return self._progress.get(sim_id)

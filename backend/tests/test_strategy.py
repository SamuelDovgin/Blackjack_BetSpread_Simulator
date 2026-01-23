import math

from app.engine.simulation import estimate_decks, pair_strategy_action, run_simulation
from app.data.presets import DEFAULT_COUNT, DEFAULT_RAMP, ILLUSTRIOUS_18_FAB_4
from app.models import Rules, SimulationRequest


def test_pair_strategy_basic():
    rules = SimulationRequest().rules
    assert pair_strategy_action("8", "T", rules) == "P"  # 8-8 vs T splits
    assert pair_strategy_action("T", "6", rules) == "S"  # tens stand
    assert pair_strategy_action("9", "7", rules) == "P"


def test_estimate_decks_rounding():
    # 60 cards remaining ~1.15 decks
    assert math.isclose(estimate_decks(60, 0.0, "nearest"), 60 / 52, rel_tol=1e-6)
    assert estimate_decks(60, 1.0, "nearest") == 1.0
    assert estimate_decks(60, 1.0, "ceil") == 2.0
    assert estimate_decks(60, 0.5, "nearest") == 1.0


def test_rounds_played_and_histograms():
    req = SimulationRequest(
        rules=Rules(decks=1, penetration=0.75, hit_soft_17=True),
        counting_system=DEFAULT_COUNT,
        deviations=ILLUSTRIOUS_18_FAB_4,
        bet_ramp=DEFAULT_RAMP,
        unit_size=5,
        bankroll=1000,
        hands=200,
        seed=3,
        debug_log=False,
        deck_estimation_step=1.0,
        deck_estimation_rounding="nearest",
        hands_per_hour=200,
    )
    res = run_simulation(req)
    assert res.meta.get("rounds_played") == str(200)
    # Histograms should be populated
    assert len(res.tc_histogram) > 0
    assert len(res.tc_histogram_est) > 0
    assert res.hours_played is not None and res.hours_played > 0
    assert res.avg_initial_bet is not None and res.avg_initial_bet > 0

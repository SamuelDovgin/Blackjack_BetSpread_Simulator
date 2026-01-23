import math

from app.engine.simulation import basic_strategy_action, estimate_decks, pair_strategy_action, run_simulation
from app.data.presets import DEFAULT_COUNT, DEFAULT_RAMP, ILLUSTRIOUS_18_FAB_4
from app.models import Rules, SimulationRequest


def test_pair_strategy_basic():
    rules = SimulationRequest().rules
    assert pair_strategy_action("8", "T", rules) == "P"  # 8-8 vs T splits
    assert pair_strategy_action("T", "6", rules) == "S"  # tens stand
    assert pair_strategy_action("9", "7", rules) == "P"

def test_pair_strategy_das_sensitive():
    das = Rules(double_after_split=True)
    no_das = Rules(double_after_split=False)
    # 2,2 vs dealer 2 splits only with DAS in this simplified table
    assert pair_strategy_action("2", "2", das) == "P"
    assert pair_strategy_action("2", "2", no_das) == "H"

def test_h17_soft18_vs2_is_double_else_stand():
    h17 = Rules(hit_soft_17=True)
    s17 = Rules(hit_soft_17=False)
    # A7 vs 2
    assert basic_strategy_action(["A", "7"], "2", h17) == "DS"
    assert basic_strategy_action(["A", "7"], "2", s17) == "S"

def test_h17_11_vs_a_double_s17_hit():
    h17 = Rules(hit_soft_17=True)
    s17 = Rules(hit_soft_17=False)
    assert basic_strategy_action(["5", "6"], "A", h17) == "DH"
    assert basic_strategy_action(["5", "6"], "A", s17) == "H"


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

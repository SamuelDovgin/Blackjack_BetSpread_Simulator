from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, validator


class DealerAction(str, Enum):
    hit = "HIT"
    stand = "STAND"


class Rules(BaseModel):
    decks: int = Field(6, ge=1, le=8)
    hit_soft_17: bool = True  # H17 vs S17
    double_after_split: bool = True
    double_any_two: bool = True
    surrender: bool = True  # late surrender
    resplit_aces: bool = True
    max_splits: int = Field(3, ge=0, le=4)
    hit_split_aces: bool = False
    blackjack_payout: float = 1.5
    dealer_peeks: bool = True
    penetration: float = Field(0.75, ge=0.1, le=0.99)  # % of shoe dealt

    @validator("blackjack_payout")
    def validate_bj_payout(cls, v: float) -> float:
        if v <= 1.0:
            raise ValueError("blackjack_payout must be greater than 1.0")
        return v


class CountingSystem(BaseModel):
    name: str = "Hi-Lo"
    tags: Dict[str, int] = Field(
        default_factory=lambda: {"2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, "T": -1, "J": -1, "Q": -1, "K": -1, "A": -1}
    )
    true_count_divisor: str = "remaining_decks"  # for future systems


class Deviation(BaseModel):
    hand_key: str  # e.g., "16v10", "A8v6", "99v7"
    tc_floor: int
    action: str  # e.g., "S" stand, "H" hit, "D" double, "P" split, "R" surrender, "I" insurance


class BetRampEntry(BaseModel):
    tc_floor: int
    units: float = Field(..., gt=0)


class BetRamp(BaseModel):
    steps: List[BetRampEntry]
    wong_out_below: Optional[int] = None  # TC below which we don't play
    wong_out_policy: str = "anytime"  # anytime | after_loss_only | after_hand_only

    @validator("steps")
    def sort_and_unique(cls, steps: List[BetRampEntry]) -> List[BetRampEntry]:
        sorted_steps = sorted(steps, key=lambda s: s.tc_floor)
        seen = set()
        for s in sorted_steps:
            if s.tc_floor in seen:
                raise ValueError("Duplicate tc_floor in bet ramp")
            seen.add(s.tc_floor)
        return sorted_steps


class SimulationRequest(BaseModel):
    rules: Rules = Rules()
    counting_system: CountingSystem = CountingSystem()
    deviations: List[Deviation] = Field(default_factory=list)
    bet_ramp: BetRamp
    bankroll: Optional[float] = None
    unit_size: float = 10.0
    hands: int = Field(2_000_000, ge=100)
    seed: int = 42
    processes: int = Field(4, ge=1, le=64)
    debug_log: bool = False
    debug_log_hands: int = Field(20, ge=1, le=500)
    deck_estimation_step: float = 1.0  # 0 = perfect, 0.5 = half deck, 1.0 = full deck
    deck_estimation_rounding: str = "floor"  # nearest|floor|ceil
    use_estimated_tc_for_bet: bool = True
    use_estimated_tc_for_deviations: bool = True
    hands_per_hour: float = Field(100, gt=0)


class SimulationStatus(BaseModel):
    status: str
    progress: float
    hands_done: int
    hands_total: int
    ev_per_100_est: Optional[float] = None
    stdev_per_100_est: Optional[float] = None
    avg_initial_bet_est: Optional[float] = None


class TcTableEntry(BaseModel):
    tc: int
    n: int  # total rounds observed in bucket (including wonged)
    n_iba: int = 0  # rounds with initial bet > 0
    n_zero: int = 0  # rounds with 0 bet (wonged)
    freq: float
    ev_pct: float
    ev_se_pct: float
    variance: float


class SimulationResult(BaseModel):
    ev_per_100: float
    stdev_per_100: float
    variance_per_hand: float
    di: float  # desirability index
    score: float
    n0_hands: float
    ror: Optional[float] = None
    avg_initial_bet: Optional[float] = None
    avg_initial_bet_units: Optional[float] = None
    tc_histogram: Dict[int, int] = Field(default_factory=dict)
    tc_histogram_est: Dict[int, int] = Field(default_factory=dict)
    tc_table: List[TcTableEntry] = Field(default_factory=list)
    meta: Dict[str, str] = Field(default_factory=dict)
    hours_played: Optional[float] = None
    debug_hands: Optional[List[Dict[str, str]]] = None

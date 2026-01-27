import math
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

from app.models import Deviation, RoRResult, Rules, SimulationRequest, SimulationResult, TcTableEntry

CARD_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
CARD_VALUES = {**{str(i): i for i in range(2, 10)}, "T": 10, "J": 10, "Q": 10, "K": 10, "A": 11}


@dataclass
class HandState:
    cards: List[str]
    bet: float
    split_depth: int = 0
    is_split_aces: bool = False
    can_double: bool = True


@dataclass
class SimulationChunk:
    """Results from a chunk of hands for parallel aggregation."""
    hands: int
    profit_sum: float
    profit_sq_sum: float
    bet_sum: float
    tc_histogram: Dict[int, int] = field(default_factory=dict)
    tc_histogram_est: Dict[int, int] = field(default_factory=dict)
    tc_stats: Dict[int, Dict[str, float]] = field(default_factory=dict)

    @property
    def mean(self) -> float:
        return self.profit_sum / self.hands if self.hands > 0 else 0.0

    @property
    def variance(self) -> float:
        if self.hands == 0:
            return 0.0
        mean = self.mean
        return max(self.profit_sq_sum / self.hands - mean * mean, 0.0)


def build_shoe(decks: int, rng: np.random.Generator) -> List[str]:
    cards = []
    for _ in range(decks):
        for card in CARD_ORDER:
            cards.extend([card] * 4)
    rng.shuffle(cards)
    return cards


def hand_value(cards: List[str]) -> Tuple[int, bool]:
    total = sum(CARD_VALUES[c] for c in cards)
    aces = sum(1 for c in cards if c == "A")
    while total > 21 and aces:
        total -= 10
        aces -= 1
    soft = aces > 0 and total <= 21
    return total, soft


def is_blackjack(cards: List[str]) -> bool:
    return len(cards) == 2 and set(cards) >= {"A"} and any(c in {"T", "J", "Q", "K"} for c in cards)


def upcard_key(card: str) -> str:
    return "T" if card in {"T", "J", "Q", "K"} else card


def apply_deviation(hand_key: str, true_count: float, deviations: Dict[str, List[Deviation]]) -> str:
    floor_tc = math.floor(true_count)
    keys = [hand_key, f"{hand_key}_surrender"]
    for key in keys:
        if key not in deviations:
            continue
        for dev in deviations[key]:
            if floor_tc >= dev.tc_floor:
                return dev.action
    return ""


def basic_strategy_action(player: List[str], dealer_up: str, rules: Rules) -> str:
    """
    Returns one of: H, S, R, DH (double else hit), DS (double else stand).
    The caller should resolve DH/DS based on whether doubling is actually allowed.
    """
    total, soft = hand_value(player)
    up = upcard_key(dealer_up)

    # Surrender shortcuts (late surrender)
    if rules.surrender:
        if total == 16 and up in {"9", "T", "A"}:
            return "R"
        if total == 15 and up == "T":
            return "R"

    if not soft:
        # Hard totals
        if total >= 17:
            return "S"
        if 13 <= total <= 16:
            return "S" if up in {"2", "3", "4", "5", "6"} else "H"
        if total == 12:
            return "S" if up in {"4", "5", "6"} else "H"
        if total == 11:
            # H17: double 11vA, S17: hit 11vA
            if up == "A" and not rules.hit_soft_17:
                return "H"
            return "DH"
        if total == 10:
            return "DH" if up not in {"T", "A"} else "H"
        if total == 9:
            # H17: double 9v2; S17: hit 9v2
            if up == "2" and rules.hit_soft_17:
                return "DH"
            return "DH" if up in {"3", "4", "5", "6"} else "H"
        return "H"

    # Soft totals
    if total >= 19:
        return "S"
    if total == 18:
        # A7 vs 2 differs: H17 = DS, S17 = S
        if up == "2":
            return "DS" if rules.hit_soft_17 else "S"
        if up in {"3", "4", "5", "6"}:
            return "DS"
        if up in {"7", "8"}:
            return "S"
        return "H"
    if total == 17:
        return "DH" if up in {"3", "4", "5", "6"} else "H"
    if total in {15, 16}:
        return "DH" if up in {"4", "5", "6"} else "H"
    if total in {13, 14}:
        return "DH" if up in {"5", "6"} else "H"
    return "H"


def pair_strategy_action(rank: str, dealer_up: str, rules: Rules) -> str:
    """Pair splitting strategy with DAS-aware spots."""
    up = upcard_key(dealer_up)
    if rank == "A":
        return "P"
    if rank in {"T", "J", "Q", "K"}:
        return "S"
    if rank == "9":
        return "P" if up in {"2", "3", "4", "5", "6", "8", "9"} else "S"
    if rank == "8":
        return "P"
    if rank == "7":
        return "P" if up in {"2", "3", "4", "5", "6", "7"} else "H"
    if rank == "6":
        if rules.double_after_split:
            return "P" if up in {"2", "3", "4", "5", "6"} else "H"
        return "P" if up in {"3", "4", "5", "6"} else "H"
    if rank == "5":
        return "D" if up in {"2", "3", "4", "5", "6", "7", "8", "9"} else "H"
    if rank == "4":
        return "P" if rules.double_after_split and up in {"5", "6"} else "H"
    if rank in {"2", "3"}:
        if rules.double_after_split:
            return "P" if up in {"2", "3", "4", "5", "6", "7"} else "H"
        return "P" if up in {"4", "5", "6", "7"} else "H"
    return "H"


def estimate_decks(remaining_cards: int, step: float, rounding: str) -> float:
    decks = remaining_cards / 52.0
    if step <= 0:
        return max(decks, 0.25)
    val = decks / step
    if rounding == "floor":
        est = math.floor(val) * step
    elif rounding == "ceil":
        est = math.ceil(val) * step
    else:
        est = round(val) * step
    return max(est, step)


def choose_action(
    player: List[str],
    dealer_up: str,
    true_count: float,
    deviations: Dict[str, List[Deviation]],
    rules: Rules,
    can_double: bool,
) -> str:
    total, soft = hand_value(player)
    hand_key = f"{total}{'s' if soft else ''}v{upcard_key(dealer_up)}"
    # Try deviation first
    dev_action = apply_deviation(hand_key, true_count, deviations)
    if dev_action:
        if dev_action == "D" and not can_double:
            return "H"
        return dev_action
    # Fallback to basic strategy
    action = basic_strategy_action(player, dealer_up, rules)
    if action == "DH":
        return "D" if can_double else "H"
    if action == "DS":
        return "D" if can_double else "S"
    return action


def choose_bet(true_count: float, ramp_steps: List, unit_size: float) -> float:
    tc_floor = math.floor(true_count)
    selected = None
    for step in ramp_steps:
        if tc_floor >= step.tc_floor:
            selected = step
        else:
            break
    if selected is None:
        selected = ramp_steps[0]
    return selected.units * unit_size


def calculate_ror_detail(
    ev_per_hand: float,
    variance_per_hand: float,
    bankroll: float,
    n0_hands: float,
    trip_hours: Optional[float] = None,
    hands_per_hour: float = 100,
) -> RoRResult:
    """
    Calculate detailed risk of ruin for variable betting.

    The key insight: for variable bets, we use the ACTUAL variance from the simulation,
    which already accounts for bet size variation. The variance of total profit naturally
    incorporates the fact that high-count bets contribute more variance.

    Args:
        ev_per_hand: Expected value per hand (in dollars)
        variance_per_hand: Variance per hand (in dollars squared)
        bankroll: Total bankroll (in dollars)
        n0_hands: N0 statistic (hands to overcome 1 SD)
        trip_hours: Optional trip length in hours for trip RoR
        hands_per_hour: Hands played per hour

    Returns:
        RoRResult with detailed risk analysis
    """
    # Simple RoR (for backwards compatibility)
    if ev_per_hand <= 0:
        simple_ror = 1.0
        adjusted_ror = 1.0
    else:
        k = (2 * ev_per_hand) / variance_per_hand if variance_per_hand > 0 else 0
        simple_ror = math.exp(-k * bankroll)

        # Adjusted RoR uses the same formula but emphasizes that variance is already bet-adjusted
        # For variable betting, the actual profit variance IS the correct variance to use
        adjusted_ror = simple_ror  # Same formula, but clearer interpretation

    # Trip RoR: probability of losing entire trip bankroll in X hours
    trip_ror_val = None
    if trip_hours is not None and trip_hours > 0:
        trip_hands = trip_hours * hands_per_hour
        trip_ev = ev_per_hand * trip_hands
        trip_stdev = math.sqrt(variance_per_hand * trip_hands)

        if trip_stdev > 0:
            # P(loss >= bankroll) using normal approximation
            # We want P(cumulative_profit < -bankroll)
            z = (-bankroll - trip_ev) / trip_stdev
            # Approximation: use normal CDF
            # For z < 0, CDF(z) ≈ exp(-z^2/2) / (sqrt(2π) * |z|) for large |z|
            # For simplicity, cap at 0.5 (50%) and use rough approximation
            if z < -3:
                trip_ror_val = 0.0  # Extremely unlikely
            elif z > 3:
                trip_ror_val = 1.0  # Almost certain
            else:
                # Rough normal CDF approximation
                # For better accuracy, we'd use scipy.stats.norm.cdf(z)
                # But let's keep dependencies minimal
                trip_ror_val = 0.5 * (1 + math.erf(z / math.sqrt(2)))

    # Required bankroll for target RoR
    # From RoR = exp(-k * BR), solve for BR:
    # BR = -ln(RoR) / k = -ln(RoR) * variance / (2 * ev)
    required_5pct = None
    required_1pct = None

    if ev_per_hand > 0 and variance_per_hand > 0:
        k = (2 * ev_per_hand) / variance_per_hand
        target_ror_5pct = 0.05
        target_ror_1pct = 0.01

        required_5pct = -math.log(target_ror_5pct) / k if k > 0 else None
        required_1pct = -math.log(target_ror_1pct) / k if k > 0 else None

    return RoRResult(
        simple_ror=simple_ror,
        adjusted_ror=adjusted_ror,
        trip_ror=trip_ror_val,
        trip_hours=trip_hours,
        required_bankroll_5pct=required_5pct,
        required_bankroll_1pct=required_1pct,
        n0_hands=n0_hands,
    )


def run_simulation(
    request: SimulationRequest,
    progress_cb: Optional[Callable[[int, int, float, float, float], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> SimulationResult:
    rng = np.random.default_rng(request.seed)
    rules = request.rules
    ramp_steps = sorted(request.bet_ramp.steps, key=lambda s: s.tc_floor)

    # Pre-index deviations by hand_key for quick lookup
    dev_index: Dict[str, List[Deviation]] = {}
    for dev in request.deviations:
        dev_index.setdefault(dev.hand_key, []).append(dev)
    for key in dev_index:
        dev_index[key].sort(key=lambda d: d.tc_floor)

    shoe = build_shoe(rules.decks, rng)
    cut_card = int(len(shoe) * rules.penetration)
    pointer = 0
    running_count = 0

    total_profit = 0.0
    total_sq_profit = 0.0
    total_initial_bet = 0.0
    rounds_played = 0
    tc_histogram: Dict[int, int] = {}
    tc_histogram_est: Dict[int, int] = {}
    tc_stats: Dict[int, Dict[str, float]] = {}
    debug_logs: List[Dict[str, str]] = []
    last_round_result: Optional[str] = None
    last_round_played = False
    is_wonged_out = False

    def bucket_stats(tc_bucket: int) -> Dict[str, float]:
        return tc_stats.setdefault(
            tc_bucket,
            {"n_total": 0.0, "n_iba": 0.0, "n_zero": 0.0, "mean": 0.0, "m2": 0.0},
        )

    def update_iba_stats(tc_bucket: int, profit: float, bet_amt: float) -> None:
        if bet_amt <= 0:
            return
        stat = bucket_stats(tc_bucket)
        stat["n_iba"] += 1.0
        x = profit / bet_amt
        delta = x - stat["mean"]
        stat["mean"] += delta / stat["n_iba"]
        stat["m2"] += delta * (x - stat["mean"])

    def draw_card() -> str:
        nonlocal pointer, shoe, running_count, cut_card
        if pointer >= cut_card:
            shoe[:] = build_shoe(rules.decks, rng)
            cut_card = int(len(shoe) * rules.penetration)
            pointer = 0
            running_count = 0
        card = shoe[pointer]
        pointer += 1
        running_count += request.counting_system.tags.get(card, 0)
        return card

    target_rounds = request.hands
    progress_interval = max(target_rounds // 50, 10_000)
    cancel_check_interval = max(target_rounds // 100, 1_000)
    was_cancelled = False
    while rounds_played < target_rounds:
        # Check for cancellation periodically
        if cancel_check and rounds_played % cancel_check_interval == 0 and cancel_check():
            was_cancelled = True
            break
        remaining_cards = len(shoe) - pointer
        remaining_decks = max(remaining_cards / 52.0, 0.25)
        true_count_raw = running_count / remaining_decks
        est_decks = estimate_decks(remaining_cards, request.deck_estimation_step, request.deck_estimation_rounding)
        true_count_est = running_count / est_decks

        tc_for_bet = true_count_est if request.use_estimated_tc_for_bet else true_count_raw
        tc_for_dev = true_count_est if request.use_estimated_tc_for_deviations else true_count_raw

        raw_floor = math.floor(true_count_raw)
        est_floor = math.floor(true_count_est)

        tc_histogram[raw_floor] = tc_histogram.get(raw_floor, 0) + 1
        tc_histogram_est[est_floor] = tc_histogram_est.get(est_floor, 0) + 1
        round_tc_bucket = math.floor(tc_for_bet)
        bucket_stats(round_tc_bucket)["n_total"] += 1.0

        # Bet decision
        if request.bet_ramp.wong_out_below is not None:
            if math.floor(tc_for_bet) >= request.bet_ramp.wong_out_below:
                is_wonged_out = False
            else:
                if not is_wonged_out:
                    policy = request.bet_ramp.wong_out_policy or "anytime"
                    if policy == "anytime":
                        is_wonged_out = True
                    elif policy == "after_loss_only":
                        is_wonged_out = last_round_result == "loss"
                    elif policy == "after_hand_only":
                        is_wonged_out = last_round_played
                if is_wonged_out:
                    bucket_stats(round_tc_bucket)["n_zero"] += 1.0
                    # Burn a few cards to advance shoe realistically
                    draw_card()
                    draw_card()
                    last_round_played = False
                    continue

        bet = choose_bet(tc_for_bet, ramp_steps, request.unit_size)
        total_initial_bet += bet

        # Initial deal
        player_start = [draw_card(), draw_card()]
        dealer = [draw_card(), draw_card()]

        # Insurance check
        insurance_payout = 0.0
        if dealer[0] == "A":
            ins_action = apply_deviation("insurance", tc_for_dev, dev_index)
            if ins_action == "I":
                insurance_bet = bet / 2
                if is_blackjack(dealer):
                    insurance_payout = insurance_bet * 2  # wins 2:1 (profit = +bet)
                else:
                    insurance_payout = -insurance_bet

        dealer_has_bj = is_blackjack(dealer)
        player_has_bj = is_blackjack(player_start)
        if dealer_has_bj or player_has_bj:
            profit = insurance_payout
            if player_has_bj and not dealer_has_bj:
                profit += bet * rules.blackjack_payout
            elif dealer_has_bj and player_has_bj:
                profit += 0
            else:
                profit -= bet
            total_profit += profit
            total_sq_profit += profit * profit
            update_iba_stats(round_tc_bucket, profit, bet)
            rounds_played += 1
            last_round_result = "win" if profit > 0 else "loss" if profit < 0 else "push"
            last_round_played = True
            if request.debug_log and len(debug_logs) < request.debug_log_hands:
                debug_logs.append(
                    {
                        "hand": str(rounds_played),
                        "type": "blackjack_resolve",
                        "player": "".join(player_start),
                        "dealer": "".join(dealer),
                        "true_count": f"{true_count_raw:.2f}",
                        "true_count_est": f"{true_count_est:.2f}",
                        "bet": f"{bet:.2f}",
                        "profit": f"{profit:.2f}",
                    }
                )
            if progress_cb and rounds_played % progress_interval == 0:
                progress_cb(rounds_played, target_rounds, total_profit, total_sq_profit, total_initial_bet)
            continue

        # Split-aware queue
        queue: List[HandState] = [
            HandState(
                cards=player_start,
                bet=bet,
                split_depth=0,
                is_split_aces=False,
                can_double=rules.double_any_two,
            )
        ]
        finished_hands: List[Dict] = []

        while queue:
            hand = queue.pop(0)
            while True:
                remaining_cards = len(shoe) - pointer
                remaining_decks = max(remaining_cards / 52.0, 0.25)
                true_count_raw = running_count / remaining_decks
                est_decks = estimate_decks(remaining_cards, request.deck_estimation_step, request.deck_estimation_rounding)
                true_count_est = running_count / est_decks
                tc_for_dev = true_count_est if request.use_estimated_tc_for_deviations else true_count_raw

                # Check for split opportunity
                if (
                    len(hand.cards) == 2
                    and hand.cards[0] == hand.cards[1]
                    and hand.split_depth < rules.max_splits
                    and (hand.cards[0] != "A" or rules.resplit_aces or hand.split_depth == 0)
                ):
                    pair_action = pair_strategy_action(hand.cards[0], dealer[0], rules)
                    if pair_action == "P":
                        left = HandState(
                            cards=[hand.cards[0], draw_card()],
                            bet=hand.bet,
                            split_depth=hand.split_depth + 1,
                            is_split_aces=hand.cards[0] == "A",
                            can_double=rules.double_any_two if rules.double_after_split else False,
                        )
                        right = HandState(
                            cards=[hand.cards[1], draw_card()],
                            bet=hand.bet,
                            split_depth=hand.split_depth + 1,
                            is_split_aces=hand.cards[1] == "A",
                            can_double=rules.double_any_two if rules.double_after_split else False,
                        )
                        queue.insert(0, right)
                        queue.insert(0, left)
                        break

                action = choose_action(hand.cards, dealer[0], tc_for_dev, dev_index, rules, hand.can_double)
                surrendered = False
                doubled = False

                if action == "R" and rules.surrender:
                    surrendered = True
                    finished_hands.append(
                        {"cards": hand.cards[:], "bet": hand.bet, "surrendered": True, "doubled": False, "bust": False}
                    )
                    break

                if action == "S":
                    finished_hands.append(
                        {"cards": hand.cards[:], "bet": hand.bet, "surrendered": False, "doubled": False, "bust": False}
                    )
                    break

                if action == "D" and hand.can_double:
                    hand.bet *= 2
                    hand.cards.append(draw_card())
                    doubled = True
                    total, _ = hand_value(hand.cards)
                    finished_hands.append(
                        {
                            "cards": hand.cards[:],
                            "bet": hand.bet,
                            "surrendered": False,
                            "doubled": doubled,
                            "bust": total > 21,
                        }
                    )
                    break

                # Hit
                if hand.is_split_aces and not rules.hit_split_aces:
                    finished_hands.append(
                        {"cards": hand.cards[:], "bet": hand.bet, "surrendered": False, "doubled": False, "bust": False}
                    )
                    break

                hand.cards.append(draw_card())
                total, _ = hand_value(hand.cards)
                if total >= 21:
                    finished_hands.append(
                        {
                            "cards": hand.cards[:],
                            "bet": hand.bet,
                            "surrendered": False,
                            "doubled": False,
                            "bust": total > 21,
                        }
                    )
                    break

        # Dealer play once
        dealer_total, dealer_soft = hand_value(dealer)
        while dealer_total < 17 or (dealer_total == 17 and dealer_soft and rules.hit_soft_17):
            dealer.append(draw_card())
            dealer_total, dealer_soft = hand_value(dealer)

        # Resolve all hands
        round_profit = 0.0
        for fh in finished_hands:
            bet_amt = fh["bet"]
            surrendered = fh.get("surrendered", False)
            doubled = fh.get("doubled", False)
            bust = fh.get("bust", False)
            player_total, _ = hand_value(fh["cards"])

            if surrendered:
                profit = -0.5 * bet_amt + insurance_payout
            elif bust:
                profit = -bet_amt + insurance_payout
            else:
                if dealer_total > 21:
                    profit = bet_amt + insurance_payout
                elif player_total > dealer_total:
                    profit = bet_amt + insurance_payout
                elif player_total < dealer_total:
                    profit = -bet_amt + insurance_payout
                else:
                    profit = insurance_payout

            total_profit += profit
            total_sq_profit += profit * profit
            round_profit += profit

            if request.debug_log and len(debug_logs) < request.debug_log_hands:
                debug_logs.append(
                    {
                        "hand": str(rounds_played + 1),
                        "player": "".join(fh["cards"]),
                        "dealer": "".join(dealer),
                        "true_count": f"{true_count_raw:.2f}",
                        "true_count_est": f"{true_count_est:.2f}",
                        "bet": f"{bet_amt:.2f}",
                        "surrendered": str(surrendered),
                        "doubled": str(doubled),
                        "player_total": str(player_total),
                        "dealer_total": str(dealer_total),
                        "profit": f"{profit:.2f}",
                    }
                )

        update_iba_stats(round_tc_bucket, round_profit, bet)
        rounds_played += 1
        last_round_result = "win" if round_profit > 0 else "loss" if round_profit < 0 else "push"
        last_round_played = True
        if progress_cb and rounds_played % progress_interval == 0:
            progress_cb(rounds_played, target_rounds, total_profit, total_sq_profit, total_initial_bet)

    # Final progress callback (important for cancelled simulations)
    if progress_cb:
        progress_cb(rounds_played, target_rounds, total_profit, total_sq_profit, total_initial_bet)

    if rounds_played == 0:
        return SimulationResult(
            ev_per_100=0.0,
            stdev_per_100=0.0,
            variance_per_hand=0.0,
            di=0.0,
            score=0.0,
            n0_hands=0.0,
            ror=None,
            tc_histogram={},
            tc_histogram_est={},
            meta={"note": "no hands played"},
        )

    mean = total_profit / rounds_played
    variance = max(total_sq_profit / rounds_played - mean * mean, 0.0)
    stdev = math.sqrt(variance)

    ev_per_100 = mean * 100
    stdev_per_100 = stdev * 10
    di = mean / stdev if stdev > 0 else 0.0
    score = 100 * (mean * mean) / variance if variance > 0 else 0.0
    n0 = variance / (mean * mean) if mean != 0 else 0.0

    # Calculate RoR (both simple and detailed)
    ror = None
    ror_detail = None

    if request.bankroll:
        # Simple RoR for backwards compatibility
        ev_hand = mean
        var_hand = variance
        if ev_hand <= 0:
            ror = 1.0
        else:
            k = (2 * ev_hand) / var_hand if var_hand > 0 else 0
            ror = math.exp(-k * request.bankroll)

        # Detailed RoR analysis
        # Calculate trip RoR for a 4-hour session by default
        trip_hours = 4.0
        ror_detail = calculate_ror_detail(
            ev_per_hand=mean,
            variance_per_hand=variance,
            bankroll=request.bankroll,
            n0_hands=n0,
            trip_hours=trip_hours,
            hands_per_hour=request.hands_per_hour,
        )

    meta = {
        "rounds_played": str(rounds_played),
        "note": "cancelled" if was_cancelled else "single-process sim",
        "was_cancelled": str(was_cancelled).lower(),
    }

    hours_played = rounds_played / request.hands_per_hour if request.hands_per_hour > 0 else None

    avg_initial_bet = total_initial_bet / rounds_played if rounds_played > 0 else None
    avg_initial_bet_units = avg_initial_bet / request.unit_size if avg_initial_bet is not None else None

    tc_table: List[TcTableEntry] = []
    total_obs = sum(int(stat.get("n_total", 0)) for stat in tc_stats.values())
    for tc_bucket, stat in sorted(tc_stats.items(), key=lambda item: item[0]):
        n_total = int(stat.get("n_total", 0))
        n_iba = int(stat.get("n_iba", 0))
        n_zero = int(stat.get("n_zero", 0))
        if n_total <= 0:
            continue
        freq = n_total / total_obs if total_obs > 0 else 0.0
        if n_iba > 0:
            mean_x = stat["mean"]
            var_x = max(stat["m2"] / n_iba, 0.0)
            se_x = math.sqrt(var_x / n_iba)
        else:
            mean_x = 0.0
            var_x = 0.0
            se_x = 0.0
        tc_table.append(
            TcTableEntry(
                tc=tc_bucket,
                n=n_total,
                n_iba=n_iba,
                n_zero=n_zero,
                freq=freq,
                ev_pct=mean_x * 100,
                ev_se_pct=se_x * 100,
                variance=var_x,
            )
        )

    return SimulationResult(
        ev_per_100=ev_per_100,
        stdev_per_100=stdev_per_100,
        variance_per_hand=variance,
        di=di,
        score=score,
        n0_hands=n0,
        ror=ror,
        ror_detail=ror_detail,
        avg_initial_bet=avg_initial_bet,
        avg_initial_bet_units=avg_initial_bet_units,
        tc_histogram=tc_histogram,
        tc_histogram_est=tc_histogram_est,
        tc_table=tc_table,
        meta=meta,
        hours_played=hours_played,
        rounds_played=rounds_played,
        debug_hands=debug_logs if request.debug_log else None,
    )


def _run_chunk_worker(args: Tuple) -> SimulationChunk:
    """
    Worker function for parallel simulation. Must be a module-level function
    for multiprocessing pickle compatibility.
    """
    request_dict, chunk_hands, chunk_seed = args
    # Reconstruct request from dict (required for multiprocessing)
    request = SimulationRequest(**request_dict)

    rng = np.random.default_rng(chunk_seed)
    rules = request.rules
    ramp_steps = sorted(request.bet_ramp.steps, key=lambda s: s.tc_floor)

    # Pre-index deviations
    dev_index: Dict[str, List[Deviation]] = {}
    for dev in request.deviations:
        dev_index.setdefault(dev.hand_key, []).append(dev)
    for key in dev_index:
        dev_index[key].sort(key=lambda d: d.tc_floor)

    shoe = build_shoe(rules.decks, rng)
    cut_card = int(len(shoe) * rules.penetration)
    pointer = 0
    running_count = 0

    total_profit = 0.0
    total_sq_profit = 0.0
    total_initial_bet = 0.0
    rounds_played = 0
    tc_histogram: Dict[int, int] = {}
    tc_histogram_est: Dict[int, int] = {}
    tc_stats: Dict[int, Dict[str, float]] = {}
    last_round_result: Optional[str] = None
    last_round_played = False
    is_wonged_out = False

    def bucket_stats(tc_bucket: int) -> Dict[str, float]:
        return tc_stats.setdefault(
            tc_bucket,
            {"n_total": 0.0, "n_iba": 0.0, "n_zero": 0.0, "mean": 0.0, "m2": 0.0},
        )

    def update_iba_stats(tc_bucket: int, profit: float, bet_amt: float) -> None:
        if bet_amt <= 0:
            return
        stat = bucket_stats(tc_bucket)
        stat["n_iba"] += 1.0
        x = profit / bet_amt
        delta = x - stat["mean"]
        stat["mean"] += delta / stat["n_iba"]
        stat["m2"] += delta * (x - stat["mean"])

    def draw_card() -> str:
        nonlocal pointer, shoe, running_count, cut_card
        if pointer >= cut_card:
            shoe[:] = build_shoe(rules.decks, rng)
            cut_card = int(len(shoe) * rules.penetration)
            pointer = 0
            running_count = 0
        card = shoe[pointer]
        pointer += 1
        running_count += request.counting_system.tags.get(card, 0)
        return card

    while rounds_played < chunk_hands:
        remaining_cards = len(shoe) - pointer
        remaining_decks = max(remaining_cards / 52.0, 0.25)
        true_count_raw = running_count / remaining_decks
        est_decks = estimate_decks(remaining_cards, request.deck_estimation_step, request.deck_estimation_rounding)
        true_count_est = running_count / est_decks

        tc_for_bet = true_count_est if request.use_estimated_tc_for_bet else true_count_raw
        tc_for_dev = true_count_est if request.use_estimated_tc_for_deviations else true_count_raw

        raw_floor = math.floor(true_count_raw)
        est_floor = math.floor(true_count_est)

        tc_histogram[raw_floor] = tc_histogram.get(raw_floor, 0) + 1
        tc_histogram_est[est_floor] = tc_histogram_est.get(est_floor, 0) + 1
        round_tc_bucket = math.floor(tc_for_bet)
        bucket_stats(round_tc_bucket)["n_total"] += 1.0

        # Bet decision (wong out logic)
        if request.bet_ramp.wong_out_below is not None:
            if math.floor(tc_for_bet) >= request.bet_ramp.wong_out_below:
                is_wonged_out = False
            else:
                if not is_wonged_out:
                    policy = request.bet_ramp.wong_out_policy or "anytime"
                    if policy == "anytime":
                        is_wonged_out = True
                    elif policy == "after_loss_only":
                        is_wonged_out = last_round_result == "loss"
                    elif policy == "after_hand_only":
                        is_wonged_out = last_round_played
                if is_wonged_out:
                    bucket_stats(round_tc_bucket)["n_zero"] += 1.0
                    draw_card()
                    draw_card()
                    last_round_played = False
                    continue

        bet = choose_bet(tc_for_bet, ramp_steps, request.unit_size)
        total_initial_bet += bet

        # Initial deal
        player_start = [draw_card(), draw_card()]
        dealer = [draw_card(), draw_card()]

        # Insurance check
        insurance_payout = 0.0
        if dealer[0] == "A":
            ins_action = apply_deviation("insurance", tc_for_dev, dev_index)
            if ins_action == "I":
                insurance_bet = bet / 2
                if is_blackjack(dealer):
                    insurance_payout = insurance_bet * 2
                else:
                    insurance_payout = -insurance_bet

        dealer_has_bj = is_blackjack(dealer)
        player_has_bj = is_blackjack(player_start)
        if dealer_has_bj or player_has_bj:
            profit = insurance_payout
            if player_has_bj and not dealer_has_bj:
                profit += bet * rules.blackjack_payout
            elif dealer_has_bj and player_has_bj:
                profit += 0
            else:
                profit -= bet
            total_profit += profit
            total_sq_profit += profit * profit
            update_iba_stats(round_tc_bucket, profit, bet)
            rounds_played += 1
            last_round_result = "win" if profit > 0 else "loss" if profit < 0 else "push"
            last_round_played = True
            continue

        # Split-aware queue
        queue: List[HandState] = [
            HandState(
                cards=player_start,
                bet=bet,
                split_depth=0,
                is_split_aces=False,
                can_double=rules.double_any_two,
            )
        ]
        finished_hands: List[Dict] = []

        while queue:
            hand = queue.pop(0)
            while True:
                remaining_cards = len(shoe) - pointer
                remaining_decks = max(remaining_cards / 52.0, 0.25)
                true_count_raw = running_count / remaining_decks
                est_decks = estimate_decks(remaining_cards, request.deck_estimation_step, request.deck_estimation_rounding)
                true_count_est = running_count / est_decks
                tc_for_dev = true_count_est if request.use_estimated_tc_for_deviations else true_count_raw

                # Check for split opportunity
                if (
                    len(hand.cards) == 2
                    and hand.cards[0] == hand.cards[1]
                    and hand.split_depth < rules.max_splits
                    and (hand.cards[0] != "A" or rules.resplit_aces or hand.split_depth == 0)
                ):
                    pair_action = pair_strategy_action(hand.cards[0], dealer[0], rules)
                    if pair_action == "P":
                        left = HandState(
                            cards=[hand.cards[0], draw_card()],
                            bet=hand.bet,
                            split_depth=hand.split_depth + 1,
                            is_split_aces=hand.cards[0] == "A",
                            can_double=rules.double_any_two if rules.double_after_split else False,
                        )
                        right = HandState(
                            cards=[hand.cards[1], draw_card()],
                            bet=hand.bet,
                            split_depth=hand.split_depth + 1,
                            is_split_aces=hand.cards[1] == "A",
                            can_double=rules.double_any_two if rules.double_after_split else False,
                        )
                        queue.insert(0, right)
                        queue.insert(0, left)
                        break

                action = choose_action(hand.cards, dealer[0], tc_for_dev, dev_index, rules, hand.can_double)

                if action == "R" and rules.surrender:
                    finished_hands.append(
                        {"cards": hand.cards[:], "bet": hand.bet, "surrendered": True, "doubled": False, "bust": False}
                    )
                    break

                if action == "S":
                    finished_hands.append(
                        {"cards": hand.cards[:], "bet": hand.bet, "surrendered": False, "doubled": False, "bust": False}
                    )
                    break

                if action == "D" and hand.can_double:
                    hand.bet *= 2
                    hand.cards.append(draw_card())
                    total, _ = hand_value(hand.cards)
                    finished_hands.append(
                        {
                            "cards": hand.cards[:],
                            "bet": hand.bet,
                            "surrendered": False,
                            "doubled": True,
                            "bust": total > 21,
                        }
                    )
                    break

                # Hit
                if hand.is_split_aces and not rules.hit_split_aces:
                    finished_hands.append(
                        {"cards": hand.cards[:], "bet": hand.bet, "surrendered": False, "doubled": False, "bust": False}
                    )
                    break

                hand.cards.append(draw_card())
                total, _ = hand_value(hand.cards)
                if total >= 21:
                    finished_hands.append(
                        {
                            "cards": hand.cards[:],
                            "bet": hand.bet,
                            "surrendered": False,
                            "doubled": False,
                            "bust": total > 21,
                        }
                    )
                    break

        # Dealer play once
        dealer_total, dealer_soft = hand_value(dealer)
        while dealer_total < 17 or (dealer_total == 17 and dealer_soft and rules.hit_soft_17):
            dealer.append(draw_card())
            dealer_total, dealer_soft = hand_value(dealer)

        # Resolve all hands
        round_profit = 0.0
        for fh in finished_hands:
            bet_amt = fh["bet"]
            surrendered = fh.get("surrendered", False)
            bust = fh.get("bust", False)
            player_total, _ = hand_value(fh["cards"])

            if surrendered:
                profit = -0.5 * bet_amt + insurance_payout
            elif bust:
                profit = -bet_amt + insurance_payout
            else:
                if dealer_total > 21:
                    profit = bet_amt + insurance_payout
                elif player_total > dealer_total:
                    profit = bet_amt + insurance_payout
                elif player_total < dealer_total:
                    profit = -bet_amt + insurance_payout
                else:
                    profit = insurance_payout

            total_profit += profit
            total_sq_profit += profit * profit
            round_profit += profit

        update_iba_stats(round_tc_bucket, round_profit, bet)
        rounds_played += 1
        last_round_result = "win" if round_profit > 0 else "loss" if round_profit < 0 else "push"
        last_round_played = True

    return SimulationChunk(
        hands=rounds_played,
        profit_sum=total_profit,
        profit_sq_sum=total_sq_profit,
        bet_sum=total_initial_bet,
        tc_histogram=tc_histogram,
        tc_histogram_est=tc_histogram_est,
        tc_stats=tc_stats,
    )


def aggregate_chunks(chunks: List[SimulationChunk], request: SimulationRequest) -> SimulationResult:
    """
    Combine results from parallel simulation chunks.
    Uses parallel variance formula for statistically correct aggregation.
    """
    total_hands = sum(c.hands for c in chunks)
    total_profit = sum(c.profit_sum for c in chunks)
    total_sq_profit = sum(c.profit_sq_sum for c in chunks)
    total_bet = sum(c.bet_sum for c in chunks)

    if total_hands == 0:
        return SimulationResult(
            ev_per_100=0.0,
            stdev_per_100=0.0,
            variance_per_hand=0.0,
            di=0.0,
            score=0.0,
            n0_hands=0.0,
            ror=None,
            tc_histogram={},
            tc_histogram_est={},
            meta={"note": "no hands played"},
        )

    # Combined mean and variance
    mean = total_profit / total_hands
    variance = max(total_sq_profit / total_hands - mean * mean, 0.0)
    stdev = math.sqrt(variance)

    ev_per_100 = mean * 100
    stdev_per_100 = stdev * 10
    di = mean / stdev if stdev > 0 else 0.0
    score = 100 * (mean * mean) / variance if variance > 0 else 0.0
    n0 = variance / (mean * mean) if mean != 0 else 0.0

    # Merge TC histograms
    tc_histogram: Dict[int, int] = {}
    tc_histogram_est: Dict[int, int] = {}
    for chunk in chunks:
        for tc, count in chunk.tc_histogram.items():
            tc_histogram[tc] = tc_histogram.get(tc, 0) + count
        for tc, count in chunk.tc_histogram_est.items():
            tc_histogram_est[tc] = tc_histogram_est.get(tc, 0) + count

    # Merge TC stats (for EV by TC table)
    merged_tc_stats: Dict[int, Dict[str, float]] = {}
    for chunk in chunks:
        for tc, stat in chunk.tc_stats.items():
            if tc not in merged_tc_stats:
                merged_tc_stats[tc] = {"n_total": 0.0, "n_iba": 0.0, "n_zero": 0.0, "mean": 0.0, "m2": 0.0, "sum": 0.0, "sum_sq": 0.0}
            m = merged_tc_stats[tc]
            m["n_total"] += stat.get("n_total", 0.0)
            m["n_iba"] += stat.get("n_iba", 0.0)
            m["n_zero"] += stat.get("n_zero", 0.0)
            # For online mean/variance, we need to aggregate differently
            # Just sum up for now and compute at the end
            n_iba = stat.get("n_iba", 0.0)
            if n_iba > 0:
                m["sum"] = m.get("sum", 0.0) + stat.get("mean", 0.0) * n_iba
                m["sum_sq"] = m.get("sum_sq", 0.0) + (stat.get("m2", 0.0) + n_iba * stat.get("mean", 0.0) ** 2)

    # Finalize merged TC stats
    for tc, stat in merged_tc_stats.items():
        n_iba = stat["n_iba"]
        if n_iba > 0:
            stat["mean"] = stat.get("sum", 0.0) / n_iba
            stat["m2"] = max(stat.get("sum_sq", 0.0) - n_iba * stat["mean"] ** 2, 0.0)

    # Build TC table
    tc_table: List[TcTableEntry] = []
    total_obs = sum(int(stat.get("n_total", 0)) for stat in merged_tc_stats.values())
    for tc_bucket, stat in sorted(merged_tc_stats.items(), key=lambda item: item[0]):
        n_total = int(stat.get("n_total", 0))
        n_iba = int(stat.get("n_iba", 0))
        n_zero = int(stat.get("n_zero", 0))
        if n_total <= 0:
            continue
        freq = n_total / total_obs if total_obs > 0 else 0.0
        if n_iba > 0:
            mean_x = stat["mean"]
            var_x = max(stat["m2"] / n_iba, 0.0)
            se_x = math.sqrt(var_x / n_iba)
        else:
            mean_x = 0.0
            var_x = 0.0
            se_x = 0.0
        tc_table.append(
            TcTableEntry(
                tc=tc_bucket,
                n=n_total,
                n_iba=n_iba,
                n_zero=n_zero,
                freq=freq,
                ev_pct=mean_x * 100,
                ev_se_pct=se_x * 100,
                variance=var_x,
            )
        )

    # Calculate RoR
    ror = None
    ror_detail = None
    if request.bankroll:
        ev_hand = mean
        var_hand = variance
        if ev_hand <= 0:
            ror = 1.0
        else:
            k = (2 * ev_hand) / var_hand if var_hand > 0 else 0
            ror = math.exp(-k * request.bankroll)

        trip_hours = 4.0
        ror_detail = calculate_ror_detail(
            ev_per_hand=mean,
            variance_per_hand=variance,
            bankroll=request.bankroll,
            n0_hands=n0,
            trip_hours=trip_hours,
            hands_per_hour=request.hands_per_hour,
        )

    hours_played = total_hands / request.hands_per_hour if request.hands_per_hour > 0 else None
    avg_initial_bet = total_bet / total_hands if total_hands > 0 else None
    avg_initial_bet_units = avg_initial_bet / request.unit_size if avg_initial_bet is not None else None

    meta = {
        "rounds_played": str(total_hands),
        "note": f"parallel sim ({len(chunks)} workers)",
        "workers": str(len(chunks)),
    }

    return SimulationResult(
        ev_per_100=ev_per_100,
        stdev_per_100=stdev_per_100,
        variance_per_hand=variance,
        di=di,
        score=score,
        n0_hands=n0,
        ror=ror,
        ror_detail=ror_detail,
        avg_initial_bet=avg_initial_bet,
        avg_initial_bet_units=avg_initial_bet_units,
        tc_histogram=tc_histogram,
        tc_histogram_est=tc_histogram_est,
        tc_table=tc_table,
        meta=meta,
        hours_played=hours_played,
        rounds_played=total_hands,
    )


def run_simulation_parallel(
    request: SimulationRequest,
    num_workers: Optional[int] = None,
    progress_cb: Optional[Callable[[int, int, float, float, float], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> SimulationResult:
    """
    Run simulation using multiple processes for parallelism.

    Args:
        request: Simulation configuration
        num_workers: Number of worker processes (default: CPU count - 1)
        progress_cb: Progress callback (called frequently as chunks complete)
        cancel_check: Cancellation check callback

    Returns:
        Aggregated SimulationResult
    """
    from concurrent.futures import as_completed

    if num_workers is None:
        num_workers = max(1, mp.cpu_count() - 1)

    # Fall back to single-threaded for small simulations or single worker
    if request.hands < 100_000 or num_workers <= 1:
        return run_simulation(request, progress_cb, cancel_check)

    # Check for cancellation before starting
    if cancel_check and cancel_check():
        return run_simulation(request, progress_cb, cancel_check)

    # Split into many small chunks for frequent progress updates
    # Target ~50k hands per chunk for smooth progress, min 32 chunks
    target_chunk_size = 50_000
    num_chunks = max(32, request.hands // target_chunk_size)
    # Cap at reasonable number to avoid overhead
    num_chunks = min(num_chunks, 256)

    base_chunk_size = request.hands // num_chunks
    remainder = request.hands % num_chunks

    # Prepare chunk arguments - convert request to dict for pickle
    request_dict = request.model_dump()
    chunk_args: List[Tuple] = []
    for i in range(num_chunks):
        chunk_hands = base_chunk_size + (1 if i < remainder else 0)
        # Derive unique seed for each chunk using large prime offset
        chunk_seed = request.seed + i * 1_000_000_007
        chunk_args.append((request_dict, chunk_hands, chunk_seed))

    # Run chunks in parallel using ProcessPoolExecutor
    # Use as_completed to report progress as each chunk finishes
    chunks: List[SimulationChunk] = []
    completed_hands = 0
    completed_profit = 0.0
    completed_sq_profit = 0.0
    completed_bet = 0.0

    try:
        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            # Submit all chunks
            future_to_idx = {
                executor.submit(_run_chunk_worker, args): i
                for i, args in enumerate(chunk_args)
            }

            # Process results as they complete for smooth progress updates
            for future in as_completed(future_to_idx):
                if cancel_check and cancel_check():
                    # Cancel remaining futures on stop request
                    for f in future_to_idx:
                        f.cancel()
                    break

                try:
                    chunk = future.result(timeout=600)  # 10 minute timeout per chunk
                    chunks.append(chunk)

                    # Update running totals
                    completed_hands += chunk.hands
                    completed_profit += chunk.profit_sum
                    completed_sq_profit += chunk.profit_sq_sum
                    completed_bet += chunk.bet_sum

                    # Report progress after each chunk completes
                    if progress_cb:
                        progress_cb(
                            completed_hands,
                            request.hands,
                            completed_profit,
                            completed_sq_profit,
                            completed_bet,
                        )
                except Exception as e:
                    # Log error but continue with other chunks
                    print(f"Chunk failed: {e}")

    except Exception as e:
        # Fall back to single-threaded if multiprocessing fails
        print(f"Parallel execution failed, falling back to single-threaded: {e}")
        return run_simulation(request, progress_cb, cancel_check)

    if not chunks:
        return run_simulation(request, progress_cb, cancel_check)

    # Aggregate results
    result = aggregate_chunks(chunks, request)

    return result

# Blackjack Simulator - Detailed Implementation Roadmap

> Generated: January 25, 2026
> Total Tasks: 49 (6 detailed below, 43 summarized)

---

## Why This Simulator Matters

This application serves a critical purpose: **helping card counters make informed decisions about their betting strategies before risking real money**. A betting simulator must provide:

1. **Accurate statistical analysis** - Players need to trust the numbers
2. **Risk assessment** - Understanding bankroll requirements and ruin probability
3. **Strategy validation** - Testing deviations and bet spreads before casino play
4. **Training tools** - Building the skills needed for live play

The improvements below address gaps in these core areas. Each enhancement makes the simulator more valuable for serious advantage players who use data to guide their play.

---

## Priority Implementation Details

### Task #11: Fix RoR (Risk of Ruin) Calculation for Variable Betting

**Priority:** 🔴 CRITICAL

**Status:** Implemented in the frontend (RoR + Trip RoR + required bankrolls computed from the current run's EV/SD plus your bankroll and unit size). Backend RoR is intentionally not computed to keep the engine unit-first and cache-friendly.

#### Why This Matters

Previously, the backend used a simple log-ruin approximation (removed). The RoR calculator now lives in the frontend and is recomputed instantly when you change bankroll/unit size.

```python
k = (2 * ev_hand) / var_hand if var_hand > 0 else 0
ror = math.exp(-k * request.bankroll)
```

**The Problem:** This formula assumes constant bet size, but card counters use variable bets (1-12 spread, etc.). With a 1-12 spread:
- At TC -1: betting 1 unit (low risk per hand)
- At TC +5: betting 12 units (high risk per hand)

The variance contribution from high-count bets dominates, but the current formula treats all bets equally. This **dramatically underestimates risk of ruin** for spread bettors.

**Real-world impact:** A player might think they have 5% RoR when they actually have 15% RoR. This could lead to inadequate bankroll sizing and going broke.

#### Current Implementation Location

| File | Lines | What's There |
|------|-------|--------------|
| `backend/app/engine/simulation.py` | - | RoR removed; engine returns unit-first EV/SD/variance only |
| `backend/app/models.py` | - | `ror` and `ror_detail` fields retained for compatibility (typically null) |
| `frontend/src/App.tsx` | ~1800-1850 | RoR display in results |

#### Acceptance Criteria

- [x] RoR calculation accounts for actual bet distribution from simulation
- [x] Trip RoR (probability of losing X units in Y hours)
- [x] Required bankroll calculation for 5% and 1% RoR targets
- [x] Detailed RoR display in frontend with explanations
- [ ] Per-TC variance weighted by bet size squared (future enhancement)
- [ ] Kelly-based RoR calculation option (future enhancement)
- [ ] Monte Carlo RoR estimation option (for verification - future enhancement)
- [x] 95% confidence interval on RoR estimate (derived from EV/SD CI in the frontend)
- [ ] Unit tests comparing to known CVCX values (future enhancement)

#### Implementation Steps

**Step 1: Collect bet-weighted statistics during simulation**

In `simulation.py`, modify the stats collection to track bet-weighted variance:

```python
# Add to initialization (around line 220)
total_bet_weighted_profit = 0.0
total_bet_squared = 0.0
bet_variance_accumulator = 0.0  # For Welford's on bet-weighted returns

# In the main loop, after calculating profit (around line 485)
if bet > 0:
    weighted_return = profit / bet  # Return per unit bet
    total_bet_squared += bet * bet
    # Update bet-weighted variance using actual bet sizes
```

**Step 2: Implement proper variable-bet RoR formula**

The correct formula for variable betting (Don Schlesinger's approach):

```python
def calculate_variable_bet_ror(
    ev_per_hand: float,
    variance_per_hand: float,
    avg_bet: float,
    avg_bet_squared: float,  # E[bet^2]
    bankroll: float
) -> float:
    """
    RoR for variable betting uses the formula:
    RoR = exp(-2 * EV * B / V_adj)

    Where V_adj accounts for bet variation:
    V_adj = Var(profit) = E[bet^2] * Var(return|bet) + Var(bet) * E[return]^2

    For practical purposes with large samples:
    V_adj ≈ sample variance of actual profits (which we already have)

    The key insight: use ACTUAL profit variance, not theoretical.
    """
    if ev_per_hand <= 0:
        return 1.0

    # Use actual observed variance (already bet-weighted)
    k = (2 * ev_per_hand) / variance_per_hand
    return math.exp(-k * bankroll)
```

**Step 3: Add Monte Carlo RoR verification**

Create new function in `simulation.py`:

```python
def monte_carlo_ror(
    ev_per_hand: float,
    stdev_per_hand: float,
    bankroll: float,
    hands_per_session: int,
    num_simulations: int = 10000,
    rng: np.random.Generator = None
) -> Tuple[float, float, float]:
    """
    Simulate many player careers to estimate RoR empirically.
    Returns: (ror_estimate, ci_lower, ci_upper)
    """
    if rng is None:
        rng = np.random.default_rng()

    ruins = 0
    for _ in range(num_simulations):
        current_bankroll = bankroll
        # Simulate until ruin or target (e.g., 2x bankroll)
        while 0 < current_bankroll < bankroll * 2:
            # Random walk with actual EV/SD
            profit = rng.normal(ev_per_hand * hands_per_session,
                               stdev_per_hand * math.sqrt(hands_per_session))
            current_bankroll += profit
        if current_bankroll <= 0:
            ruins += 1

    ror = ruins / num_simulations
    # Wilson score interval for proportion
    ci_lower, ci_upper = wilson_ci(ruins, num_simulations, 0.95)
    return ror, ci_lower, ci_upper
```

**Step 4: Add Trip RoR calculation**

```python
def trip_ror(
    ev_per_hour: float,
    stdev_per_hour: float,
    trip_hours: float,
    trip_bankroll: float
) -> float:
    """
    Probability of going broke during a single trip.
    Uses normal approximation for trip results.
    """
    trip_ev = ev_per_hour * trip_hours
    trip_stdev = stdev_per_hour * math.sqrt(trip_hours)

    if trip_stdev == 0:
        return 0.0 if trip_ev > -trip_bankroll else 1.0

    # P(result < -bankroll) using normal CDF
    z = (-trip_bankroll - trip_ev) / trip_stdev
    from scipy.stats import norm
    return norm.cdf(z)
```

**Step 5: Update models.py**

```python
class RoRResult(BaseModel):
    """Detailed risk of ruin analysis"""
    simple_ror: float  # Basic formula (for reference)
    adjusted_ror: float  # Bet-weighted formula
    monte_carlo_ror: Optional[float] = None
    monte_carlo_ci_lower: Optional[float] = None
    monte_carlo_ci_upper: Optional[float] = None
    trip_ror: Optional[float] = None  # For specified trip length
    trip_hours: Optional[float] = None
    n0_hands: float  # Hands to overcome 1 SD
    required_bankroll_5pct: float  # Bankroll for 5% RoR
    required_bankroll_1pct: float  # Bankroll for 1% RoR

class SimulationResult(BaseModel):
    # ... existing fields ...
    ror: Optional[float] = None  # Keep for backwards compat
    ror_detail: Optional[RoRResult] = None  # New detailed RoR
```

**Step 6: Update frontend display**

In `App.tsx`, add RoR detail panel:

```tsx
{result.ror_detail && (
  <div className="ror-detail-card">
    <h4>Risk of Ruin Analysis</h4>
    <table>
      <tr>
        <td>Lifetime RoR (adjusted)</td>
        <td>{(result.ror_detail.adjusted_ror * 100).toFixed(2)}%</td>
      </tr>
      <tr>
        <td>Trip RoR ({result.ror_detail.trip_hours}h)</td>
        <td>{(result.ror_detail.trip_ror * 100).toFixed(2)}%</td>
      </tr>
      <tr>
        <td>Bankroll for 5% RoR</td>
        <td>${result.ror_detail.required_bankroll_5pct.toFixed(0)}</td>
      </tr>
    </table>
  </div>
)}
```

#### Test Cases

```python
def test_ror_variable_betting():
    """RoR with 1-12 spread should be higher than 1-1 flat bet"""
    # Same EV, but spread betting has higher variance
    flat_ror = calculate_ror(ev=0.5, variance=1.2, bankroll=1000)
    spread_ror = calculate_ror(ev=0.5, variance=3.8, bankroll=1000)  # Higher var from spread
    assert spread_ror > flat_ror

def test_ror_matches_cvcx():
    """Compare to known CVCX values for standard conditions"""
    # 6D H17 DAS, 1-12 spread, TC+2 entry, $10k bankroll
    # CVCX shows ~5.2% RoR
    result = run_simulation(...)
    assert 0.04 < result.ror_detail.adjusted_ror < 0.07
```

---

### Task #40: Add Confidence Intervals to All Metrics

**Priority:** 🔴 CRITICAL

**Status:** ✅ COMPLETED - Frontend UI improvements and visual feedback implemented (Jan 25, 2026)

#### What Was Done

**Phase 1: Fixed Sticky Header**
- Removed `position: sticky` from `.topbar` in App.css
- Header now scrolls naturally with page content
- Reduced topbar visual weight (removed blur effect)

**Phase 2: Added CI Warning System**
- Implemented `ciWarning` calculation in App.tsx (lines 1334-1371)
- Categorizes precision status into 4 levels: Good (≤20%), Low (20-100%), Medium (50-100%), High (>100%)
- Color-coded badges display CI width relative to EV estimate
- Different colors for each warning level: green, blue, orange, red

**Phase 3: Added Visual Comparison Bar**
- Created `.precision-comparison-bar` with visual marker showing current vs target half-width
- Current marker animates as precision improves
- Target line shows the goal (right edge = target reached)
- Labels show exact values (e.g., "Current: 0.18u" vs "Target: 0.20u")

**Phase 4: Added Progress Indicator**
- Implemented progress bar during auto-precision mode
- Shows percentage toward target (`width = (1 - additional/total) * 100`)
- Displays remaining hands needed
- Progress bar fills from left to right as convergence happens

**Phase 5: Enhanced Status Messages**
- Replaced plain text with color-coded status section
- Green background + message: "✅ Within target precision!" when achieved
- Contextual messages based on CI width levels
- Updated progress label during auto-precision runs

#### Implementation Details

**Files Modified:**
1. `frontend/src/App.css` (lines 47-62, 92-215): Removed sticky, added visual element styles
2. `frontend/src/App.tsx` (lines 1334-1371): Added ciWarning calculation
3. `frontend/src/App.tsx` (lines 1879-1980): Updated precision target JSX with visual elements

**New CSS Classes Added:**
- `.precision-badge`: CI status indicator badge (Good/Moderate/Wide/Very Wide)
- `.precision-visual`: Container for visual comparison elements
- `.precision-labels`: Labels showing current and target values
- `.precision-comparison-bar`: Visual bar with current marker and target line
- `.current-marker`: Animated marker showing current half-width position
- `.target-line`: Right edge indicator showing target position
- `.precision-status`: Color-coded status message box
- `.precision-progress-section`: Container for progress bar
- `.progress-bar-container`: Background container for progress fill
- `.progress-bar-fill`: Animated gradient fill showing convergence progress

**Color Scheme:**
- Good (≤20% CI): Green (#27ae60) - High confidence
- Low (20-50% CI): Blue (#3498db) - Reasonable precision
- Medium (50-100% CI): Orange (#f39c12) - Run more hands
- High (>100% CI): Red (#e74c3c) - Very uncertain

#### Why This Matters

Currently, the simulator reports point estimates like "EV/100 = 1.25 units" with no indication of uncertainty. But with 200,000 hands:
- True EV might be anywhere from 0.95 to 1.55 units (95% CI)
- The displayed value is just one sample from a distribution

**Without confidence intervals, users can't distinguish:**
- A reliable result from a noisy one
- Whether 2M hands is enough or if they need 10M
- If a strategy change actually improved EV or was just variance

**Real-world impact:** Users might abandon a profitable strategy because one simulation showed negative EV (when the CI includes positive values), or adopt a losing strategy that got lucky.

#### Current Implementation Location

| File | Lines | What's There |
|------|-------|--------------|
| `backend/app/engine/simulation.py` | 528-536 | Mean/variance calculation |
| `backend/app/models.py` | 107-122 | SimulationResult fields |
| `frontend/src/App.tsx` | ~1000-2400 | CI calculation + toggle + display + tooltips |

#### Acceptance Criteria

- [x] 95% CI for EV/100 (primary metric)
- [x] 95% CI for standard deviation
- [x] CI for DI (Desirability Index)
- [x] CI for SCORE
- [x] Sample size warning when CI is too wide (>50% of estimate)
- [x] "Hands needed" calculator for desired precision
- [x] Visual CI display (range text + tooltips)
- [x] Progress indicator during auto-precision mode
- [x] Visual comparison bar (current vs target half-width)
- [x] Color-coded status badges (Good/Moderate/Wide/Very Wide CI)

#### Implementation Steps

**Step 0: Frontend CI (DONE)**

The UI now derives 95% CIs from EV/SD + rounds played and shows them in Primary Metrics and Performance Table tooltips. This does not require backend changes.

**Step 1: Calculate standard error and CI in simulation.py**

After the main statistics calculation (around line 536):

```python
# Standard error of the mean
se_mean = stdev / math.sqrt(rounds_played) if rounds_played > 0 else 0

# 95% CI for mean (z = 1.96 for large samples)
z_95 = 1.96
ci_ev_lower = mean - z_95 * se_mean
ci_ev_upper = mean + z_95 * se_mean

# For EV/100
ev_per_100_se = se_mean * 100
ev_per_100_ci_lower = ci_ev_lower * 100
ev_per_100_ci_upper = ci_ev_upper * 100

# CI for standard deviation (chi-square based)
# For large n, stdev is approximately normal with SE = stdev / sqrt(2n)
se_stdev = stdev / math.sqrt(2 * rounds_played) if rounds_played > 0 else 0
stdev_per_100_ci_lower = (stdev - z_95 * se_stdev) * 10
stdev_per_100_ci_upper = (stdev + z_95 * se_stdev) * 10

# CI for DI using delta method
# DI = mean/stdev, Var(DI) ≈ (1/stdev^2) * Var(mean) + (mean^2/stdev^4) * Var(stdev)
if stdev > 0 and rounds_played > 0:
    var_di = (se_mean**2 / stdev**2) + (mean**2 * se_stdev**2 / stdev**4)
    se_di = math.sqrt(var_di)
    di_ci_lower = di - z_95 * se_di
    di_ci_upper = di + z_95 * se_di
else:
    di_ci_lower = di_ci_upper = di

# Hands needed for 10% precision on EV
# We want: z * SE < 0.1 * |mean|
# z * (stdev/sqrt(n)) < 0.1 * |mean|
# n > (z * stdev / (0.1 * |mean|))^2
if mean != 0:
    hands_for_10pct_precision = int((z_95 * stdev / (0.1 * abs(mean)))**2)
else:
    hands_for_10pct_precision = None
```

**Step 2: Update models.py with CI fields**

```python
class ConfidenceInterval(BaseModel):
    """95% confidence interval for a metric"""
    value: float
    ci_lower: float
    ci_upper: float
    se: float  # Standard error

    @property
    def ci_width(self) -> float:
        return self.ci_upper - self.ci_lower

    @property
    def relative_precision(self) -> Optional[float]:
        """CI width as percentage of value"""
        if self.value == 0:
            return None
        return abs(self.ci_width / self.value) * 100

class SimulationResult(BaseModel):
    # Point estimates (keep for backwards compatibility)
    ev_per_100: float
    stdev_per_100: float
    variance_per_hand: float
    di: float
    score: float
    n0_hands: float

    # New: Confidence intervals
    ev_per_100_ci: Optional[ConfidenceInterval] = None
    stdev_per_100_ci: Optional[ConfidenceInterval] = None
    di_ci: Optional[ConfidenceInterval] = None
    score_ci: Optional[ConfidenceInterval] = None

    # Precision guidance
    hands_for_10pct_precision: Optional[int] = None
    precision_warning: Optional[str] = None  # e.g., "CI is 80% of estimate - run more hands"

    # ... rest of existing fields ...
```

**Step 3: Add precision warning logic**

```python
# In simulation.py, before returning result
precision_warning = None
if ev_per_100 != 0:
    relative_ci_width = (ev_per_100_ci_upper - ev_per_100_ci_lower) / abs(ev_per_100)
    if relative_ci_width > 1.0:
        precision_warning = f"Low precision: CI is {relative_ci_width*100:.0f}% of estimate. Consider running {hands_for_10pct_precision:,} hands for reliable results."
    elif relative_ci_width > 0.5:
        precision_warning = f"Moderate precision: CI is {relative_ci_width*100:.0f}% of estimate."
```

**Step 4: Update frontend display**

In `App.tsx`, modify the metrics display:

```tsx
// Helper component for metric with CI
const MetricWithCI = ({
  label,
  value,
  ci,
  unit = "",
  decimals = 2
}: {
  label: string;
  value: number;
  ci?: ConfidenceInterval;
  unit?: string;
  decimals?: number;
}) => (
  <div className="metric-with-ci">
    <div className="metric-label">{label}</div>
    <div className="metric-value">
      {value.toFixed(decimals)}{unit}
      {ci && (
        <span className="metric-ci">
          ({ci.ci_lower.toFixed(decimals)} to {ci.ci_upper.toFixed(decimals)})
        </span>
      )}
    </div>
    {ci && ci.relative_precision && ci.relative_precision > 50 && (
      <div className="metric-warning">⚠️ Wide CI - run more hands</div>
    )}
  </div>
);

// In results panel
<MetricWithCI
  label="EV/100"
  value={result.ev_per_100}
  ci={result.ev_per_100_ci}
  unit=" units"
/>
```

**Step 5: Add CSS for CI display**

```css
.metric-ci {
  font-size: 0.8em;
  color: var(--text-secondary);
  margin-left: 8px;
}

.metric-warning {
  font-size: 0.75em;
  color: var(--warning-color);
  margin-top: 2px;
}

.ci-wide { color: var(--error-color); }
.ci-moderate { color: var(--warning-color); }
.ci-good { color: var(--success-color); }
```

#### Test Cases

```python
def test_ci_narrows_with_more_hands():
    """CI should be ~sqrt(n) narrower with more hands"""
    result_100k = run_simulation(hands=100_000, seed=42)
    result_1m = run_simulation(hands=1_000_000, seed=42)

    ci_width_100k = result_100k.ev_per_100_ci.ci_upper - result_100k.ev_per_100_ci.ci_lower
    ci_width_1m = result_1m.ev_per_100_ci.ci_upper - result_1m.ev_per_100_ci.ci_lower

    # 10x hands should give ~3.16x narrower CI
    ratio = ci_width_100k / ci_width_1m
    assert 2.5 < ratio < 4.0

def test_ci_contains_true_value():
    """95% CI should contain true value ~95% of the time"""
    true_ev = 1.0  # Known from theory
    hits = 0
    for seed in range(100):
        result = run_simulation(hands=1_000_000, seed=seed)
        if result.ev_per_100_ci.ci_lower <= true_ev <= result.ev_per_100_ci.ci_upper:
            hits += 1
    # Should be ~95, allow some variance
    assert 85 < hits < 100
```

---

### Task #8: Implement Proper Insurance EV Tracking

**Priority:** 🔴 HIGH

#### Why This Matters

Insurance is one of the most misunderstood bets in blackjack. The current implementation:
- Takes insurance based on deviation (TC >= 3 typically)
- Adds insurance payout to hand profit
- **But doesn't track insurance outcomes separately**

**Problems with current approach:**
1. Can't see insurance win rate by true count
2. Can't verify the TC+3 threshold is optimal for your rules
3. Can't analyze "even money" vs "insurance" on blackjack hands
4. No ace side-count integration (insurance is about 10-density)

**Real-world impact:** Insurance at TC+3 is a general guideline. With specific rules/penetration, the optimal threshold might be TC+2.5 or TC+3.5. Users need data to optimize.

#### Current Implementation Location

| File | Lines | What's There |
|------|-------|--------------|
| `backend/app/engine/simulation.py` | 308-316 | Insurance decision and payout |
| `backend/app/data/presets.py` | 28 | Insurance deviation (TC+3) |
| `frontend/src/App.tsx` | N/A | No insurance display |

Current code:
```python
# Lines 308-316
if dealer[0] == "A":
    ins_action = apply_deviation("insurance", tc_for_dev, dev_index)
    if ins_action == "I":
        insurance_bet = bet / 2
        if is_blackjack(dealer):
            insurance_payout = insurance_bet * 2  # wins 2:1
        else:
            insurance_payout = -insurance_bet
```

#### Acceptance Criteria

- [ ] Track insurance offers, takes, and outcomes separately
- [ ] Insurance statistics by true count bucket
- [ ] Calculate breakeven TC for insurance (when it becomes +EV)
- [ ] Even money tracking (player BJ + dealer Ace situations)
- [ ] Insurance EV contribution to overall EV
- [ ] Display insurance stats in results panel
- [ ] Ace side-count correlation (future enhancement hook)

#### Implementation Steps

**Step 1: Add insurance tracking data structures**

In `simulation.py`, add after line 226:

```python
# Insurance tracking
insurance_stats: Dict[int, Dict[str, float]] = {}  # By TC bucket

def get_insurance_bucket(tc_bucket: int) -> Dict[str, float]:
    return insurance_stats.setdefault(tc_bucket, {
        "offered": 0,      # Times dealer showed Ace
        "taken": 0,        # Times we took insurance
        "won": 0,          # Times insurance won (dealer BJ)
        "lost": 0,         # Times insurance lost (no dealer BJ)
        "profit": 0.0,     # Total insurance profit/loss
        "even_money_offered": 0,  # Player BJ + dealer Ace
        "even_money_taken": 0,
    })
```

**Step 2: Modify insurance handling code**

Replace lines 307-316 with:

```python
# Insurance decision
insurance_payout = 0.0
insurance_taken = False

if dealer[0] == "A":
    ins_bucket = get_insurance_bucket(round_tc_bucket)
    ins_bucket["offered"] += 1

    # Check if this is an even money situation
    is_even_money_situation = is_blackjack(player_start)
    if is_even_money_situation:
        ins_bucket["even_money_offered"] += 1

    # Check if we take insurance
    ins_action = apply_deviation("insurance", tc_for_dev, dev_index)
    if ins_action == "I":
        insurance_taken = True
        ins_bucket["taken"] += 1
        if is_even_money_situation:
            ins_bucket["even_money_taken"] += 1

        insurance_bet = bet / 2
        dealer_has_bj = is_blackjack(dealer)

        if dealer_has_bj:
            insurance_payout = insurance_bet * 2  # 2:1 payout
            ins_bucket["won"] += 1
        else:
            insurance_payout = -insurance_bet
            ins_bucket["lost"] += 1

        ins_bucket["profit"] += insurance_payout
```

**Step 3: Add insurance stats to result model**

In `models.py`:

```python
class InsuranceStats(BaseModel):
    """Insurance statistics for a TC bucket"""
    tc: int
    offered: int
    taken: int
    won: int
    lost: int
    win_rate: float  # won / taken (when taken)
    ev_when_taken: float  # Average profit per insurance bet taken
    profit_total: float
    even_money_offered: int
    even_money_taken: int

class InsuranceSummary(BaseModel):
    """Overall insurance analysis"""
    total_offered: int
    total_taken: int
    total_won: int
    total_lost: int
    overall_win_rate: float
    overall_ev: float  # EV per insurance bet
    profit_contribution: float  # Total insurance profit
    breakeven_tc: Optional[float]  # Estimated TC where insurance becomes +EV
    by_tc: List[InsuranceStats]

class SimulationResult(BaseModel):
    # ... existing fields ...
    insurance: Optional[InsuranceSummary] = None
```

**Step 4: Calculate insurance summary before returning**

In `simulation.py`, before the final return:

```python
# Build insurance summary
insurance_by_tc = []
total_ins_offered = 0
total_ins_taken = 0
total_ins_won = 0
total_ins_profit = 0.0

for tc_bucket, stats in sorted(insurance_stats.items()):
    if stats["offered"] == 0:
        continue

    total_ins_offered += stats["offered"]
    total_ins_taken += stats["taken"]
    total_ins_won += stats["won"]
    total_ins_profit += stats["profit"]

    win_rate = stats["won"] / stats["taken"] if stats["taken"] > 0 else 0
    ev_when_taken = stats["profit"] / stats["taken"] if stats["taken"] > 0 else 0

    insurance_by_tc.append(InsuranceStats(
        tc=tc_bucket,
        offered=int(stats["offered"]),
        taken=int(stats["taken"]),
        won=int(stats["won"]),
        lost=int(stats["lost"]),
        win_rate=win_rate,
        ev_when_taken=ev_when_taken,
        profit_total=stats["profit"],
        even_money_offered=int(stats["even_money_offered"]),
        even_money_taken=int(stats["even_money_taken"]),
    ))

# Estimate breakeven TC (where win_rate >= 1/3, since insurance pays 2:1)
breakeven_tc = None
for stat in insurance_by_tc:
    if stat.taken >= 100 and stat.win_rate >= 0.333:  # Need decent sample
        breakeven_tc = stat.tc
        break

insurance_summary = InsuranceSummary(
    total_offered=total_ins_offered,
    total_taken=total_ins_taken,
    total_won=total_ins_won,
    total_lost=total_ins_taken - total_ins_won,
    overall_win_rate=total_ins_won / total_ins_taken if total_ins_taken > 0 else 0,
    overall_ev=total_ins_profit / total_ins_taken if total_ins_taken > 0 else 0,
    profit_contribution=total_ins_profit,
    breakeven_tc=breakeven_tc,
    by_tc=insurance_by_tc,
) if total_ins_offered > 0 else None
```

**Step 5: Add frontend display**

In `App.tsx`, add insurance stats panel:

```tsx
{result.insurance && (
  <div className="card insurance-stats">
    <h3>Insurance Analysis</h3>

    <div className="insurance-summary">
      <div className="stat">
        <span className="label">Times Offered</span>
        <span className="value">{result.insurance.total_offered.toLocaleString()}</span>
      </div>
      <div className="stat">
        <span className="label">Times Taken</span>
        <span className="value">{result.insurance.total_taken.toLocaleString()}</span>
      </div>
      <div className="stat">
        <span className="label">Win Rate</span>
        <span className="value">{(result.insurance.overall_win_rate * 100).toFixed(1)}%</span>
        <span className="hint">(need 33.3% to break even)</span>
      </div>
      <div className="stat">
        <span className="label">EV per Insurance Bet</span>
        <span className={`value ${result.insurance.overall_ev >= 0 ? 'positive' : 'negative'}`}>
          {result.insurance.overall_ev >= 0 ? '+' : ''}{result.insurance.overall_ev.toFixed(4)} units
        </span>
      </div>
      {result.insurance.breakeven_tc && (
        <div className="stat highlight">
          <span className="label">Estimated Breakeven TC</span>
          <span className="value">TC {result.insurance.breakeven_tc}+</span>
        </div>
      )}
    </div>

    <details>
      <summary>Insurance by True Count</summary>
      <table className="insurance-tc-table">
        <thead>
          <tr>
            <th>TC</th>
            <th>Offered</th>
            <th>Taken</th>
            <th>Won</th>
            <th>Win %</th>
            <th>EV</th>
          </tr>
        </thead>
        <tbody>
          {result.insurance.by_tc.map(row => (
            <tr key={row.tc} className={row.ev_when_taken >= 0 ? 'positive-ev' : ''}>
              <td>{row.tc}</td>
              <td>{row.offered}</td>
              <td>{row.taken}</td>
              <td>{row.won}</td>
              <td>{(row.win_rate * 100).toFixed(1)}%</td>
              <td>{row.ev_when_taken.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  </div>
)}
```

#### Test Cases

```python
def test_insurance_win_rate_increases_with_tc():
    """Higher TC should mean more 10s, higher insurance win rate"""
    result = run_simulation(hands=5_000_000, seed=42)

    tc_3_stats = next(s for s in result.insurance.by_tc if s.tc == 3)
    tc_5_stats = next(s for s in result.insurance.by_tc if s.tc == 5)

    # TC+5 should have higher win rate than TC+3
    assert tc_5_stats.win_rate > tc_3_stats.win_rate

def test_insurance_breakeven_around_tc3():
    """With Hi-Lo, insurance should break even around TC+3"""
    result = run_simulation(hands=10_000_000, seed=42)
    assert 2 <= result.insurance.breakeven_tc <= 4
```

---

### Task #5: Add Custom Basic Strategy Editor

**Priority:** 🔴 HIGH

#### Why This Matters

The current simulator uses hardcoded basic strategy in `simulation.py:61-144`. Users cannot:
- Adjust strategy for unusual rule combinations
- Test intentionally "wrong" plays to see EV cost
- Use composition-dependent strategy
- Import strategies from other sources

**Real-world impact:** Different casinos have different rules. A player at a S17 game using H17 strategy leaves money on the table. Custom strategy editing enables optimization for specific conditions.

#### Current Implementation Location

| File | Lines | What's There |
|------|-------|--------------|
| `backend/app/engine/simulation.py` | 61-117 | `basic_strategy_action()` |
| `backend/app/engine/simulation.py` | 119-144 | `pair_strategy_action()` |
| `frontend/src/App.tsx` | 183-239 | Duplicate strategy for display |

The strategy is currently a function with if/else logic, not a data structure.

#### Acceptance Criteria

- [ ] Strategy stored as JSON data structure, not code
- [ ] Editable grid UI for hard totals (8-17 vs 2-A)
- [ ] Editable grid UI for soft totals (A2-A9 vs 2-A)
- [ ] Editable grid UI for pairs (2-2 through A-A vs 2-A)
- [ ] Click/tap to cycle through actions (H→S→D→R→H)
- [ ] Visual diff against "optimal" basic strategy
- [ ] Import/export strategy as JSON
- [ ] Pre-built strategies for common rule sets
- [ ] Backend accepts strategy in request, uses instead of hardcoded

#### Implementation Steps

**Step 1: Define strategy data structure**

In `models.py`, add:

```python
class BasicStrategy(BaseModel):
    """
    Complete basic strategy as data.
    Keys are hand descriptions, values are actions.

    Hard hands: "8", "9", "10", "11", "12", "13", "14", "15", "16", "17"
    Soft hands: "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"
    Pairs: "22", "33", "44", "55", "66", "77", "88", "99", "TT", "AA"

    Dealer upcards: "2", "3", "4", "5", "6", "7", "8", "9", "T", "A"

    Actions: "H" (hit), "S" (stand), "D" (double/hit), "Ds" (double/stand),
             "P" (split), "Ph" (split if DAS else hit), "R" (surrender/hit),
             "Rs" (surrender/stand)
    """
    name: str = "Custom"
    hard: Dict[str, Dict[str, str]]  # hard["12"]["4"] = "S"
    soft: Dict[str, Dict[str, str]]  # soft["A7"]["6"] = "Ds"
    pairs: Dict[str, Dict[str, str]]  # pairs["88"]["T"] = "P"

    @classmethod
    def default_h17_das(cls) -> "BasicStrategy":
        """Standard basic strategy for 6D H17 DAS"""
        return cls(
            name="6D H17 DAS",
            hard={
                "8":  {"2":"H","3":"H","4":"H","5":"H","6":"H","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "9":  {"2":"H","3":"D","4":"D","5":"D","6":"D","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "10": {"2":"D","3":"D","4":"D","5":"D","6":"D","7":"D","8":"D","9":"D","T":"H","A":"H"},
                "11": {"2":"D","3":"D","4":"D","5":"D","6":"D","7":"D","8":"D","9":"D","T":"D","A":"D"},
                "12": {"2":"H","3":"H","4":"S","5":"S","6":"S","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "13": {"2":"S","3":"S","4":"S","5":"S","6":"S","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "14": {"2":"S","3":"S","4":"S","5":"S","6":"S","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "15": {"2":"S","3":"S","4":"S","5":"S","6":"S","7":"H","8":"H","9":"H","T":"R","A":"H"},
                "16": {"2":"S","3":"S","4":"S","5":"S","6":"S","7":"H","8":"H","9":"R","T":"R","A":"R"},
                "17": {"2":"S","3":"S","4":"S","5":"S","6":"S","7":"S","8":"S","9":"S","T":"S","A":"S"},
            },
            soft={
                "A2": {"2":"H","3":"H","4":"H","5":"D","6":"D","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "A3": {"2":"H","3":"H","4":"H","5":"D","6":"D","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "A4": {"2":"H","3":"H","4":"D","5":"D","6":"D","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "A5": {"2":"H","3":"H","4":"D","5":"D","6":"D","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "A6": {"2":"H","3":"D","4":"D","5":"D","6":"D","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "A7": {"2":"Ds","3":"Ds","4":"Ds","5":"Ds","6":"Ds","7":"S","8":"S","9":"H","T":"H","A":"H"},
                "A8": {"2":"S","3":"S","4":"S","5":"S","6":"Ds","7":"S","8":"S","9":"S","T":"S","A":"S"},
                "A9": {"2":"S","3":"S","4":"S","5":"S","6":"S","7":"S","8":"S","9":"S","T":"S","A":"S"},
            },
            pairs={
                "22": {"2":"Ph","3":"Ph","4":"P","5":"P","6":"P","7":"P","8":"H","9":"H","T":"H","A":"H"},
                "33": {"2":"Ph","3":"Ph","4":"P","5":"P","6":"P","7":"P","8":"H","9":"H","T":"H","A":"H"},
                "44": {"2":"H","3":"H","4":"H","5":"Ph","6":"Ph","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "55": {"2":"D","3":"D","4":"D","5":"D","6":"D","7":"D","8":"D","9":"D","T":"H","A":"H"},
                "66": {"2":"Ph","3":"P","4":"P","5":"P","6":"P","7":"H","8":"H","9":"H","T":"H","A":"H"},
                "77": {"2":"P","3":"P","4":"P","5":"P","6":"P","7":"P","8":"H","9":"H","T":"H","A":"H"},
                "88": {"2":"P","3":"P","4":"P","5":"P","6":"P","7":"P","8":"P","9":"P","T":"P","A":"P"},
                "99": {"2":"P","3":"P","4":"P","5":"P","6":"P","7":"S","8":"P","9":"P","T":"S","A":"S"},
                "TT": {"2":"S","3":"S","4":"S","5":"S","6":"S","7":"S","8":"S","9":"S","T":"S","A":"S"},
                "AA": {"2":"P","3":"P","4":"P","5":"P","6":"P","7":"P","8":"P","9":"P","T":"P","A":"P"},
            }
        )
```

**Step 2: Update SimulationRequest to accept strategy**

```python
class SimulationRequest(BaseModel):
    # ... existing fields ...
    basic_strategy: Optional[BasicStrategy] = None  # If None, use built-in
```

**Step 3: Modify simulation.py to use data-driven strategy**

Replace hardcoded functions with lookup:

```python
def basic_strategy_action_from_data(
    player: List[str],
    dealer_up: str,
    strategy: BasicStrategy,
    rules: Rules
) -> str:
    """Look up action from strategy data structure"""
    total, soft = hand_value(player)
    up = upcard_key(dealer_up)

    if soft and total <= 21:
        # Soft hand: A2-A9
        other_card_value = total - 11  # The non-ace card(s) value
        if 2 <= other_card_value <= 9:
            key = f"A{other_card_value}"
            action = strategy.soft.get(key, {}).get(up, "H")
            return resolve_conditional_action(action, rules)

    # Hard hand
    if 8 <= total <= 17:
        action = strategy.hard.get(str(total), {}).get(up, "H")
        return resolve_conditional_action(action, rules)

    # Default for very low or bust hands
    return "H" if total < 17 else "S"

def resolve_conditional_action(action: str, rules: Rules) -> str:
    """Convert conditional actions based on rules"""
    if action == "D":
        return "DH"  # Double else hit
    if action == "Ds":
        return "DS"  # Double else stand
    if action == "R":
        return "R" if rules.surrender else "H"
    if action == "Rs":
        return "R" if rules.surrender else "S"
    if action == "Ph":
        return "P" if rules.double_after_split else "H"
    return action
```

**Step 4: Create frontend strategy editor component**

Create new file `frontend/src/components/StrategyEditor.tsx`:

```tsx
import { BasicStrategy } from "../api/client";

const DEALER_UPCARDS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "A"];
const HARD_TOTALS = ["17", "16", "15", "14", "13", "12", "11", "10", "9", "8"];
const SOFT_HANDS = ["A9", "A8", "A7", "A6", "A5", "A4", "A3", "A2"];
const PAIRS = ["AA", "TT", "99", "88", "77", "66", "55", "44", "33", "22"];

const ACTION_CYCLE = ["H", "S", "D", "Ds", "P", "Ph", "R", "Rs"];
const ACTION_COLORS: Record<string, string> = {
  H: "#4ecdc4",   // Cyan - Hit
  S: "#95a5a6",   // Gray - Stand
  D: "#f39c12",   // Orange - Double
  Ds: "#e67e22",  // Dark orange - Double/Stand
  P: "#9b59b6",   // Purple - Split
  Ph: "#8e44ad",  // Dark purple - Split/Hit
  R: "#e74c3c",   // Red - Surrender
  Rs: "#c0392b",  // Dark red - Surrender/Stand
};

interface StrategyEditorProps {
  strategy: BasicStrategy;
  onChange: (strategy: BasicStrategy) => void;
  optimalStrategy?: BasicStrategy;  // For comparison highlighting
}

export function StrategyEditor({ strategy, onChange, optimalStrategy }: StrategyEditorProps) {
  const cycleAction = (
    type: "hard" | "soft" | "pairs",
    hand: string,
    upcard: string
  ) => {
    const current = strategy[type][hand]?.[upcard] || "H";
    const currentIdx = ACTION_CYCLE.indexOf(current);
    const nextIdx = (currentIdx + 1) % ACTION_CYCLE.length;
    const nextAction = ACTION_CYCLE[nextIdx];

    const newStrategy = {
      ...strategy,
      [type]: {
        ...strategy[type],
        [hand]: {
          ...strategy[type][hand],
          [upcard]: nextAction,
        },
      },
    };
    onChange(newStrategy);
  };

  const renderCell = (
    type: "hard" | "soft" | "pairs",
    hand: string,
    upcard: string
  ) => {
    const action = strategy[type][hand]?.[upcard] || "H";
    const optimal = optimalStrategy?.[type][hand]?.[upcard];
    const isDeviation = optimal && action !== optimal;

    return (
      <td
        key={upcard}
        className={`strategy-cell ${isDeviation ? "deviation" : ""}`}
        style={{ backgroundColor: ACTION_COLORS[action] }}
        onClick={() => cycleAction(type, hand, upcard)}
        title={`${hand} vs ${upcard}: ${action}${isDeviation ? ` (optimal: ${optimal})` : ""}`}
      >
        {action}
      </td>
    );
  };

  const renderTable = (
    type: "hard" | "soft" | "pairs",
    rows: string[],
    label: string
  ) => (
    <div className="strategy-table-container">
      <h4>{label}</h4>
      <table className="strategy-table">
        <thead>
          <tr>
            <th></th>
            {DEALER_UPCARDS.map(up => <th key={up}>{up}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(hand => (
            <tr key={hand}>
              <th>{hand}</th>
              {DEALER_UPCARDS.map(up => renderCell(type, hand, up))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="strategy-editor">
      <div className="strategy-legend">
        {Object.entries(ACTION_COLORS).map(([action, color]) => (
          <span key={action} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: color }} />
            {action}
          </span>
        ))}
      </div>

      <div className="strategy-tables">
        {renderTable("hard", HARD_TOTALS, "Hard Totals")}
        {renderTable("soft", SOFT_HANDS, "Soft Hands")}
        {renderTable("pairs", PAIRS, "Pairs")}
      </div>

      <div className="strategy-actions">
        <button onClick={() => onChange(BasicStrategy.default_h17_das())}>
          Reset to Default
        </button>
        <button onClick={() => {/* Export JSON */}}>Export</button>
        <button onClick={() => {/* Import JSON */}}>Import</button>
      </div>
    </div>
  );
}
```

**Step 5: Add CSS for strategy editor**

```css
.strategy-table {
  border-collapse: collapse;
  font-size: 12px;
}

.strategy-table th,
.strategy-table td {
  border: 1px solid #333;
  padding: 4px 6px;
  text-align: center;
  min-width: 28px;
}

.strategy-cell {
  cursor: pointer;
  font-weight: bold;
  color: #000;
  transition: transform 0.1s;
}

.strategy-cell:hover {
  transform: scale(1.1);
  z-index: 1;
}

.strategy-cell.deviation {
  box-shadow: inset 0 0 0 2px red;
}

.strategy-tables {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.strategy-legend {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 2px;
}
```

#### Test Cases

```python
def test_custom_strategy_respected():
    """Simulation should use custom strategy when provided"""
    # Create strategy that always stands on 12
    strategy = BasicStrategy.default_h17_das()
    for up in ["2", "3", "4", "5", "6", "7", "8", "9", "T", "A"]:
        strategy.hard["12"][up] = "S"

    result = run_simulation(basic_strategy=strategy, hands=100_000)
    # Should have different EV than default (standing on 12 vs 2,3 is wrong)
    default_result = run_simulation(hands=100_000)
    assert result.ev_per_100 != default_result.ev_per_100

def test_strategy_import_export():
    """Strategy should round-trip through JSON"""
    strategy = BasicStrategy.default_h17_das()
    json_str = strategy.json()
    restored = BasicStrategy.parse_raw(json_str)
    assert strategy == restored
```

---

### Task #36: Implement Play-by-Play Training Mode

**Priority:** 🔴 HIGH (critical for casino readiness)

**📋 Full Specification:** See `TRAINING_MODE_SPEC.md` for comprehensive design document including:
- UI/UX mockups (desktop & mobile)
- Component architecture and file structure
- Game engine implementation details
- State management patterns
- Deck estimation training (Section 16)
- All user-approved design decisions

#### Why This Matters

The simulator currently only runs batch simulations. It doesn't help users **learn** the strategy in a realistic casino environment. A full play-by-play training mode:
- Simulates an actual blackjack table with visual card dealing
- Lets users practice playing hands exactly like they would in a casino
- Provides immediate feedback on basic strategy and deviation mistakes
- Supports playing up to 2 hands simultaneously
- Tracks the count through shoes just like real play
- Allows focused practice on high-count scenarios
- Prepares users for real casino conditions with muscle memory

**Real-world impact:** Users can practice thousands of hands in a realistic environment before risking money. This is the bridge between knowing the strategy and being able to execute it flawlessly under casino pressure. Visual card dealing builds the neural pathways needed for fast, accurate decisions.

**Critical features for casino readiness:**
- Realistic card animations and table layout
- Time pressure options to simulate casino speed
- Count tracking practice integrated with playing decisions
- Scenario generation for high-count shoes and specific situations
- Optional correction mode that stops you when you make mistakes
- Statistics on weak spots and accuracy trends

#### Acceptance Criteria

**Core Gameplay:**
- [ ] Dedicated training tab/page in the UI (separate from simulator)
- [ ] Realistic blackjack table visual layout (dealer area, player area, chip tray)
- [ ] Animated card dealing (cards "move" from deck to table positions)
- [ ] Play 1 or 2 hands simultaneously (user choice)
- [ ] User selects actions via clearly labeled buttons (Hit, Stand, Double, Split, Surrender)
- [ ] Based on the current rules configuration (H17/S17, DAS, surrender, etc.)
- [ ] Proper game flow: initial deal, player decisions, dealer play, payouts
- [ ] Visual bet placement before each hand
- [ ] Running bankroll display (starts with configurable amount)

**Count Tracking Integration:**
- [ ] Running count display (toggleable - can hide for practice)
- [ ] True count calculation and display
- [ ] Deck estimation indicators (cards remaining, estimated decks left)
- [ ] Count maintained across entire shoe
- [ ] New shoe shuffles when penetration reached
- [ ] Visual indicator of cut card position

**Feedback & Correction:**
- [ ] Immediate feedback: correct/incorrect action
- [ ] Shows reasoning for correct action (basic strategy or deviation)
- [ ] Optional "Correction Mode" - stops you and asks if you want to correct mistakes
  - [ ] Pause the hand when wrong action is chosen
  - [ ] Show correct action with explanation
  - [ ] Option to "Take It Back" and choose again, or "Continue Anyway"
  - [ ] Different from auto-advance mode where it just shows feedback and continues
- [ ] Visual indicators (green checkmark for correct, red X for incorrect)
- [ ] Detailed explanation of why the action is correct

**Statistics & Progress:**
- [ ] Running accuracy statistics (overall %)
- [ ] Breakdown by hand type (hard totals, soft totals, pairs)
- [ ] Breakdown by decision type (hit/stand, double, split, surrender, insurance)
- [ ] Deviation accuracy tracking (separate from basic strategy)
- [ ] Session summary with weak spots highlighted
- [ ] Hand history review (last 10-20 hands with decisions)
- [ ] Count accuracy tracking (if count display is hidden, periodic count checks)

**Practice Modes:**
- [ ] **Free Play Mode** - Continuous play through shoes, just like a casino
- [ ] **Basic Strategy Only** - No deviations, just practice perfect basic strategy
- [ ] **Deviations Mode** - Includes playing deviations based on true count
- [ ] **High Count Practice** - Pre-generated shoes with high counts (TC +3 to +6)
- [ ] **Specific Scenario Practice** - Focus on particular hands (16v10, 12v2-3, soft 18, etc.)
- [ ] **Focus Mode** - Repeats hands you got wrong until mastered
- [ ] **Timed Practice** - Adds time pressure to simulate casino speed

**Scenario Generation (Advanced):**
- [ ] Pre-generate multiple shoes and play them out (backend simulation)
- [ ] Identify high-count situations and bookmark them
- [ ] Let user "jump into" specific scenarios:
  - [ ] High count (+4 to +6) for deviation practice
  - [ ] Difficult basic strategy spots (stiff hands vs dealer 7-A)
  - [ ] Surrender situations
  - [ ] Pair splitting edge cases
  - [ ] Insurance decisions at high counts
- [ ] Filter scenarios by true count range
- [ ] Shuffle scenarios to avoid memorization

**UI/UX Features:**
- [ ] Card graphics with suits and ranks clearly visible
- [ ] Smooth animations (card flip, slide, fade)
- [ ] Responsive button layout (disabled states when action not allowed)
- [ ] Keyboard shortcuts (H, S, D, P, R for actions)
- [ ] Mobile-friendly layout option
- [ ] Settings panel:
  - [ ] Animation speed control
  - [ ] Number of hands (1 or 2)
  - [ ] Show/hide count
  - [ ] Correction mode on/off
  - [ ] Sound effects on/off
  - [ ] Starting bankroll
  - [ ] Auto-advance delay after feedback

**Future Enhancements (not MVP):**
- [ ] Multiple players at table (NPCs playing other spots)
- [ ] Table heat simulation (dealer, pit boss reactions to big bets)
- [ ] Camouflage play suggestions
- [ ] Voice commands for actions (accessibility)
- [ ] VR mode for full immersion

#### Implementation Steps

This is a complex, multi-phase implementation. Build it incrementally in these phases:

**Phase 1: Core Game Engine & State Management**

New file `frontend/src/components/training/TrainingGameEngine.ts`:

This handles the actual blackjack game logic - dealing, hitting, standing, dealer play, payouts, etc.

```tsx
// Core game state
interface GameState {
  // Shoe state
  shoe: Card[];
  cutCard: number;
  pointer: number;
  runningCount: number;
  shoeNumber: number;

  // Current round state
  phase: "betting" | "dealing" | "player_action" | "dealer_action" | "payout" | "complete";
  playerHands: Hand[];  // Support 1-2 hands
  dealerHand: Hand;
  activeHandIndex: number;

  // Betting & bankroll
  bankroll: number;
  currentBet: number[];  // Bet for each hand
  suggestedBet: number;  // Based on count and bet ramp

  // Configuration
  rules: Rules;
  countingSystem: CountingSystem;
  deviations: Deviation[];
  betRamp: BetRamp;
  settings: TrainingSettings;

  // Feedback & correction
  lastDecision: Decision | null;
  correctionPending: boolean;

  // Statistics
  stats: SessionStats;
}

interface Hand {
  cards: Card[];
  bet: number;
  status: "active" | "stand" | "busted" | "blackjack" | "surrender";
  isSplit: boolean;
  isSplitAces: boolean;
  canDouble: boolean;
  canSplit: boolean;
  canSurrender: boolean;
  profit: number;
}

interface Card {
  rank: string;  // "2"-"9", "T", "J", "Q", "K", "A"
  suit: string;  // "♠", "♥", "♦", "♣"
  id: string;    // Unique ID for animation tracking
}

interface Decision {
  action: "H" | "S" | "D" | "P" | "R" | "I";  // Hit, Stand, Double, sPlit, suRrender, Insurance
  wasCorrect: boolean;
  correctAction: string;
  explanation: string;
  handKey: string;
  isDeviation: boolean;
  trueCount: number;
  timestamp: number;
}

interface TrainingSettings {
  numHands: 1 | 2;
  practiceMode: "free_play" | "basic_only" | "deviations" | "high_count" | "specific_scenario";
  showCount: boolean;
  correctionMode: boolean;
  animationSpeed: "slow" | "normal" | "fast" | "instant";
  soundEnabled: boolean;
  autoAdvanceDelay: number;  // ms
  specificScenario?: ScenarioFilter;
}

interface ScenarioFilter {
  tcRange?: [number, number];
  handTypes?: ("hard" | "soft" | "pair")[];
  dealerUpcards?: string[];
  playerTotals?: number[];
}

interface SessionStats {
  handsPlayed: number;
  decisionsCorrect: number;
  decisionsTotal: number;
  byHandType: Record<string, { correct: number; total: number }>;
  byAction: Record<string, { correct: number; total: number }>;
  basicStrategyAccuracy: number;
  deviationAccuracy: number;
  countAccuracyChecks: Array<{ actual: number; user: number; error: number }>;
  profitLoss: number;
  weakSpots: Array<{ hand: string; accuracy: number; count: number }>;
}
```

**Phase 2: Game Engine Implementation**

Implement core game functions:

```tsx
class TrainingGameEngine {
  private state: GameState;
  private rng: typeof Math.random;

  constructor(config: { rules: Rules; countingSystem: CountingSystem; deviations: Deviation[]; betRamp: BetRamp; settings: TrainingSettings }) {
    this.state = this.initializeState(config);
    this.rng = Math.random;  // Can be seeded for testing
  }

  // Shoe management
  buildShoe(): Card[] {
    const cards: Card[] = [];
    const suits = ["♠", "♥", "♦", "♣"];
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

    for (let d = 0; d < this.state.rules.decks; d++) {
      for (const rank of ranks) {
        for (const suit of suits) {
          cards.push({ rank, suit, id: `${d}-${rank}${suit}` });
        }
      }
    }

    return this.shuffle(cards);
  }

  shuffle(cards: Card[]): Card[] {
    // Fisher-Yates shuffle
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Card dealing with count tracking
  drawCard(): Card {
    if (this.state.pointer >= this.state.cutCard) {
      // Reshuffle
      this.state.shoe = this.buildShoe();
      this.state.cutCard = Math.floor(this.state.shoe.length * this.state.rules.penetration);
      this.state.pointer = 0;
      this.state.runningCount = 0;
      this.state.shoeNumber++;
    }

    const card = this.state.shoe[this.state.pointer++];
    this.state.runningCount += this.state.countingSystem.tags[card.rank] || 0;
    return card;
  }

  // Game flow methods
  startNewRound() {
    this.state.phase = "betting";
    this.state.playerHands = [];
    this.state.dealerHand = { cards: [], bet: 0, status: "active", /* ... */ };
    this.state.currentBet = [];

    // Calculate suggested bet based on true count
    const trueCount = this.getTrueCount();
    this.state.suggestedBet = this.calculateBet(trueCount);
  }

  placeBet(handIndex: number, amount: number) {
    this.state.currentBet[handIndex] = amount;

    if (this.state.currentBet.length === this.state.settings.numHands) {
      this.dealInitialCards();
    }
  }

  dealInitialCards() {
    this.state.phase = "dealing";

    // Create hands
    for (let i = 0; i < this.state.settings.numHands; i++) {
      this.state.playerHands.push({
        cards: [],
        bet: this.state.currentBet[i],
        status: "active",
        isSplit: false,
        /* ... */
      });
    }

    // Deal pattern: P1, P2 (if 2 hands), Dealer, P1, P2, Dealer
    for (let round = 0; round < 2; round++) {
      for (const hand of this.state.playerHands) {
        hand.cards.push(this.drawCard());
      }
      this.state.dealerHand.cards.push(this.drawCard());
    }

    // Check for dealer peek (if upcard is A or T and rules.dealer_peeks)
    if (this.state.rules.dealer_peeks && this.isDealerPeekCard(this.state.dealerHand.cards[0])) {
      if (this.isBlackjack(this.state.dealerHand.cards)) {
        this.resolveDealerBlackjack();
        return;
      }
    }

    // Check for player blackjacks
    for (const hand of this.state.playerHands) {
      if (this.isBlackjack(hand.cards)) {
        hand.status = "blackjack";
      }
    }

    this.state.phase = "player_action";
    this.state.activeHandIndex = 0;
  }

  // Player actions
  hit() {
    const hand = this.state.playerHands[this.state.activeHandIndex];
    hand.cards.push(this.drawCard());

    if (this.handValue(hand.cards).total > 21) {
      hand.status = "busted";
      this.moveToNextHand();
    }
  }

  stand() {
    this.state.playerHands[this.state.activeHandIndex].status = "stand";
    this.moveToNextHand();
  }

  double() {
    const hand = this.state.playerHands[this.state.activeHandIndex];
    hand.bet *= 2;
    hand.cards.push(this.drawCard());

    if (this.handValue(hand.cards).total > 21) {
      hand.status = "busted";
    } else {
      hand.status = "stand";
    }

    this.moveToNextHand();
  }

  split() {
    const hand = this.state.playerHands[this.state.activeHandIndex];
    const card1 = hand.cards[0];
    const card2 = hand.cards[1];

    // Create new hand
    const newHand: Hand = {
      cards: [card2],
      bet: hand.bet,
      status: "active",
      isSplit: true,
      /* ... */
    };

    hand.cards = [card1];
    hand.isSplit = true;

    // Insert new hand after current
    this.state.playerHands.splice(this.state.activeHandIndex + 1, 0, newHand);

    // Deal second card to each
    hand.cards.push(this.drawCard());
    newHand.cards.push(this.drawCard());

    // Handle split aces (auto-stand if rules.hit_split_aces === false)
    if (card1.rank === "A" && !this.state.rules.hit_split_aces) {
      hand.status = "stand";
      newHand.status = "stand";
      this.state.activeHandIndex++;
      this.moveToNextHand();
    }
  }

  surrender() {
    const hand = this.state.playerHands[this.state.activeHandIndex];
    hand.status = "surrender";
    hand.profit = -hand.bet / 2;
    this.moveToNextHand();
  }

  // Decision validation
  validateAction(action: string): { valid: boolean; correct: boolean; explanation: string } {
    const hand = this.state.playerHands[this.state.activeHandIndex];
    const dealerUpcard = this.state.dealerHand.cards[0];
    const trueCount = this.getTrueCount();

    const correctAction = this.getCorrectAction(hand, dealerUpcard, trueCount);
    const correct = action === correctAction.action;

    return {
      valid: this.isActionAllowed(action, hand),
      correct,
      explanation: correctAction.explanation
    };
  }

  getCorrectAction(hand: Hand, dealerUpcard: Card, trueCount: number): { action: string; explanation: string; isDeviation: boolean } {
    // Check for applicable deviation first
    const handKey = this.getHandKey(hand.cards, dealerUpcard.rank);
    const deviation = this.findApplicableDeviation(handKey, trueCount);

    if (deviation && this.state.settings.practiceMode !== "basic_only") {
      return {
        action: deviation.action,
        explanation: `DEVIATION: ${deviation.hand_key} at TC ${deviation.tc_floor}+. ${this.getDeviationExplanation(deviation)}`,
        isDeviation: true
      };
    }

    // Fall back to basic strategy
    const action = this.getBasicStrategyAction(hand.cards, dealerUpcard.rank);
    return {
      action,
      explanation: this.getBasicStrategyExplanation(hand.cards, dealerUpcard.rank, action),
      isDeviation: false
    };
  }

  // Dealer play
  playDealerHand() {
    this.state.phase = "dealer_action";

    // Flip hole card (for animation)
    // ...

    while (true) {
      const { total, soft } = this.handValue(this.state.dealerHand.cards);

      // H17 vs S17
      if (total > 17 || (total === 17 && (!soft || !this.state.rules.hit_soft_17))) {
        break;
      }

      this.state.dealerHand.cards.push(this.drawCard());
    }

    this.resolvePayout();
  }

  // Payout resolution
  resolvePayout() {
    this.state.phase = "payout";
    const dealerValue = this.handValue(this.state.dealerHand.cards).total;
    const dealerBusted = dealerValue > 21;

    for (const hand of this.state.playerHands) {
      if (hand.status === "busted") {
        hand.profit = -hand.bet;
      } else if (hand.status === "surrender") {
        // Already set
      } else if (hand.status === "blackjack") {
        if (this.isBlackjack(this.state.dealerHand.cards)) {
          hand.profit = 0;  // Push
        } else {
          hand.profit = hand.bet * this.state.rules.blackjack_payout;
        }
      } else {
        const playerValue = this.handValue(hand.cards).total;

        if (dealerBusted || playerValue > dealerValue) {
          hand.profit = hand.bet;
        } else if (playerValue === dealerValue) {
          hand.profit = 0;  // Push
        } else {
          hand.profit = -hand.bet;
        }
      }

      this.state.bankroll += hand.profit;
    }

    this.updateStats();
  }

  // Helper methods
  getTrueCount(): number {
    const cardsRemaining = this.state.shoe.length - this.state.pointer;
    const decksRemaining = Math.max(cardsRemaining / 52, 0.25);
    return this.state.runningCount / decksRemaining;
  }

  calculateBet(trueCount: number): number {
    const steps = this.state.betRamp.steps;
    let units = steps[0].units;

    for (const step of steps) {
      if (Math.floor(trueCount) >= step.tc_floor) {
        units = step.units;
      }
    }

    return units * this.state.rules.unit_size;  // Assume unit_size in settings
  }

  // ... more helper methods
}
```

**Phase 3: Visual Components & Card Animations**

New file `frontend/src/components/training/TrainingTable.tsx`:

```tsx
export function TrainingTable() {
  const engine = useRef(new TrainingGameEngine(config));
  const [gameState, setGameState] = useState<GameState>(engine.current.getState());
  const [animatingCards, setAnimatingCards] = useState<AnimatedCard[]>([]);

  const handlePlayerAction = (action: string) => {
    // Validate action
    const validation = engine.current.validateAction(action);

    if (!validation.valid) {
      // Show error message
      return;
    }

    // Record decision
    const decision: Decision = {
      action,
      wasCorrect: validation.correct,
      correctAction: validation.correctAction,
      explanation: validation.explanation,
      /* ... */
    };

    // If correction mode and incorrect, pause for user input
    if (!validation.correct && gameState.settings.correctionMode) {
      setGameState({ ...gameState, correctionPending: true, lastDecision: decision });
      return;
    }

    // Execute action
    engine.current.executeAction(action);

    // Update state with animations
    const newState = engine.current.getState();
    setGameState(newState);

    // Trigger card animations if needed
    if (action === "H" || action === "D") {
      animateCardDeal(newState.playerHands[newState.activeHandIndex].cards);
    }
  };

  const handleCorrectionChoice = (takeBack: boolean) => {
    if (takeBack) {
      // Reset to before wrong action
      setGameState({ ...gameState, correctionPending: false, lastDecision: null });
    } else {
      // Continue anyway (for learning purposes)
      const action = gameState.lastDecision!.action;
      engine.current.executeAction(action);
      setGameState({ ...engine.current.getState(), correctionPending: false });
    }
  };

  return (
    <div className="training-table">
      {/* Header with stats */}
      <div className="training-header">
        <div className="bankroll">
          Bankroll: ${gameState.bankroll.toFixed(2)}
        </div>
        <div className="session-stats">
          Accuracy: {((gameState.stats.decisionsCorrect / gameState.stats.decisionsTotal) * 100 || 0).toFixed(1)}%
          ({gameState.stats.decisionsCorrect}/{gameState.stats.decisionsTotal})
        </div>
        <div className="shoe-info">
          Shoe {gameState.shoeNumber} | Cards Remaining: {gameState.shoe.length - gameState.pointer}
        </div>
      </div>

      {/* Count display (toggleable) */}
      {gameState.settings.showCount && (
        <div className="count-display">
          <span className="running-count">RC: {gameState.runningCount >= 0 ? '+' : ''}{gameState.runningCount}</span>
          <span className="true-count">TC: {engine.current.getTrueCount().toFixed(1)}</span>
          <span className="decks-remaining">{((gameState.shoe.length - gameState.pointer) / 52).toFixed(1)} decks left</span>
        </div>
      )}

      {/* Dealer area */}
      <div className="dealer-area">
        <div className="dealer-label">Dealer</div>
        <div className="dealer-cards">
          {gameState.dealerHand.cards.map((card, i) => (
            <AnimatedCard
              key={card.id}
              card={card}
              faceDown={i === 1 && gameState.phase !== "dealer_action" && gameState.phase !== "payout"}
              delay={i * 200}
            />
          ))}
        </div>
        {gameState.phase === "payout" && (
          <div className="dealer-total">
            {engine.current.handValue(gameState.dealerHand.cards).total}
            {engine.current.handValue(gameState.dealerHand.cards).total > 21 && " - BUST"}
          </div>
        )}
      </div>

      {/* Player area (supports 1-2 hands) */}
      <div className="player-area">
        {gameState.playerHands.map((hand, handIndex) => (
          <div
            key={handIndex}
            className={`player-hand ${handIndex === gameState.activeHandIndex ? "active" : ""}`}
          >
            <div className="hand-label">
              {gameState.settings.numHands === 2 ? `Hand ${handIndex + 1}` : "Your Hand"}
              {hand.isSplit && " (Split)"}
            </div>

            <div className="hand-cards">
              {hand.cards.map((card, cardIndex) => (
                <AnimatedCard
                  key={card.id}
                  card={card}
                  delay={cardIndex * 200 + handIndex * 50}
                />
              ))}
            </div>

            <div className="hand-info">
              <span className="hand-total">
                {engine.current.handValue(hand.cards).total}
                {engine.current.handValue(hand.cards).soft && " (soft)"}
              </span>
              <span className="hand-bet">Bet: ${hand.bet.toFixed(2)}</span>
            </div>

            {gameState.phase === "payout" && (
              <div className={`hand-result ${hand.profit > 0 ? "win" : hand.profit < 0 ? "loss" : "push"}`}>
                {hand.status === "blackjack" && "BLACKJACK! "}
                {hand.status === "busted" && "BUST "}
                {hand.profit > 0 ? `+$${hand.profit.toFixed(2)}` : hand.profit < 0 ? `-$${Math.abs(hand.profit).toFixed(2)}` : "PUSH"}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {gameState.phase === "betting" && (
        <div className="betting-controls">
          <div className="suggested-bet">
            Suggested Bet (TC {engine.current.getTrueCount().toFixed(1)}): ${gameState.suggestedBet.toFixed(2)}
          </div>
          <div className="bet-buttons">
            <button onClick={() => placeBet(gameState.suggestedBet)}>Place Suggested Bet</button>
            <button onClick={() => setCustomBetting(true)}>Custom Bet</button>
          </div>
        </div>
      )}

      {gameState.phase === "player_action" && (
        <div className="action-controls">
          <button
            onClick={() => handlePlayerAction("H")}
            className="btn-action btn-hit"
            disabled={!canHit(gameState.playerHands[gameState.activeHandIndex])}
          >
            Hit (H)
          </button>
          <button
            onClick={() => handlePlayerAction("S")}
            className="btn-action btn-stand"
          >
            Stand (S)
          </button>
          <button
            onClick={() => handlePlayerAction("D")}
            className="btn-action btn-double"
            disabled={!canDouble(gameState.playerHands[gameState.activeHandIndex])}
          >
            Double (D)
          </button>
          <button
            onClick={() => handlePlayerAction("P")}
            className="btn-action btn-split"
            disabled={!canSplit(gameState.playerHands[gameState.activeHandIndex])}
          >
            Split (P)
          </button>
          {gameState.rules.surrender && (
            <button
              onClick={() => handlePlayerAction("R")}
              className="btn-action btn-surrender"
              disabled={!canSurrender(gameState.playerHands[gameState.activeHandIndex])}
            >
              Surrender (R)
            </button>
          )}
        </div>
      )}

      {/* Feedback panel */}
      {gameState.lastDecision && !gameState.correctionPending && (
        <div className={`feedback-panel ${gameState.lastDecision.wasCorrect ? "correct" : "incorrect"}`}>
          {gameState.lastDecision.wasCorrect ? (
            <div className="feedback-correct">
              <span className="feedback-icon">✓</span>
              <span>Correct!</span>
              {gameState.lastDecision.isDeviation && <span className="deviation-badge">Deviation</span>}
            </div>
          ) : (
            <div className="feedback-incorrect">
              <span className="feedback-icon">✗</span>
              <span>Incorrect. Correct action: {gameState.lastDecision.correctAction}</span>
              <p className="feedback-explanation">{gameState.lastDecision.explanation}</p>
              {gameState.lastDecision.isDeviation && <span className="deviation-badge">Missed Deviation</span>}
            </div>
          )}
        </div>
      )}

      {/* Correction modal */}
      {gameState.correctionPending && gameState.lastDecision && (
        <div className="correction-modal">
          <div className="correction-content">
            <h3>Incorrect Action</h3>
            <p>You chose: <strong>{gameState.lastDecision.action}</strong></p>
            <p>Correct action: <strong>{gameState.lastDecision.correctAction}</strong></p>
            <p className="correction-explanation">{gameState.lastDecision.explanation}</p>

            <div className="correction-buttons">
              <button onClick={() => handleCorrectionChoice(true)} className="btn-take-back">
                Take It Back
              </button>
              <button onClick={() => handleCorrectionChoice(false)} className="btn-continue">
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings panel (collapsible) */}
      <div className="training-settings">
        {/* Mode selector, show count toggle, etc. */}
      </div>
    </div>
  );
}
```

**Phase 4: Card Animation Component**

New file `frontend/src/components/training/AnimatedCard.tsx`:

```tsx
interface AnimatedCardProps {
  card: Card;
  faceDown?: boolean;
  delay?: number;
  onClick?: () => void;
}

export function AnimatedCard({ card, faceDown = false, delay = 0, onClick }: AnimatedCardProps) {
  const [isDealing, setIsDealing] = useState(true);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    const dealTimer = setTimeout(() => {
      setIsDealing(false);
    }, delay);

    return () => clearTimeout(dealTimer);
  }, [delay]);

  useEffect(() => {
    // Flip animation when faceDown changes from true to false
    if (!faceDown && isDealing === false) {
      setIsFlipping(true);
      setTimeout(() => setIsFlipping(false), 300);
    }
  }, [faceDown]);

  const getSuitColor = (suit: string) => {
    return suit === "♥" || suit === "♦" ? "#d32f2f" : "#000";
  };

  return (
    <div
      className={`card ${isDealing ? "dealing" : ""} ${isFlipping ? "flipping" : ""} ${faceDown ? "face-down" : ""}`}
      onClick={onClick}
      style={{
        animationDelay: `${delay}ms`
      }}
    >
      {faceDown ? (
        <div className="card-back">
          {/* Card back pattern */}
          <div className="card-back-pattern"></div>
        </div>
      ) : (
        <div className="card-front">
          <div className="card-rank" style={{ color: getSuitColor(card.suit) }}>
            {card.rank}
          </div>
          <div className="card-suit" style={{ color: getSuitColor(card.suit) }}>
            {card.suit}
          </div>
          <div className="card-center-suit" style={{ color: getSuitColor(card.suit) }}>
            {card.suit}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Phase 5: Scenario Generation (Advanced Feature)**

New file `frontend/src/components/training/ScenarioGenerator.ts`:

```tsx
// Pre-generate interesting scenarios for practice
class ScenarioGenerator {
  generateHighCountScenarios(count: number = 100): Scenario[] {
    const scenarios: Scenario[] = [];

    for (let i = 0; i < count; i++) {
      const scenario = this.generateSingleHighCountScenario();
      scenarios.push(scenario);
    }

    return scenarios;
  }

  generateSingleHighCountScenario(): Scenario {
    // Build shoe with artificially high count
    const shoe = this.buildBiasedShoe(3, 6);  // TC range +3 to +6

    // Play through until we hit an interesting decision point
    // (e.g., 16v10, 12v2, insurance opportunity, etc.)

    return {
      shoe,
      position: /* ... */,
      runningCount: /* ... */,
      dealerUpcard: /* ... */,
      playerCards: /* ... */,
      correctAction: /* ... */,
      /* ... */
    };
  }

  buildBiasedShoe(tcMin: number, tcMax: number): Card[] {
    // Remove low cards to create high count
    // This is tricky - need to maintain realistic ratios

    const targetTC = (tcMin + tcMax) / 2;
    const decks = 6;

    // Normal shoe
    let shoe = this.buildNormalShoe(decks);

    // Remove cards to achieve target TC
    const cardsPerDeck = 52;
    const totalCards = decks * cardsPerDeck;
    const targetRC = targetTC * (totalCards / cardsPerDeck);

    // Remove low cards (2-6) to increase count
    const lowCards = shoe.filter(c => ["2", "3", "4", "5", "6"].includes(c.rank));
    const removeCount = Math.floor(Math.abs(targetRC) / 1);  // Each low card is +1

    for (let i = 0; i < removeCount && lowCards.length > 0; i++) {
      const removeIndex = Math.floor(Math.random() * lowCards.length);
      const cardToRemove = lowCards[removeIndex];
      const shoeIndex = shoe.indexOf(cardToRemove);
      shoe.splice(shoeIndex, 1);
      lowCards.splice(removeIndex, 1);
    }

    return this.shuffle(shoe);
  }

  filterScenariosByHand(scenarios: Scenario[], handType: string): Scenario[] {
    return scenarios.filter(s => {
      const { total, soft } = this.handValue(s.playerCards);

      if (handType === "hard_16") {
        return total === 16 && !soft;
      } else if (handType === "hard_12-15") {
        return total >= 12 && total <= 15 && !soft;
      } else if (handType === "soft_totals") {
        return soft;
      } else if (handType === "pairs") {
        return s.playerCards.length === 2 && s.playerCards[0].rank === s.playerCards[1].rank;
      }
      // ... more filters
    });
  }
}
```

**Phase 6: Statistics & Progress Tracking**

```tsx
// Track detailed statistics
class SessionTracker {
  private stats: SessionStats;

  recordDecision(decision: Decision) {
    this.stats.decisionsTotal++;
    if (decision.wasCorrect) {
      this.stats.decisionsCorrect++;
    }

    // By hand type
    const handType = this.getHandType(decision.playerCards);
    if (!this.stats.byHandType[handType]) {
      this.stats.byHandType[handType] = { correct: 0, total: 0 };
    }
    this.stats.byHandType[handType].total++;
    if (decision.wasCorrect) {
      this.stats.byHandType[handType].correct++;
    }

    // By action type
    const actionType = decision.action;
    if (!this.stats.byAction[actionType]) {
      this.stats.byAction[actionType] = { correct: 0, total: 0 };
    }
    this.stats.byAction[actionType].total++;
    if (decision.wasCorrect) {
      this.stats.byAction[actionType].correct++;
    }

    // Track deviations separately
    if (decision.isDeviation) {
      // Deviation-specific stats
    } else {
      // Basic strategy stats
    }

    // Identify weak spots
    if (!decision.wasCorrect) {
      this.addWeakSpot(decision.handKey, decision.trueCount);
    }
  }

  getWeakSpots(): Array<{ hand: string; accuracy: number; count: number }> {
    // Return hands where accuracy < 70%
    const weakSpots: Array<{ hand: string; accuracy: number; count: number }> = [];

    for (const [handType, stats] of Object.entries(this.stats.byHandType)) {
      const accuracy = stats.correct / stats.total;
      if (accuracy < 0.7 && stats.total >= 5) {  // At least 5 instances
        weakSpots.push({
          hand: handType,
          accuracy: accuracy * 100,
          count: stats.total
        });
      }
    }

    return weakSpots.sort((a, b) => a.accuracy - b.accuracy);
  }

  exportSession(): SessionReport {
    return {
      timestamp: new Date(),
      duration: /* ... */,
      stats: this.stats,
      weakSpots: this.getWeakSpots(),
      recommendations: this.generateRecommendations(),
    };
  }

  generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Analyze weak spots and suggest practice
    const weakSpots = this.getWeakSpots();
    if (weakSpots.length > 0) {
      recommendations.push(`Focus on: ${weakSpots[0].hand} (${weakSpots[0].accuracy.toFixed(0)}% accuracy)`);
    }

    // Check deviation accuracy
    if (this.stats.deviationAccuracy < 0.8) {
      recommendations.push("Practice counting deviations at high true counts");
    }

    // ... more analysis

    return recommendations;
  }
}
```

**Phase 7: CSS & Styling**

```css
/* Training table layout */
.training-table {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #1e5128 0%, #2d6a4f 100%);
  border-radius: 20px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.dealer-area, .player-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px;
}

.dealer-cards, .hand-cards {
  display: flex;
  gap: -40px;  /* Overlap cards slightly */
  perspective: 1000px;
}

/* Card animations */
.card {
  width: 100px;
  height: 140px;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.3s ease;
}

.card.dealing {
  animation: deal 0.4s ease-out forwards;
}

@keyframes deal {
  from {
    transform: translateY(-200px) scale(0.5);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

.card.flipping {
  animation: flip 0.6s ease-in-out;
}

@keyframes flip {
  0% { transform: rotateY(0deg); }
  50% { transform: rotateY(90deg); }
  100% { transform: rotateY(0deg); }
}

.card-front, .card-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px;
}

.card-front {
  background: white;
  border: 1px solid #333;
}

.card-back {
  background: linear-gradient(45deg, #1a1a2e 25%, #16213e 25%, #16213e 50%, #1a1a2e 50%, #1a1a2e 75%, #16213e 75%);
  background-size: 20px 20px;
  transform: rotateY(180deg);
}

.card-rank {
  font-size: 24px;
  font-weight: bold;
}

.card-suit {
  font-size: 20px;
}

.card-center-suit {
  font-size: 48px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.3;
}

/* Action buttons */
.action-controls {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin: 30px 0;
}

.btn-action {
  padding: 15px 30px;
  font-size: 18px;
  font-weight: bold;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}

.btn-action:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
}

.btn-action:active:not(:disabled) {
  transform: translateY(0);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-hit { background: #4ecdc4; }
.btn-stand { background: #95a5a6; }
.btn-double { background: #f39c12; }
.btn-split { background: #9b59b6; }
.btn-surrender { background: #e74c3c; }

/* Feedback panel */
.feedback-panel {
  margin: 20px auto;
  max-width: 600px;
  padding: 20px;
  border-radius: 10px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.feedback-panel.correct {
  background: #27ae60;
  color: white;
}

.feedback-panel.incorrect {
  background: #e74c3c;
  color: white;
}

.feedback-icon {
  font-size: 32px;
  margin-right: 10px;
}

.deviation-badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  margin-left: 10px;
}

/* Correction modal */
.correction-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s;
}

.correction-content {
  background: white;
  padding: 40px;
  border-radius: 20px;
  max-width: 500px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.correction-buttons {
  display: flex;
  gap: 15px;
  margin-top: 30px;
}

.btn-take-back {
  flex: 1;
  padding: 12px 24px;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

.btn-continue {
  flex: 1;
  padding: 12px 24px;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

/* Count display */
.count-display {
  background: rgba(0, 0, 0, 0.6);
  padding: 15px 30px;
  border-radius: 10px;
  display: flex;
  gap: 30px;
  justify-content: center;
  margin: 20px 0;
  font-family: monospace;
  font-size: 18px;
  color: #fff;
}

.running-count, .true-count {
  font-weight: bold;
}

.true-count {
  color: #4ecdc4;
}
```

---

### Task #37: Add Counting Practice Module

**Priority:** 🔴 HIGH (essential for count accuracy)

#### Why This Matters

Card counting accuracy is the foundation of advantage play. A player who miscounts by even 1-2 points will:
- Make wrong bet decisions (sizing bets incorrectly)
- Miss deviation opportunities (not recognizing +3 vs +2 situations)
- Wong out at wrong times (leaving profitable shoes or staying in negative ones)
- Lose their edge entirely

**Real-world data**: Studies show most card counters lose money not because they don't know the system, but because they miscount under casino conditions (distractions, speed, fatigue).

The counting practice module addresses this by:
- Building muscle memory for card value recognition
- Increasing counting speed to casino-level (0.3s per card)
- Identifying problem areas (forgetting 7 is neutral, missing face cards)
- Practicing with realistic casino distractions
- Training true count conversion speed
- Integrating count practice directly with play decisions

**Integration with Training Mode**: The counting practice should be part of the same training tab/page as the play-by-play mode. Users should be able to:
1. Practice pure counting (no decisions)
2. Practice counting while playing hands (realistic!)
3. Get quizzed on the count during game play

#### Acceptance Criteria

**Standalone Counting Drills:**
- [ ] Cards flash one at a time at configurable speed
- [ ] User tracks running count mentally (not displayed until checkpoint)
- [ ] Periodic checkpoints ask for current running count
- [ ] True count conversion quizzes (given RC and cards remaining, calculate TC)
- [ ] End-of-deck score with accuracy metrics
- [ ] Multiple counting system support (Hi-Lo, KO, Hi-Opt I, Hi-Opt II, etc.)
- [ ] Speed levels: Learning (2s), Slow (1.5s), Medium (1s), Fast (0.5s), Casino (0.3s), Expert (0.2s)
- [ ] Multi-card mode (2-3 cards at once, simulating real dealer dealing)
- [ ] Countdown mode (single deck from start to finish without checkpoints - final answer)
- [ ] Deck estimation practice with rendered discard tray (see Section 16 of TRAINING_MODE_SPEC.md)
  - Rendered 3D/2D discard tray (not photos) for infinite scenarios
  - Multiple tray templates (standard slanted, vertical holder, deep tray)
  - Camera angle variance to prevent memorization
  - Difficulty progression: whole → half → quarter decks
  - Standalone drill mode + integrated with Free Play
  - User's deck estimate used for TC calculation (makes errors hurt)
  - TC combo drill: estimate decks → calculate true count

**Integrated Counting (with Gameplay):**
- [ ] Count while playing hands in training mode
- [ ] Random count checks during gameplay ("What's the running count?")
- [ ] True count displayed after each round (in training mode) for self-verification
- [ ] Statistics on counting accuracy during actual play
- [ ] Option to hide count and rely 100% on mental tracking

**Advanced Features:**
- [ ] Speed ramp mode (starts slow, gradually increases to casino speed)
- [ ] High-count practice (decks biased toward high counts for deviation practice)
- [ ] Error analysis (which cards you consistently miscount)
- [ ] Multi-deck practice (1, 2, 4, 6, 8 decks)
- [ ] Distraction mode (background sounds, popup messages to simulate casino)
- [ ] Session statistics and progress tracking over time
- [ ] Audio cues option (cards announced for accessibility)
- [ ] Leaderboard / personal records for speed and accuracy

**UI Integration:**
- [ ] Integrated into training tab/page (not separate page)
- [ ] Switchable modes: "Pure Counting Drill" vs "Count While Playing"
- [ ] Quick-start presets for different skill levels
- [ ] Progress tracking dashboard

#### Implementation Steps

**Step 1: Create counting practice state**

New file `frontend/src/components/CountingPractice.tsx`:

```tsx
interface CountingPracticeState {
  mode: "single" | "pairs" | "triplets";
  speed: number;  // milliseconds per card/group
  countingSystem: CountingSystem;
  deck: string[];
  position: number;
  runningCount: number;  // Actual count
  checkpoints: Checkpoint[];
  currentCheckpoint: number | null;
  userAnswers: { checkpoint: number; answer: number; actual: number }[];
  isPaused: boolean;
  isComplete: boolean;
}

interface Checkpoint {
  position: number;  // After which card to check
  actualCount: number;
}

const SPEED_PRESETS = [
  { label: "Learning (2s)", value: 2000 },
  { label: "Slow (1.5s)", value: 1500 },
  { label: "Medium (1s)", value: 1000 },
  { label: "Fast (0.5s)", value: 500 },
  { label: "Casino (0.3s)", value: 300 },
];
```

**Step 2: Implement the practice logic**

```tsx
function generatePracticeDeck(decks: number = 1): string[] {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const deck: string[] = [];

  for (let d = 0; d < decks; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push(rank);  // Just rank, suit is visual only
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function generateCheckpoints(deckLength: number, count: number = 5): number[] {
  // Place checkpoints at even intervals, avoiding first 10 and last 5 cards
  const checkpoints: number[] = [];
  const start = 10;
  const end = deckLength - 5;
  const interval = Math.floor((end - start) / count);

  for (let i = 0; i < count; i++) {
    checkpoints.push(start + i * interval + Math.floor(Math.random() * (interval / 2)));
  }

  return checkpoints;
}

export function CountingPractice() {
  const [state, setState] = useState<CountingPracticeState>(() => ({
    mode: "single",
    speed: 1000,
    countingSystem: HI_LO_SYSTEM,
    deck: [],
    position: 0,
    runningCount: 0,
    checkpoints: [],
    currentCheckpoint: null,
    userAnswers: [],
    isPaused: true,
    isComplete: false,
  }));

  const startPractice = () => {
    const deck = generatePracticeDeck(1);
    const checkpointPositions = generateCheckpoints(deck.length);

    // Pre-calculate actual counts at each checkpoint
    let count = 0;
    const checkpoints: Checkpoint[] = [];

    for (let i = 0; i < deck.length; i++) {
      count += state.countingSystem.tags[deck[i]] || 0;
      if (checkpointPositions.includes(i)) {
        checkpoints.push({ position: i, actualCount: count });
      }
    }

    setState(s => ({
      ...s,
      deck,
      checkpoints,
      position: 0,
      runningCount: 0,
      currentCheckpoint: null,
      userAnswers: [],
      isPaused: false,
      isComplete: false,
    }));
  };

  // Card advancement effect
  useEffect(() => {
    if (state.isPaused || state.isComplete || state.currentCheckpoint !== null) {
      return;
    }

    const timer = setTimeout(() => {
      const nextPosition = state.position + (state.mode === "single" ? 1 : state.mode === "pairs" ? 2 : 3);

      // Calculate new running count
      let newCount = state.runningCount;
      for (let i = state.position; i < Math.min(nextPosition, state.deck.length); i++) {
        newCount += state.countingSystem.tags[state.deck[i]] || 0;
      }

      // Check if we hit a checkpoint
      const checkpoint = state.checkpoints.find(
        cp => cp.position >= state.position && cp.position < nextPosition
      );

      if (checkpoint) {
        setState(s => ({ ...s, currentCheckpoint: checkpoint.position, runningCount: newCount }));
      } else if (nextPosition >= state.deck.length) {
        setState(s => ({ ...s, isComplete: true, runningCount: newCount }));
      } else {
        setState(s => ({ ...s, position: nextPosition, runningCount: newCount }));
      }
    }, state.speed);

    return () => clearTimeout(timer);
  }, [state.position, state.isPaused, state.isComplete, state.currentCheckpoint, state.speed]);

  const handleCheckpointAnswer = (answer: number) => {
    const checkpoint = state.checkpoints.find(cp => cp.position === state.currentCheckpoint);
    if (!checkpoint) return;

    setState(s => ({
      ...s,
      userAnswers: [...s.userAnswers, {
        checkpoint: checkpoint.position,
        answer,
        actual: checkpoint.actualCount,
      }],
      currentCheckpoint: null,
      position: checkpoint.position + 1,
    }));
  };

  const accuracy = state.userAnswers.length > 0
    ? state.userAnswers.filter(a => a.answer === a.actual).length / state.userAnswers.length
    : 0;

  return (
    <div className="counting-practice">
      <div className="practice-header">
        <h2>Counting Practice</h2>
        <div className="practice-controls">
          <select
            value={state.speed}
            onChange={e => setState(s => ({ ...s, speed: Number(e.target.value) }))}
            disabled={!state.isPaused}
          >
            {SPEED_PRESETS.map(preset => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </select>

          <select
            value={state.mode}
            onChange={e => setState(s => ({ ...s, mode: e.target.value as any }))}
            disabled={!state.isPaused}
          >
            <option value="single">Single Cards</option>
            <option value="pairs">Pairs</option>
            <option value="triplets">Triplets</option>
          </select>
        </div>
      </div>

      {state.isPaused && state.position === 0 && (
        <div className="practice-start">
          <p>Track the running count as cards are shown.</p>
          <p>You'll be asked the count at random checkpoints.</p>
          <button onClick={startPractice}>Start Practice</button>
        </div>
      )}

      {!state.isPaused && !state.isComplete && (
        <div className="practice-area">
          <div className="cards-remaining">
            {state.deck.length - state.position} cards remaining
          </div>

          <div className="current-cards">
            {state.mode === "single" && (
              <BigCard value={state.deck[state.position]} />
            )}
            {state.mode === "pairs" && (
              <>
                <BigCard value={state.deck[state.position]} />
                <BigCard value={state.deck[state.position + 1]} />
              </>
            )}
            {state.mode === "triplets" && (
              <>
                <BigCard value={state.deck[state.position]} />
                <BigCard value={state.deck[state.position + 1]} />
                <BigCard value={state.deck[state.position + 2]} />
              </>
            )}
          </div>

          {state.currentCheckpoint !== null && (
            <div className="checkpoint-modal">
              <h3>Count Check!</h3>
              <p>What is the running count?</p>
              <input
                type="number"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    handleCheckpointAnswer(Number((e.target as HTMLInputElement).value));
                  }
                }}
              />
              <button onClick={() => {
                const input = document.querySelector(".checkpoint-modal input") as HTMLInputElement;
                handleCheckpointAnswer(Number(input.value));
              }}>
                Submit
              </button>
            </div>
          )}

          <button
            className="pause-button"
            onClick={() => setState(s => ({ ...s, isPaused: !s.isPaused }))}
          >
            {state.isPaused ? "Resume" : "Pause"}
          </button>
        </div>
      )}

      {state.isComplete && (
        <div className="practice-results">
          <h3>Practice Complete!</h3>

          <div className="final-count">
            <p>Final Running Count: <strong>{state.runningCount}</strong></p>
            <p>(Should be 0 for a balanced count like Hi-Lo)</p>
          </div>

          <div className="checkpoint-results">
            <h4>Checkpoint Results</h4>
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Your Answer</th>
                  <th>Actual</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {state.userAnswers.map((answer, i) => (
                  <tr key={i} className={answer.answer === answer.actual ? "correct" : "incorrect"}>
                    <td>Card {answer.checkpoint + 1}</td>
                    <td>{answer.answer}</td>
                    <td>{answer.actual}</td>
                    <td>{answer.answer === answer.actual ? "✓" : `Off by ${answer.answer - answer.actual}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="accuracy-summary">
            <p>Overall Accuracy: <strong>{(accuracy * 100).toFixed(0)}%</strong></p>
            <p>({state.userAnswers.filter(a => a.answer === a.actual).length} / {state.userAnswers.length} correct)</p>
          </div>

          <button onClick={startPractice}>Practice Again</button>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Add Big Card component for visual appeal**

```tsx
function BigCard({ value }: { value: string }) {
  const getTagValue = (v: string) => {
    if (["2", "3", "4", "5", "6"].includes(v)) return "+1";
    if (["7", "8", "9"].includes(v)) return "0";
    return "-1";
  };

  const getColor = (v: string) => {
    if (["2", "3", "4", "5", "6"].includes(v)) return "#27ae60";  // Green for +1
    if (["7", "8", "9"].includes(v)) return "#7f8c8d";  // Gray for 0
    return "#e74c3c";  // Red for -1
  };

  const displayValue = value === "T" ? "10" : value;

  return (
    <div className="big-card" style={{ borderColor: getColor(value) }}>
      <span className="card-value">{displayValue}</span>
      <span className="card-tag" style={{ color: getColor(value) }}>
        {getTagValue(value)}
      </span>
    </div>
  );
}
```

**Step 4: CSS for counting practice**

```css
.counting-practice {
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
}

.big-card {
  width: 120px;
  height: 180px;
  background: white;
  border: 4px solid;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.card-value {
  font-size: 64px;
  font-weight: bold;
}

.card-tag {
  font-size: 24px;
  font-weight: bold;
  margin-top: 10px;
}

.current-cards {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin: 40px 0;
}

.checkpoint-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-card);
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  text-align: center;
  z-index: 100;
}

.checkpoint-modal input {
  width: 100px;
  font-size: 24px;
  text-align: center;
  padding: 10px;
  margin: 15px 0;
}

.practice-results .correct { background: rgba(39, 174, 96, 0.2); }
.practice-results .incorrect { background: rgba(231, 76, 60, 0.2); }
```

---

## Summary of All Tasks

### 🔴 Critical Priority (Do First)

| # | Task | Category |
|---|------|----------|
| 11 | Fix RoR calculation for variable betting | Statistics |
| 40 | Add confidence intervals to all metrics | Statistics |
| 8 | Implement proper insurance EV tracking | Statistics |
| 5 | Add custom basic strategy editor | Strategy |
| 12 | Refactor App.tsx into components | Architecture |
| 24 | Implement multi-processing for faster simulations | Performance |
| 30 | Add comprehensive test suite | Quality |
| 1 | Add more counting systems | Features |

---

### Task #24: Implement Multi-Processing for Faster Simulations

**Priority:** 🔴 CRITICAL (Performance)

**Status:** Not started

#### Why This Matters

The current simulation runs in a single thread. With modern CPUs having 8-16+ cores, simulations are drastically underutilizing available hardware. A 10 million hand simulation that takes 60 seconds could complete in ~8-10 seconds with proper parallelization.

**Current bottleneck:**
- `simulation.py:run_simulation()` is a single monolithic loop (lines 286-550)
- `sim_runner.py` uses ThreadPoolExecutor with only 2 workers (line 12)
- Python's GIL (Global Interpreter Lock) limits true parallelism in threads
- Each simulation is CPU-bound, making it ideal for multi-processing

**Real-world impact:** Users running 10M+ hand simulations for precision analysis wait minutes instead of seconds. This is especially painful when iterating on bet spreads or deviation thresholds.

#### Current Implementation Location

| File | Lines | What's There |
|------|-------|--------------|
| `backend/app/engine/simulation.py` | 286-550 | Main simulation loop (single-threaded) |
| `backend/app/services/sim_runner.py` | 1-55 | ThreadPoolExecutor runner (max_workers=2) |
| `backend/app/api/routes.py` | 15-19 | API endpoint calling runner.start() |

Current architecture:
```
[API Request] → [ThreadPoolExecutor] → [Single run_simulation()] → [Result]
```

Target architecture:
```
[API Request] → [ProcessPoolExecutor] → [N parallel run_simulation_chunk()] → [Aggregate Results]
```

#### Key Design Decisions

**Why Multi-Processing (not Multi-Threading)?**
- Python's GIL prevents true parallelism in threads for CPU-bound work
- `multiprocessing` or `concurrent.futures.ProcessPoolExecutor` bypasses GIL
- Each process gets its own Python interpreter and memory space
- NumPy operations (RNG, shuffling) release GIL, but pure Python loops don't

**Why Split by Hands (not by Shoe)?**
- Each worker simulates N/workers hands independently
- Workers use different RNG seeds (derived from base seed)
- Results are statistically independent and can be combined
- No need to share shoe state between processes

**Result Aggregation Math:**
For combining N independent simulation chunks:
```python
# Combined mean (weighted by hands)
combined_mean = sum(chunk.mean * chunk.hands for chunk in chunks) / total_hands

# Combined variance using parallel variance formula
# Var(combined) = (sum of within-group variance + between-group variance)
combined_var = (
    sum(chunk.hands * (chunk.variance + (chunk.mean - combined_mean)**2) for chunk in chunks)
) / total_hands
```

#### Acceptance Criteria

- [ ] Simulations utilize all available CPU cores
- [ ] 10M hand simulation completes in <15 seconds on 8-core machine
- [ ] Results are statistically identical to single-threaded (same seed = same final stats)
- [ ] Progress callback still works (aggregated across workers)
- [ ] Memory usage stays reasonable (<2GB for 10M hands)
- [ ] Graceful fallback if multiprocessing unavailable
- [ ] Worker count configurable (auto-detect by default)

#### Implementation Steps

**Step 1: Create chunk-based simulation function**

In `simulation.py`, add a lightweight version that returns intermediate stats:

```python
from dataclasses import dataclass
from typing import List
import multiprocessing as mp

@dataclass
class SimulationChunk:
    """Results from a chunk of hands for aggregation"""
    hands: int
    profit_sum: float
    profit_sq_sum: float
    bet_sum: float
    tc_histogram: Dict[int, int]
    tc_histogram_est: Dict[int, int]
    tc_stats: Dict[int, Dict[str, float]]

    @property
    def mean(self) -> float:
        return self.profit_sum / self.hands if self.hands > 0 else 0.0

    @property
    def variance(self) -> float:
        if self.hands == 0:
            return 0.0
        mean = self.mean
        return max(self.profit_sq_sum / self.hands - mean * mean, 0.0)


def run_simulation_chunk(
    request: SimulationRequest,
    chunk_hands: int,
    chunk_seed: int,
) -> SimulationChunk:
    """
    Run a chunk of the simulation independently.
    Used by multiprocessing workers.

    Args:
        request: The simulation request (rules, ramp, deviations)
        chunk_hands: Number of hands for this chunk
        chunk_seed: Unique seed for this chunk's RNG

    Returns:
        SimulationChunk with aggregatable statistics
    """
    # Create independent RNG for this chunk
    rng = np.random.default_rng(chunk_seed)

    # ... (same setup as run_simulation)

    # Run chunk_hands rounds
    while rounds_played < chunk_hands:
        # ... (same logic as main loop)
        pass

    return SimulationChunk(
        hands=rounds_played,
        profit_sum=total_profit,
        profit_sq_sum=total_sq_profit,
        bet_sum=total_initial_bet,
        tc_histogram=tc_histogram,
        tc_histogram_est=tc_histogram_est,
        tc_stats=tc_stats,
    )
```

**Step 2: Create parallel runner function**

```python
def run_simulation_parallel(
    request: SimulationRequest,
    num_workers: Optional[int] = None,
    progress_cb: Optional[Callable[[int, int, float, float, float], None]] = None,
) -> SimulationResult:
    """
    Run simulation using multiple processes for parallelism.

    Args:
        request: Simulation configuration
        num_workers: Number of worker processes (default: CPU count - 1)
        progress_cb: Progress callback (called periodically with aggregated stats)

    Returns:
        Aggregated SimulationResult
    """
    if num_workers is None:
        num_workers = max(1, mp.cpu_count() - 1)

    # Fall back to single-threaded for small simulations
    if request.hands < 100_000 or num_workers == 1:
        return run_simulation(request, progress_cb)

    # Split hands across workers
    base_chunk_size = request.hands // num_workers
    remainder = request.hands % num_workers

    # Prepare chunk arguments
    chunk_args: List[Tuple[SimulationRequest, int, int]] = []
    for i in range(num_workers):
        chunk_hands = base_chunk_size + (1 if i < remainder else 0)
        # Derive unique seed for each chunk
        chunk_seed = request.seed + i * 1_000_000_007  # Large prime offset
        chunk_args.append((request, chunk_hands, chunk_seed))

    # Run chunks in parallel
    chunks: List[SimulationChunk] = []

    with mp.Pool(processes=num_workers) as pool:
        # Use starmap for multiple arguments
        chunks = pool.starmap(run_simulation_chunk, chunk_args)

    # Aggregate results
    return aggregate_chunks(chunks, request)
```

**Step 3: Implement result aggregation**

```python
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
        raise ValueError("No hands simulated across all chunks")

    # Combined mean
    combined_mean = total_profit / total_hands

    # Combined variance using parallel variance formula
    # V_combined = (1/N) * sum(n_i * (V_i + (mean_i - mean_combined)^2))
    combined_variance = 0.0
    for chunk in chunks:
        chunk_mean = chunk.mean
        chunk_var = chunk.variance
        combined_variance += chunk.hands * (chunk_var + (chunk_mean - combined_mean) ** 2)
    combined_variance /= total_hands

    combined_stdev = math.sqrt(combined_variance)

    # Merge histograms
    merged_tc_hist: Dict[int, int] = {}
    merged_tc_hist_est: Dict[int, int] = {}
    merged_tc_stats: Dict[int, Dict[str, float]] = {}

    for chunk in chunks:
        for tc, count in chunk.tc_histogram.items():
            merged_tc_hist[tc] = merged_tc_hist.get(tc, 0) + count
        for tc, count in chunk.tc_histogram_est.items():
            merged_tc_hist_est[tc] = merged_tc_hist_est.get(tc, 0) + count
        for tc, stats in chunk.tc_stats.items():
            if tc not in merged_tc_stats:
                merged_tc_stats[tc] = {"n_total": 0, "n_iba": 0, "n_zero": 0, "profit": 0, "bet": 0}
            for key in stats:
                merged_tc_stats[tc][key] = merged_tc_stats[tc].get(key, 0) + stats[key]

    # Calculate derived metrics
    ev_per_100 = combined_mean * 100
    stdev_per_100 = combined_stdev * 10
    variance_per_hand = combined_variance
    avg_initial_bet = total_bet / total_hands

    di = combined_mean / combined_stdev if combined_stdev > 0 else 0.0
    score = (ev_per_100 ** 2) / (stdev_per_100 ** 2) * 100 if stdev_per_100 > 0 else 0.0
    n0_hands = (stdev_per_100 / ev_per_100) ** 2 * 100 if ev_per_100 != 0 else float("inf")

    # Build TC table from merged stats
    tc_table = build_tc_table(merged_tc_stats, avg_initial_bet)

    # Calculate RoR if bankroll specified
    ror_result = None
    if request.bankroll:
        ror_result = calculate_ror(
            ev_per_hand=combined_mean,
            stdev_per_hand=combined_stdev,
            avg_bet=avg_initial_bet,
            bankroll_units=request.bankroll,
            hands_per_hour=request.hands_per_hour,
        )

    return SimulationResult(
        rounds_played=total_hands,
        ev_per_100=ev_per_100,
        stdev_per_100=stdev_per_100,
        variance_per_hand=variance_per_hand,
        avg_initial_bet=avg_initial_bet,
        di=di,
        score=score,
        n0_hands=n0_hands,
        ror=ror_result.simple_ror if ror_result else None,
        ror_detail=ror_result,
        tc_histogram=merged_tc_hist,
        tc_histogram_est=merged_tc_hist_est,
        tc_table=tc_table,
        debug_log=[],  # Debug log not supported in parallel mode
    )
```

**Step 4: Update sim_runner.py to use parallel execution**

```python
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor, Future
from typing import Dict, Optional

from app.engine.simulation import run_simulation, run_simulation_parallel
from app.models import SimulationRequest, SimulationResult, SimulationStatus


class InMemorySimulationRunner:
    """Simulation runner with multi-processing support."""

    def __init__(self, max_workers: Optional[int] = None) -> None:
        self._max_workers = max_workers or max(1, mp.cpu_count() - 1)
        self._executor = ProcessPoolExecutor(max_workers=self._max_workers)
        self._futures: Dict[str, Future] = {}
        self._progress: Dict[str, SimulationStatus] = {}

    def start(self, sim_id: str, request: SimulationRequest) -> None:
        """Start a simulation using parallel processing."""

        # For small simulations, use single-threaded
        if request.hands < 100_000:
            future = self._executor.submit(run_simulation, request, None)
        else:
            future = self._executor.submit(
                run_simulation_parallel,
                request,
                self._max_workers,
                None,  # Progress callback doesn't work well across processes
            )

        self._futures[sim_id] = future
        self._progress[sim_id] = SimulationStatus(
            status="running",
            progress=0.0,
            hands_done=0,
            hands_total=request.hands,
        )

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
            total = self._progress.get(sim_id, SimulationStatus(
                status="done", progress=1.0, hands_done=0, hands_total=0
            )).hands_total
            return SimulationStatus(
                status="done",
                progress=1.0,
                hands_done=total,
                hands_total=total,
            )
        return self._progress.get(sim_id)
```

**Step 5: Add configuration for worker count**

In `models.py`, add to SimulationRequest:

```python
class SimulationRequest(BaseModel):
    # ... existing fields ...

    # Performance options
    parallel_workers: Optional[int] = None  # None = auto-detect
    disable_parallel: bool = False  # Force single-threaded
```

**Step 6: Handle progress reporting across processes**

Progress reporting with multiprocessing is tricky because callbacks can't easily cross process boundaries. Options:

**Option A: Polling-based progress (Recommended)**
```python
import multiprocessing as mp
from multiprocessing import Queue

def run_chunk_with_progress(
    request: SimulationRequest,
    chunk_hands: int,
    chunk_seed: int,
    progress_queue: Queue,
    chunk_id: int,
) -> SimulationChunk:
    """Worker function that reports progress via queue."""
    # ... simulation logic ...

    # Report progress every N hands
    if rounds_played % 10_000 == 0:
        progress_queue.put({
            "chunk_id": chunk_id,
            "hands_done": rounds_played,
            "profit_sum": total_profit,
        })

    return result


def aggregate_progress(progress_queue: Queue, num_chunks: int) -> Dict:
    """Aggregate progress from all workers."""
    chunk_progress = {}
    while True:
        try:
            update = progress_queue.get_nowait()
            chunk_progress[update["chunk_id"]] = update
        except:
            break

    total_done = sum(p["hands_done"] for p in chunk_progress.values())
    total_profit = sum(p["profit_sum"] for p in chunk_progress.values())
    return {"hands_done": total_done, "profit_sum": total_profit}
```

**Option B: Shared memory counters**
```python
from multiprocessing import Value

# Create shared counters
hands_done = Value('i', 0)  # Shared integer
profit_sum = Value('d', 0.0)  # Shared double

def worker_with_shared_memory(hands_done_counter, ...):
    # Atomically update shared counter
    with hands_done_counter.get_lock():
        hands_done_counter.value += batch_size
```

#### Performance Benchmarks (Expected)

| Hands | Single-threaded | 4 workers | 8 workers | Speedup |
|-------|-----------------|-----------|-----------|---------|
| 100K | 0.6s | 0.5s | 0.5s | ~1x (overhead) |
| 1M | 6s | 2s | 1.5s | ~4x |
| 10M | 60s | 18s | 10s | ~6x |
| 100M | 10min | 3min | 1.5min | ~7x |

*Note: Speedup is sub-linear due to aggregation overhead and memory bandwidth limits.*

#### Edge Cases to Handle

1. **Small simulations (<100K hands):** Skip parallelization, overhead > benefit
2. **Single-core systems:** Gracefully fall back to single-threaded
3. **Memory pressure:** Each worker needs ~100MB for shoe + stats
4. **Deterministic results:** Same base seed should produce same final stats
5. **Debug logging:** Not supported in parallel mode (logs would interleave)
6. **Progress callbacks:** Use queue-based aggregation or disable

#### Test Cases

```python
def test_parallel_matches_sequential():
    """Parallel results should match sequential for same effective work."""
    request = SimulationRequest(hands=1_000_000, seed=42, ...)

    # Run sequential
    seq_result = run_simulation(request)

    # Run parallel with deterministic chunk seeds
    par_result = run_simulation_parallel(request, num_workers=4)

    # Results should be statistically similar (not identical due to different RNG paths)
    # But with same seed derivation, aggregated stats should match
    assert abs(seq_result.ev_per_100 - par_result.ev_per_100) < 0.05
    assert abs(seq_result.stdev_per_100 - par_result.stdev_per_100) < 0.1


def test_parallel_speedup():
    """Parallel should be faster for large simulations."""
    import time
    request = SimulationRequest(hands=5_000_000, seed=42, ...)

    start = time.time()
    run_simulation(request)
    seq_time = time.time() - start

    start = time.time()
    run_simulation_parallel(request, num_workers=4)
    par_time = time.time() - start

    # Should be at least 2x faster with 4 workers
    assert par_time < seq_time / 2


def test_parallel_aggregation_math():
    """Test that variance aggregation is mathematically correct."""
    # Create chunks with known statistics
    chunk1 = SimulationChunk(hands=1000, profit_sum=100, profit_sq_sum=200, ...)
    chunk2 = SimulationChunk(hands=1000, profit_sum=150, profit_sq_sum=350, ...)

    result = aggregate_chunks([chunk1, chunk2], request)

    # Manually calculate expected combined mean and variance
    expected_mean = (100 + 150) / 2000
    # ... verify variance formula
    assert abs(result.mean - expected_mean) < 1e-10
```

#### Alternative: Cython/Numba Optimization (Task #25)

If parallelization alone isn't enough, the hot loop can be JIT-compiled:

```python
from numba import njit

@njit
def simulate_hand_fast(shoe, pointer, running_count, bet, rules_tuple):
    """Numba-compiled hand simulation for ~10-50x speedup."""
    # Pure numeric operations, no Python objects
    ...
```

This can be combined with multiprocessing for multiplicative speedup.

#### Files to Modify

1. **`backend/app/engine/simulation.py`**
   - Add `SimulationChunk` dataclass
   - Add `run_simulation_chunk()` function
   - Add `run_simulation_parallel()` function
   - Add `aggregate_chunks()` function

2. **`backend/app/services/sim_runner.py`**
   - Change from ThreadPoolExecutor to ProcessPoolExecutor
   - Update `start()` to use parallel runner for large sims
   - Handle progress aggregation

3. **`backend/app/models.py`**
   - Add `parallel_workers` and `disable_parallel` to SimulationRequest

4. **`backend/app/api/routes.py`**
   - No changes needed (transparent to API)

5. **`frontend/src/App.tsx`**
   - Optionally add worker count setting in advanced options

### 🟡 Medium Priority

| # | Task | Category |
|---|------|----------|
| 36 | Implement play-by-play training mode | Training |
| 37 | Add counting practice module | Training |
| 38 | Implement deviation quiz mode | Training |
| 2 | Implement side count tracking | Counting |
| 6 | Playing deviations beyond Illustrious 18 | Strategy |
| 35 | Bankroll requirement calculator | Tools |
| 15 | Proper charting library | UI |
| 17 | Tooltips and help text | UX |
| 28 | Input validation with error messages | UX |

### 🟢 Lower Priority (Nice to Have)

| # | Task | Category |
|---|------|----------|
| 3-4, 7, 9-10 | Advanced simulation features | Features |
| 13-14, 16, 18-23 | UI/UX improvements | UI |
| 25-27, 29 | Performance & sync | Infrastructure |
| 31-34 | Game variants & advanced play | Features |
| 39, 41-45 | Rule refinements | Features |
| 46-49 | Documentation & architecture | Quality |

---

## Getting Started

1. **Start with #11 (RoR fix)** - This is a critical accuracy issue
2. **Then #40 (Confidence intervals)** - Users need to understand precision
3. **Then #12 (Refactor App.tsx)** - Makes all future work easier
4. **Add #36/#37 (Training)** - High user value, can be developed in parallel

Each detailed task above includes:
- Specific file locations
- Code snippets to guide implementation
- Test cases for validation
- Acceptance criteria

Check off items as you complete them to track progress.

---

## Implementation Notes

### Simulation Stop Mechanism (Implemented)

The simulator supports graceful cancellation of running simulations with partial result preservation.

#### Architecture

**Backend Components:**

1. **`sim_runner.py` - InMemorySimulationRunner**
   - Uses `threading.Event` flags per simulation for cancellation
   - `stop(sim_id)` method sets the cancellation flag
   - `status()` returns "stopped" for cancelled simulations

2. **`simulation.py` - run_simulation()**
   - Accepts optional `cancel_check` callback
   - Checks for cancellation every `max(target_rounds // 100, 1000)` rounds
   - Returns partial results when cancelled (EV/SD computed from completed hands)
   - Sets `meta["was_cancelled"] = "true"` for cancelled simulations

3. **`routes.py` - Stop Endpoint**
   ```python
   POST /api/simulations/{sim_id}/stop
   ```
   Returns `{"stopped": true}` on success, 404 if not found.

**Frontend Components:**

1. **`client.ts` - stopSimulation()**
   - Calls backend stop endpoint
   - Returns `{stopped: boolean}`

2. **`App.tsx` - handleStop()**
   - Calls backend `stopSimulation()` first
   - Creates partial result from progress data (preserves hands already computed)
   - Handles append mode by merging partial with previous result

3. **Polling Error Handling**
   - Counts consecutive errors (max 5)
   - Stops polling on 404 or too many errors
   - Handles "stopped" status from backend

#### Key Features

- **Partial Result Preservation:** When stopped mid-simulation, all completed hands are preserved
- **Append Mode Support:** Stopping during "Add more hands" correctly merges with base result
- **Backend CPU Release:** Cancellation flag causes simulation loop to break, freeing CPU
- **Graceful Error Handling:** Frontend handles backend unavailability gracefully

#### Files Modified

| File | Purpose |
|------|---------|
| `backend/app/services/sim_runner.py` | Added stop(), cancel flags, stopped status |
| `backend/app/engine/simulation.py` | Added cancel_check callback, periodic check |
| `backend/app/api/routes.py` | Added POST /stop endpoint |
| `frontend/src/api/client.ts` | Added stopSimulation() function |
| `frontend/src/App.tsx` | Updated handleStop(), polling error handling |

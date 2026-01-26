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

**Status:** Implemented in the frontend (95% CI from EV/SD + rounds using normal approximations). Backend CI fields still pending if we want to expose them via API.

#### Why This Matters

The current RoR calculation at `simulation.py:538-547` uses a simple log-ruin formula:

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
| `backend/app/engine/simulation.py` | 538-547 | Simple log-ruin RoR |
| `backend/app/models.py` | 114 | `ror: Optional[float]` field |
| `frontend/src/App.tsx` | ~1800-1850 | RoR display in results |

#### Acceptance Criteria

- [x] RoR calculation accounts for actual bet distribution from simulation
- [x] Trip RoR (probability of losing X units in Y hours)
- [x] Required bankroll calculation for 5% and 1% RoR targets
- [x] Detailed RoR display in frontend with explanations
- [ ] Per-TC variance weighted by bet size squared (future enhancement)
- [ ] Kelly-based RoR calculation option (future enhancement)
- [ ] Monte Carlo RoR estimation option (for verification - future enhancement)
- [ ] 95% confidence interval on RoR estimate (future enhancement)
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

**Priority:** 🟡 MEDIUM (but high user value)

#### Why This Matters

The simulator currently only runs batch simulations. It doesn't help users **learn** the strategy. A training mode:
- Deals one hand at a time
- Asks user for decision
- Shows correct answer and why
- Tracks accuracy over time
- Focuses on commonly-missed hands

**Real-world impact:** Users can practice perfect basic strategy and deviations before risking money. Deliberate practice with feedback is the most effective way to learn.

#### Acceptance Criteria

- [ ] Single-hand dealing mode
- [ ] User selects action via buttons
- [ ] Immediate feedback: correct/incorrect
- [ ] Shows reasoning for correct action
- [ ] Running accuracy statistics
- [ ] Filter by hand type (hard/soft/pairs)
- [ ] Focus mode: repeat missed hands
- [ ] Include deviation situations
- [ ] True count display (for deviation practice)
- [ ] Session summary with weak spots

#### Implementation Steps

**Step 1: Create training state management**

New file `frontend/src/components/TrainingMode.tsx`:

```tsx
interface TrainingState {
  mode: "basic" | "deviations" | "mixed";
  currentHand: TrainingHand | null;
  history: HandResult[];
  stats: {
    total: number;
    correct: number;
    byType: Record<string, { total: number; correct: number }>;
  };
  focusQueue: TrainingHand[];  // Hands to repeat
  showCount: boolean;
  deckState: DeckState;
}

interface TrainingHand {
  playerCards: string[];
  dealerUpcard: string;
  trueCount: number;
  runningCount: number;
  correctAction: string;
  correctReason: string;
  isDeviation: boolean;
  deviationName?: string;
}

interface HandResult {
  hand: TrainingHand;
  userAction: string;
  correct: boolean;
  timestamp: number;
}
```

**Step 2: Implement hand generation**

```tsx
function generateTrainingHand(
  mode: "basic" | "deviations" | "mixed",
  rules: Rules,
  deviations: Deviation[],
  deckState: DeckState,
  focusQueue: TrainingHand[]
): TrainingHand {
  // 30% chance to pull from focus queue if available
  if (focusQueue.length > 0 && Math.random() < 0.3) {
    return focusQueue[Math.floor(Math.random() * focusQueue.length)];
  }

  // Generate hand based on mode
  const { playerCards, dealerUpcard } = dealRandomHand(deckState);
  const trueCount = deckState.runningCount / Math.max(deckState.remainingDecks, 0.25);

  // Check for deviation
  const handKey = getHandKey(playerCards, dealerUpcard);
  const applicableDeviation = findApplicableDeviation(handKey, trueCount, deviations);

  let correctAction: string;
  let correctReason: string;
  let isDeviation = false;

  if (applicableDeviation && (mode === "deviations" || mode === "mixed")) {
    correctAction = applicableDeviation.action;
    correctReason = `Deviation: ${applicableDeviation.hand_key} at TC >= ${applicableDeviation.tc_floor}`;
    isDeviation = true;
  } else {
    correctAction = getBasicStrategyAction(playerCards, dealerUpcard, rules);
    correctReason = getBasicStrategyReason(playerCards, dealerUpcard, rules);
  }

  return {
    playerCards,
    dealerUpcard,
    trueCount,
    runningCount: deckState.runningCount,
    correctAction,
    correctReason,
    isDeviation,
    deviationName: applicableDeviation?.hand_key,
  };
}

function getBasicStrategyReason(cards: string[], dealerUp: string, rules: Rules): string {
  const { total, soft } = handValue(cards);
  const up = upcardKey(dealerUp);

  // Generate human-readable explanation
  if (soft) {
    if (total === 18 && ["3", "4", "5", "6"].includes(up)) {
      return "Soft 18 vs weak upcard: Double to maximize value. Stand if can't double.";
    }
    // ... more explanations
  }

  if (total === 16 && up === "T") {
    return "16 vs 10: Surrender if allowed. The dealer has ~77% chance to make 17+.";
  }

  // Default explanation
  return `${soft ? "Soft" : "Hard"} ${total} vs ${up}: Standard basic strategy.`;
}
```

**Step 3: Build training UI component**

```tsx
export function TrainingMode({ rules, deviations }: TrainingModeProps) {
  const [state, dispatch] = useReducer(trainingReducer, initialState);

  const handleAction = (action: string) => {
    const correct = action === state.currentHand?.correctAction;

    dispatch({
      type: "ANSWER_SUBMITTED",
      payload: { action, correct },
    });

    // If wrong, add to focus queue
    if (!correct && state.currentHand) {
      dispatch({
        type: "ADD_TO_FOCUS",
        payload: state.currentHand,
      });
    }

    // Show feedback briefly, then next hand
    setTimeout(() => {
      dispatch({ type: "NEXT_HAND" });
    }, correct ? 800 : 2000);  // Longer pause on mistakes
  };

  return (
    <div className="training-mode">
      <div className="training-header">
        <h2>Strategy Training</h2>
        <div className="training-stats">
          <span>Accuracy: {((state.stats.correct / state.stats.total) * 100 || 0).toFixed(1)}%</span>
          <span>({state.stats.correct}/{state.stats.total})</span>
        </div>
      </div>

      <div className="training-controls">
        <select value={state.mode} onChange={e => dispatch({ type: "SET_MODE", payload: e.target.value })}>
          <option value="basic">Basic Strategy Only</option>
          <option value="deviations">Deviations Only</option>
          <option value="mixed">Mixed</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={state.showCount}
            onChange={e => dispatch({ type: "SET_SHOW_COUNT", payload: e.target.checked })}
          />
          Show True Count
        </label>
      </div>

      {state.currentHand && (
        <div className="training-hand">
          <div className="cards-display">
            <div className="dealer-area">
              <span className="label">Dealer</span>
              <div className="cards">
                <Card value={state.currentHand.dealerUpcard} />
                <Card value="?" faceDown />
              </div>
            </div>

            <div className="player-area">
              <span className="label">Your Hand ({describeHand(state.currentHand.playerCards)})</span>
              <div className="cards">
                {state.currentHand.playerCards.map((card, i) => (
                  <Card key={i} value={card} />
                ))}
              </div>
            </div>
          </div>

          {state.showCount && (
            <div className="count-display">
              <span>Running: {state.currentHand.runningCount}</span>
              <span>True Count: {state.currentHand.trueCount.toFixed(1)}</span>
            </div>
          )}

          <div className="action-buttons">
            <button onClick={() => handleAction("H")} className="action-hit">Hit</button>
            <button onClick={() => handleAction("S")} className="action-stand">Stand</button>
            <button onClick={() => handleAction("D")} className="action-double">Double</button>
            <button onClick={() => handleAction("P")} className="action-split"
                    disabled={!isPair(state.currentHand.playerCards)}>Split</button>
            {rules.surrender && (
              <button onClick={() => handleAction("R")} className="action-surrender">Surrender</button>
            )}
          </div>

          {state.lastResult && (
            <div className={`feedback ${state.lastResult.correct ? "correct" : "incorrect"}`}>
              {state.lastResult.correct ? (
                <span>Correct!</span>
              ) : (
                <div>
                  <span>Incorrect. Correct action: {state.lastResult.hand.correctAction}</span>
                  <p className="reason">{state.lastResult.hand.correctReason}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="weak-spots">
        <h4>Areas to Improve</h4>
        {getWeakSpots(state.stats.byType).map(spot => (
          <div key={spot.type} className="weak-spot">
            {spot.type}: {spot.accuracy.toFixed(0)}% ({spot.correct}/{spot.total})
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Add CSS for training mode**

```css
.training-mode {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.cards-display {
  display: flex;
  flex-direction: column;
  gap: 30px;
  align-items: center;
  margin: 30px 0;
}

.cards {
  display: flex;
  gap: 10px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.action-buttons button {
  padding: 15px 30px;
  font-size: 18px;
  font-weight: bold;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.action-hit { background: #4ecdc4; }
.action-stand { background: #95a5a6; }
.action-double { background: #f39c12; }
.action-split { background: #9b59b6; }
.action-surrender { background: #e74c3c; }

.feedback {
  margin-top: 20px;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
}

.feedback.correct {
  background: #27ae60;
  color: white;
}

.feedback.incorrect {
  background: #e74c3c;
  color: white;
}

.feedback .reason {
  margin-top: 10px;
  font-size: 14px;
  opacity: 0.9;
}
```

---

### Task #37: Add Counting Practice Module

**Priority:** 🟡 MEDIUM (but high user value)

#### Why This Matters

Card counting accuracy is crucial. A player who miscounts by even 1-2 points will:
- Make wrong bet decisions
- Miss deviation opportunities
- Potentially wong out at wrong times

The counting practice module helps users:
- Build speed and accuracy
- Practice with realistic card dealing
- Identify problem cards (e.g., forgetting 7 is neutral)

#### Acceptance Criteria

- [ ] Cards flash one at a time at configurable speed
- [ ] User tracks running count mentally
- [ ] Periodic checkpoints ask for current count
- [ ] End-of-deck score with accuracy
- [ ] Multiple counting system support (Hi-Lo, KO, etc.)
- [ ] Speed levels: Slow (2s), Medium (1s), Fast (0.5s), Casino (0.3s)
- [ ] Multi-card mode (2-3 cards at once, like real dealing)
- [ ] Session statistics and progress tracking
- [ ] Audio cues option

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
| 24 | Implement multi-processing | Performance |
| 30 | Add comprehensive test suite | Quality |
| 1 | Add more counting systems | Features |

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

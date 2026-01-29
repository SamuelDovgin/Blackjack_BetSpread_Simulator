# Plan Jan 25 - Bankroll UX + Preset Management + Precision Targets

## Purpose
- Track the Jan 25 UI/UX improvements around global bankroll, preset management, and help text.

## Changes Completed
- Bankroll is now a single shared value across Simulation Settings and the RoR widget (no toggle).
- RoR formatting increased to show more precision.
- Trip Outcomes and Optimal Bet controls now include help tooltips and better spacing.
- Load Preset modal includes a Delete action for saved presets.
- Custom hands input now supports Enter to apply and uses an "Apply" button.
- Default wong-out threshold updated to -1 for the built-in Midwest ramp.
- Added a playing-card favicon for the SPA.
- Task #40: Added 95% confidence intervals for EV/SD-derived metrics with a toggle and table tooltips.
- Added Precision Target controls near Run/Stop with Fast/Balanced/Strict presets and a "Continue until precision" button.
- Auto-continue can append multiple batches until the CI target is met (after a minimum hands threshold).
- Stop no longer wipes the current results/config; it just stops polling and keeps the last results.
- Run Status uses a persistent rounds count (includes appended hands).
- Fixed a rare-but-severe bug where async polling could overlap and overwrite combined (appended) results with the last batch result (made it look like millions of hands "didn't count"). Polling is now sequential (no overlap).
- Run Status progress bar now reflects cumulative progress when appending (uses total rounds done/total target), so it no longer visually resets to 0% on append batches.
- Restored normal click-drag text selection in the simulator UI by scoping Training Mode playing-card CSS so it no longer targets generic `.card` panels (cards now style `.card.card-small/.card-medium/.card-large` only).
- Removed the temporary "Copy" buttons (Primary Metrics / Trip Outcomes) so the UI stays uncluttered while we focus on core correctness.
- Default `Hands/hour` is now 75 (and the Trip Outcomes chart defaults to 75 as well).
- Confidence intervals are now shown by default in Primary Metrics (toggle remains available).
- Advanced metrics toggle removed; DI always displays in Primary Metrics.
- Unit-first refactor: backend simulates in units; `Unit size ($)` is now display/conversion only (so changing it scales dollar metrics but not unit metrics).
- Removed the append guard that blocked adding hands after a Unit size change (safe under unit-first semantics).
- Fixed stale-results detection: the "Results are from a previous configuration" banner now ignores unit size, bankroll, hands/hour, and debug toggles.

## To Do (Remaining)
- Validate that the stale-results banner no longer appears immediately after a run when seed is randomized.
- Confirm the new preset delete UI is easy to tap on mobile (no mis-clicks on Load).
- Review tooltip copy for tone/accuracy and adjust based on your feedback.
- Add a quick UI note or tooltip copy explaining RoR modes (simple vs trip) and bankroll sensitivity.
- Verify confidence intervals show correct units ($ vs u) and update when toggling Show units.
- Sanity-check CI ranges for EV/SD and RoR with small and large hand counts.
- Decide whether auto-continue should cap batch sizes to avoid very large single runs.
- Decide whether Precision Target should also require that the CI excludes 0 (optional stricter stop condition).

## Notes
- RoR now uses the calculator output directly, so updating bankroll updates both the widget and Primary Metrics instantly.
- Built-in ramp defaults avoid wong-out thresholds below -1, per recent discussion.
- Precision targets use an absolute 95% CI half-width threshold (u/100). The badge still shows relative CI width vs EV for context.
- Unit size affects RoR only through bankroll-in-units (bankroll $ / unit size $ per unit).

## How to Observe (RoR)
- Run a simulation (so EV/SD are available).
- Set Bankroll ($) in Simulation Settings (shared value).
- In Risk of Ruin: switch between Simple and Trip modes to see the difference; Trip uses your hands/hour and trip length.

## How to Observe (Confidence Intervals)
- Run a simulation to populate EV/SD and rounds played.
- Toggle "Show confidence intervals" in Primary Metrics.
- Hover the Performance Tables cells to see CI tooltips for EV/SD, RoR, Win Rate, DI, N0, and Score.

---

# Jan 28 - Next Highest Priority Features

## Current State Summary

**Completed:**
- Core simulation engine with full rule support
- Hi-Lo counting with TC estimation (perfect/half-deck/full-deck)
- Illustrious 18 + Fab Four deviations
- Bet ramp with wong-out policies
- Unit-first metrics (EV/100, SD/100, DI, SCORE, N0)
- Confidence intervals with precision target controls
- Risk of Ruin calculator (simple + trip)
- Optimal bet tables with Kelly calculations
- Preset save/load/export system
- Multi-processing for faster simulations
- Training Mode Phase 1-3 (core gameplay, animations, decision validation, session persistence)
- Training Mode: dealer bust now shows a BUST badge under the dealer hand (to match player BUST indicators).
- Added GitHub Pages deployment for the frontend (auto-build + publish on push) so Training Mode can be tested on mobile: `.github/workflows/deploy-frontend.yml` + `frontend/vite.config.ts` + `docs/GITHUB_PAGES.md`.
- Risk of Ruin Analysis card no longer requires a bankroll to display. If bankroll is unset, Lifetime/Trip RoR show `n/a`, but Required Bankroll (5%/1%) and N0 still display from EV/SD.

---

## TIER 1: Complete Training Mode (High Impact - User Requested)

### 1.1 Counting Practice Module (Task #37)
**Priority:** CRITICAL - Core training feature still missing

**What it does:**
- Standalone card counting drills with adjustable speed (2s → 0.3s per card)
- Cards flash one at a time; user tracks count mentally
- Periodic checkpoints quiz the running count
- End-of-deck final answer mode (countdown without checkpoints)
- True count conversion quizzes (given RC + decks remaining, calculate TC)
- Multi-card mode (pairs/triplets to simulate real dealing)
- Speed progression: Learning → Casino speed → Expert

**Implementation scope:**
- New component: `CountingPractice.tsx` with drill UI
- Large card display with count value hints (toggleable)
- Speed presets and mode selector
- Results summary with accuracy stats
- Integration with training page as a switchable mode

### 1.2 Deck Estimation Training
**Priority:** HIGH - Essential for realistic TC calculation

**What it does:**
- Rendered 3D/2D discard tray (not photos) for infinite scenarios
- User estimates decks remaining from visual discard pile
- Difficulty progression: whole decks → half decks → quarter decks
- User's estimate feeds into TC calculation (wrong estimate = wrong TC)
- Combined drill: estimate decks → calculate true count

**Implementation scope:**
- Visual discard tray component with configurable fill level
- Multiple tray styles (slanted, vertical, deep)
- Camera angle variance to prevent memorization
- Accuracy tracking over sessions

### 1.3 Training Mode Polish
**Priority:** MEDIUM - Quality of life improvements

**What to add:**
- Hand history panel (last 10-20 hands with decisions made)
- Weak spot analysis (hands where accuracy < 70%)
- Session summary with recommendations
- Keyboard shortcuts (H/S/D/P/R) - currently buttons only
- Speed controls (animation speed, auto-advance delay)
- High-count scenario mode (pre-generated shoes with TC +3 to +6)

---

## TIER 2: Simulator Feature Completeness

### 2.1 Insurance EV Tracking (Task #8)
**Priority:** HIGH - Missing analytics for a key decision

**What it does:**
- Track insurance offers, takes, wins/losses separately
- Insurance statistics by true count bucket
- Calculate actual breakeven TC from data (not assumed +3)
- Even money tracking (player BJ + dealer Ace situations)
- Display insurance profit contribution to overall EV

**Implementation scope:**
- Add `insurance_stats` dict in simulation loop
- New `InsuranceSummary` model with per-TC breakdown
- Frontend panel showing insurance analysis with win rate by TC
- Estimated breakeven TC from simulation data

### 2.2 More Counting Systems (Task #1)
**Priority:** HIGH - Many players use non-Hi-Lo systems

**Systems to add:**
- **KO (Knock-Out)** - Unbalanced, no TC conversion needed
- **Hi-Opt I** - Excludes 2s and Aces from count
- **Hi-Opt II** - More precise with different tag values
- **Omega II** - Advanced multi-level count
- **Zen Count** - Balanced multi-level count
- **Wong Halves** - Fractional tags for precision

**Implementation scope:**
- Define tag values for each system in presets
- Update backend to use counting system from request
- Frontend dropdown to select system
- Update deviation thresholds per system (some may differ)

### 2.3 Additional Rule Options
**Priority:** MEDIUM - Common casino variations

**Rules to add:**
- **Early vs Late Surrender** (Task #41) - Currently only late surrender
- **European No-Hole-Card** (Task #42) - Dealer doesn't check for BJ
- **Double on 9/10/11 only** (Task #44) - Restricts doubling
- **6:5 Blackjack Payout** (Task #45) - Common bad rule to analyze
- **CSM Simulation** (Task #43) - Continuous shuffle machine (no counting)

**Implementation scope:**
- Add boolean flags to Rules model
- Update simulation logic to check flags
- Frontend toggles in Rules section
- Update basic strategy tables for rule variations

### 2.4 Custom Basic Strategy Editor (Task #5)
**Priority:** MEDIUM - Advanced user feature

**What it does:**
- Visual grid editor for hard/soft/pair strategy tables
- Click cells to cycle through actions (H→S→D→R→P)
- Diff highlighting against "optimal" basic strategy
- Import/export strategy as JSON
- Pre-built strategies for common rule sets

**Implementation scope:**
- Convert hardcoded strategy to JSON data structure
- New `StrategyEditor.tsx` component with clickable grid
- Backend accepts custom strategy in request
- Strategy presets for different rule combinations

---

## TIER 3: Analytics & Visualization

### 3.1 Per-Count EV Chart
**Priority:** MEDIUM - Visual insight into count profitability

**What it does:**
- Line/bar chart showing EV by true count
- Visual demonstration that high counts are profitable
- Helps validate bet ramp sizing decisions

**Implementation scope:**
- Use existing `tc_histogram` data from results
- Add chart component (Recharts or Chart.js)
- Show EV/100 on Y-axis, TC on X-axis
- Overlay bet ramp for comparison

### 3.2 Bet Distribution Analysis
**Priority:** LOW - Nice to have visualization

**What it does:**
- Histogram of actual bets placed during simulation
- Shows how often each bet size was used
- Helps verify wong-out is working as expected

### 3.3 Scenario Comparison Dashboard (Task #20)
**Priority:** LOW - Power user feature

**What it does:**
- Run multiple configurations side-by-side
- Compare EV, RoR, hourly win rate across scenarios
- Quick "what-if" analysis for rule/ramp changes

---

## TIER 4: Quality of Life & Polish

### 4.1 Mobile Responsive Layout (Task #14)
**Priority:** HIGH - Training mode especially needs mobile support

**What to fix:**
- Training mode table layout on small screens
- Button sizes for touch targets
- Sidebar collapse/expand on mobile
- Card sizes scale properly

### 4.2 Keyboard Shortcuts (Task #16)
**Priority:** MEDIUM - Power user efficiency

**Shortcuts to add:**
- Training: H/S/D/P/R for actions, Space for deal/continue
- Simulator: Cmd/Ctrl+Enter to run, Esc to stop
- Global: Number keys for hands presets

### 4.3 Dark Mode Theme (Task #13)
**Priority:** LOW - Aesthetic preference

**Implementation scope:**
- CSS variables for colors already partially in place
- Add theme toggle in settings
- Respect system preference (prefers-color-scheme)

### 4.4 Error Boundary & Crash Recovery (Task #48)
**Priority:** MEDIUM - Prevents data loss

**What it does:**
- React error boundary catches component crashes
- Shows friendly error message instead of blank screen
- Auto-saves state to localStorage before crash
- "Restore session" option on reload

---

## TIER 5: Advanced Features (Future)

### 5.1 Extended Deviations (Task #6)
- Full Illustrious 18 variations for different rules
- Additional playing deviations beyond I18/Fab4
- Deviation conflict detection

### 5.2 Side Count Tracking (Task #2)
- Ace side count for insurance decisions
- Specific card tracking (e.g., 5s for insurance)

### 5.3 Back-Counting Simulation (Task #3)
- Mid-shoe entry at positive counts
- Table-hopping strategy simulation

### 5.4 Multi-Hand Play (Task #4)
- Playing 2-3 spots simultaneously
- Correlation effects on variance

### 5.5 Betting Strategy Comparison (Task #7)
- Compare different bet ramps side-by-side
- Optimize bet ramp for given bankroll/RoR target

### 5.6 Side Bet Simulation (Task #32)
- Perfect Pairs, 21+3, Lucky Ladies
- EV analysis of side bets at various counts

### 5.7 Team Play Simulation (Task #33)
- Big player / spotter team strategies
- Signaling and entry coordination

---

## Implementation Order Recommendation

**Immediate (This Week):**
1. Counting Practice Module - core drills with speed control
2. Keyboard shortcuts for training mode (H/S/D/P/R)

**Near Term (Next 2 Weeks):**
3. Insurance EV tracking in simulator
4. More counting systems (KO, Hi-Opt I, Omega II)
5. Mobile responsive fixes for training mode

**Medium Term (Month):**
6. Deck estimation training
7. Additional rule options (surrender types, 6:5 BJ)
8. Per-count EV chart visualization
9. Custom basic strategy editor

**Longer Term:**
10. Scenario comparison dashboard
11. Dark mode theme
12. Extended deviations
13. Side counts and back-counting

---

## Success Metrics

A "complete" blackjack simulator should enable a user to:
- [ ] Practice playing hands at casino speed with immediate feedback
- [ ] Practice counting cards until 95%+ accuracy at 0.5s/card
- [ ] Estimate decks remaining accurately (within 0.5 decks)
- [ ] Analyze any rule combination's EV and RoR
- [ ] Validate custom bet ramps for their bankroll
- [ ] Use any popular counting system (not just Hi-Lo)
- [ ] Understand insurance profitability at different counts
- [ ] Export results for offline analysis
- [ ] Use the app effectively on mobile devices

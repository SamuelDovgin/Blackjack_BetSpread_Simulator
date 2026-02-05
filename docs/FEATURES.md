# Blackjack Simulator - Features & Roadmap

## Implemented Features
- **Core engine**
  - Full hand-by-hand simulation with Hi-Lo counting.
  - Basic strategy logic switches key decisions based on H17 vs S17 (e.g., A7v2 and 11vA).
  - Splits with queue-based resolution respecting: max splits, resplit aces, hit-split-aces toggle, double-after-split, double-any-two, surrender, insurance, H17/S17.
  - Bet ramp with wong-out and optional cash or unit entry (cash is converted to units at request time).
  - Wong-out policy: anytime / after loss only / after hand only.
  - Deviations (Illustrious 18 + Fab 4 preset) applied to actions and insurance.
  - True count histogram (raw) and estimated TC histogram (if deck estimation is enabled).
  - Deck estimation: perfect (0), half-deck, or full-deck quantization with rounding (nearest/floor/ceil) and toggles for using estimated TC for betting and deviations. Defaults to full-deck + floor.
  - Wong-out burns cards to advance the shoe realistically.
  - Unit-first metrics (unit_size is display-only): EV/100 (u), SD/100 (u), DI, SCORE, N0, hours_played, tc_histogram, tc_histogram_est.
  - Correct split-round accounting: insurance is charged/paid once per round; variance uses round_profit^2 (not per-hand squares).
  - Debug logging: first N hands with cards, bets, actions, outcomes; includes raw and estimated TC.
  - Optional multiprocessing for large runs (ProcessPoolExecutor). If multiprocessing is not permitted by the runtime environment, the backend falls back to single-process and records the reason in `result.meta.parallel_failed`.

- **Backend API (FastAPI)**
  - `POST /api/simulations` to start a simulation.
  - `GET /api/simulations/{id}` to fetch results.
  - `GET /api/simulations/{id}/status` for progress.
  - `GET /api/libraries/defaults` for rules/count/ramp/deviations presets.

- **Frontend (Vite/React/TS)**
  - Top bar with scenario name + unsaved dot, Run/Stop/Duplicate/Save/Load/Export, and status chip.
  - Hands selector with active presets, custom input, and append mode to add hands to existing results.
  - Sticky input sidebar (rules, counting/TC estimation, ramp, simulation settings, deviations) including optional cut-decks input for penetration.
  - Basic strategy preview tables for the active rules preset (pairs/soft/hard/surrender).
  - Strategy tables are color-coded (hit, stand, double, double-stand, split, split-conditional).
  - Rules preset includes both `6D H17 DAS` and `6D S17 DAS` (surrender off by default).
  - Results pane with primary metrics cards, unit toggle, and TC histograms (raw + estimated).
  - Metrics include Bet Average (units), win rate (units/hour + $/hour), RoR percent, and equivalent table time.
  - Confidence intervals (95%) available for primary metrics and performance table tooltips.
  - Precision Target controls near Run/Stop to continue runs until an absolute 95% CI half-width target is reached (u/100; fast/balanced/strict presets).
  - Auto-continue can append multiple batches until the CI target is met (with a minimum hands threshold).
  - Trip outcomes chart with simulated paths, axes/gridlines, and sigma/percentile bands (normal approximation).
  - Risk of Ruin calculator widget (simple + trip) under histograms, driven by EV/SD from the current run (trip uses Brownian/normal approximation) and a shared global bankroll input.
  - CVCX-style performance tables (bet average, EV/100, SD/100, RoR, DI, c-SCORE, N0) and count frequency table (raw TC).
  - Per-count EV/SE (IBA) table using played-round TC buckets (tc_for_bet).
  - Optimal bet tables (Kelly-style exact + chips rounding with bet increment and simplify toggle).
  - Preset save/load modals with localStorage persistence for rules/ramp/deviations/scenarios, plus duplicate/rename/delete and JSON import/export (including delete from the load modal).
  - Ramp preview de-dupes TC steps for a clean mini chart.
  - Built-in ramp library presets (BJInfo 1-8, BJInfo 1-12, shoe 1-12 + wong-out, single-deck 1-4, aggressive shoe 1-15).
  - Deviation search + filters + action dropdowns; auto-disable surrender deviations when surrender is off.
  - Deviation toolbar and rows wrap and stay within the card on narrow widths.
  - Progress bar and run details panel with debug log.
  - RoR displayed as percent; raw RoR available in Run Details. Equivalent table time shown with hours + days + 4h sessions.
  - Estimated metrics update during running sims (EV/SD/bet average), including append runs (combined with prior results).
  - Seed randomizes each run by default with a toggle to lock a fixed seed.
  - Help tooltips on key trip outcomes and optimal bet controls for quick guidance.

- **Training Mode (Vite/React/TS)**
  - Animated dealing (one card at a time), splitting, doubles, dealer play, and discard/removal animations.
  - Deck estimation photo strip anchored next to the dealer cards (GitHub Pages-safe asset paths).
  - Quick-counts pull-tab under the photo (click to toggle): `Running`, `Divisor`, `True`.
  - Divisor/TC are based on the deck-estimation depth (discard tray), not live shoe length:
    - Stable within a hand (cards in play don't change the estimate).
    - Updates once per round when cards leave the table.
    - Full-deck estimation uses conservative `ceil(decks_remaining)`; TC is floored for play when in `floor` mode.

- **Configuration**
  - API base configurable via `VITE_API_BASE` (defaults to `http://127.0.0.1:8001/api`).
  - Backend default port recommended: 8001 (avoid conflicts).
  - Frontend plan tracked in `docs/FRONTEND_PLAN.md`.

- **Tests**
  - Pair strategy sanity checks, deck-estimation rounding checks, simulation smoke test (rounds_played, histograms, hours_played).
  - Unit invariance test: changing `unit_size` does not change unit-based results (EV/SD/variance/avg bet in units).

## Known Limitations / Future Work
- Performance: multiprocessing is optional but can be blocked by sandboxed/restricted environments; add Numba/JIT and further profiling for speed.
- RoR: uses a simple log-ruin approximation; refine with Kelly fraction and variable-bet ruin models.
- Strategy coverage: basic pair/soft/hard tables are simplified; expand for full rule sets and validate against known benchmarks.
- Wong-out table consumption: add configurable table hand count to burn cards when sitting out.
- UI: add EV vs TC and bet-distribution charts; add CSV import/export for deviations; add scenario compare view.
- Per-count optimal bet rounding is currently basic monotonic smoothing; improve rational/simplify logic.
- Presets: add tags/search drawer improvements and validation warnings for incompatible presets.
- Deviations: conflict detection, override layers, and rule compatibility badges.
- Sessions: optional bankroll-path simulation using full hand outcomes (beyond normal approximation).
- Runtime: add cancel endpoint for active simulations.
- Optimizer: add bet-ramp optimizer endpoint and UI (pilot runs with constraints).
- Persistence: optional storage of past runs, CSV/JSON export endpoints.
- Testing: add regression tests for EV/variance against benchmark sims for common rule sets.

# Blackjack Simulator - Features & Roadmap

## Implemented Features
- **Core engine**
  - Full hand-by-hand simulation with Hi-Lo counting.
  - Splits with queue-based resolution respecting: max splits, resplit aces, hit-split-aces toggle, double-after-split, double-any-two, surrender, insurance, H17/S17.
  - Bet ramp with wong-out and optional cash or unit entry.
  - Deviations (Illustrious 18 + Fab 4 preset) applied to actions and insurance.
  - True count histogram (raw) and estimated TC histogram (if deck estimation is enabled).
  - Deck estimation: perfect (0), half-deck, or full-deck quantization with rounding (nearest/floor/ceil) and toggles for using estimated TC for betting and deviations. Defaults to full-deck + floor.
  - Wong-out burns cards to advance the shoe realistically.
  - Metrics: EV/100, stdev/100, DI, SCORE, N0, RoR (log-ruin approximation), hours_played (from hands_per_hour), tc_histogram, tc_histogram_est.
  - Debug logging: first N hands with cards, bets, actions, outcomes; includes raw and estimated TC.

- **Backend API (FastAPI)**
  - `POST /api/simulations` to start a simulation.
  - `GET /api/simulations/{id}` to fetch results.
  - `GET /api/simulations/{id}/status` for progress.
  - `GET /api/libraries/defaults` for rules/count/ramp/deviations presets.

- **Frontend (Vite/React/TS)**
  - Top bar with scenario name + unsaved dot, Run/Stop/Duplicate/Save/Load/Export, and status chip.
  - Sticky input sidebar (rules, counting/TC estimation, ramp, simulation settings, deviations) including optional cut-decks input for penetration.
  - Results pane with primary metrics cards, unit toggle, and TC histograms (raw + estimated).
  - Metrics include Bet Average (units), win rate (units/hour + $/hour), RoR percent, and equivalent table time.
  - Session outcomes chart with simulated paths and variance band (normal approximation).
  - Preset save/load modals with localStorage persistence for rules/ramp/deviations/scenarios, plus duplicate/rename/delete and JSON import/export.
  - Ramp preview de-dupes TC steps for a clean mini chart.
  - Deviation search + filters + action dropdowns; auto-disable surrender deviations when surrender is off.
  - Progress bar and run details panel with debug log.
  - RoR displayed as percent; raw RoR available in Run Details. Equivalent table time shown with hours + days + 4h sessions.
  - Estimated metrics update during running sims (EV/SD/bet average).
  - Seed randomizes each run by default with a toggle to lock a fixed seed.

- **Configuration**
  - API base configurable via `VITE_API_BASE` (defaults to `http://127.0.0.1:8001/api`).
  - Backend default port recommended: 8001 (avoid conflicts).
  - Frontend plan tracked in `docs/FRONTEND_PLAN.md`.

- **Tests**
  - Pair strategy sanity checks, deck-estimation rounding checks, simulation smoke test (rounds_played, histograms, hours_played).

## Known Limitations / Future Work
- Performance: currently single-process, no Numba; add multiprocessing and JIT for speed.
- RoR: uses a simple log-ruin approximation; refine with Kelly fraction and variable-bet ruin models.
- Strategy coverage: basic pair/soft/hard tables are simplified; expand for full rule sets and validate against known benchmarks.
- Wong-out table consumption: add configurable table hand count to burn cards when sitting out.
- UI: add EV vs TC and bet-distribution charts; add CSV import/export for deviations; add scenario compare view.
- Presets: add tags/search drawer improvements and validation warnings for incompatible presets.
- Deviations: conflict detection, override layers, and rule compatibility badges.
- Sessions: optional bankroll-path simulation using full hand outcomes (beyond normal approximation).
- Runtime: add cancel endpoint for active simulations.
- Optimizer: add bet-ramp optimizer endpoint and UI (pilot runs with constraints).
- Persistence: optional storage of past runs, CSV/JSON export endpoints.
- Testing: add regression tests for EV/variance against benchmark sims for common rule sets.

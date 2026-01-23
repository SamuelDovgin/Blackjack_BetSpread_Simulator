# Blackjack Simulator Planning (CVCX-inspired)

## Purpose & Goals
- Build a local, free alternative to CVCX focused on fast what-if analysis for blackjack advantage play.
- Target: millions of simulated hands per scenario, with Hi-Lo counting, user-defined bet spreads, and deviation tables.
- Outputs: EV/100, stdev/100, SCORE, N0, risk of ruin, bankroll/time-to-goal, and bet-ramp recommendations.

## Guiding Principles
- **Accuracy first**: simulate hands (no closed-form approximations) with configurable rules, penetration, and deviations.
- **Speed**: leverage NumPy + Numba and multiprocessing to hit multi-million-hand runs quickly.
- **Transparency**: expose assumptions, indexes, and rules; deterministic runs via seeds.
- **Portability**: Python 3.11+, FastAPI backend, Vite/React frontend; offline by default.

## Core User Flows
1) Select game rules (decks, H17/S17, DAS, RSA, surrender, split rules, max splits, BJ payout, dealer peeks).
2) Select penetration (% of shoe cut).
3) Choose counting system (Hi-Lo now; extensible for future counts) and deviation set (Illustrious 18 + Fab 4 default; allow custom CSV upload).
4) Define bet spread / ramp or ask optimizer to produce one under constraints (min/max bet, wonging, ramp smoothness, max RoR).
5) Run simulation for N shoes or N hands (default 2,000,000 hands; allow smaller/larger) with seeded RNG, parallel chunks.
6) View results: EV/100, stdev/100, TC distribution, DI, SCORE, N0, RoR given bankroll + unit size, optimal ramp (if requested).
7) Compare scenarios side-by-side and export JSON/CSV.

## Defaults
- **Rules preset**: 6D, H17, DAS, RSA allowed, late surrender, max splits 3 (4 hands total), hit split aces = false, peek on tens/aces, BJ pays 3:2, penetration default 75% (cut 1.5 decks), Midwest-style shoe.
- **Count**: Hi-Lo only (2-6=+1, 7-9=0, T-A=-1). Architecture ready for additional counts later.
- **Deviations**: Illustrious 18 + Fab 4 preloaded; user CSV upload to extend/override.
- **Hands per run**: default 2,000,000; UI knob for 100k–10M with guardrails.

## Proposed Stack
- **Backend**: FastAPI + Pydantic, Uvicorn; `orjson` for speed.
- **Simulation engine**: Python module using NumPy arrays + optional Numba JIT; multiprocessing via `concurrent.futures.ProcessPoolExecutor`.
- **Data**: In-memory; optional Parquet/CSV for saved runs using `pandas` if available.
- **Frontend**: Vite + React + TypeScript SPA hitting FastAPI on localhost.
- **Testing**: Pytest; property tests for hand outcomes and count updates.

## Domain Model
- `Rules`: decks, h17/s17, das, rsa, ls/es10, bj_payout, max_splits, hit_split_aces, double_any_two, double_after_split, peek, penetration.
- `Strategy`: basic strategy table + deviations (index by (hand_key, tc_threshold) => action).
- `CountingSystem`: Hi-Lo (tags: 2-6=+1, 7-9=0, T-A=-1), true count via remaining decks.
- `BetRamp`: map TC (floored) => bet size; supports wong-out below TC threshold.
- `SimulationRequest`: rules + strategy + bet ramp + bankroll + unit + target hands/shoes + seed + concurrency.
- `SimulationResult`: EV/100, stdev/100, variance, DI, SCORE, N0, RoR (given bankroll), hands/hour assumption, hours-to-goal, TC histogram, raw per-hand aggregates.

## API Sketch (FastAPI)
- `POST /simulations`: body=SimulationRequest; returns `{id}` immediately; starts background job.
- `GET /simulations/{id}`: status + progress + summary metrics.
- `GET /simulations/{id}/download`: CSV/JSON of per-shoe aggregates (optional).
- `POST /optimize/ramp`: inputs (rules, bankroll, table min/max, spread cap, RoR cap, allowed TC steps, wong-out). Returns suggested ramp + metrics; internally calls simulation in coarse grid search.
- `GET /libraries/rules` & `GET /libraries/indexes`: provide presets (e.g., default Midwest 6D H17 DAS; S17 variants later).

## Simulation Engine Design
- **Shoe model**: NumPy array of card ranks; shuffle once per shoe using RNG seed; cut card placement from penetration; recycle for next shoe.
- **Hand loop**: draw cards, update running count, compute true count = running / remaining_decks; choose action via deviations then basic strategy; resolve payouts.
- **State tracked**: bankroll changes per hand, bets placed, insurance decisions, doubles/splits, running/true count at bet time, TC histogram.
- **Performance**: chunk hands into batches per process; precompute strategy lookup tables; Numba JIT for core step fn; avoid Python objects in inner loop.
- **Parallelism**: split requested hands across processes; aggregate EV/stdev/variance; per-process seeds derived from master seed.
- **Variance/Risk metrics**: EV/hand, Var/hand => EV/100, stdev/100; N0 = variance/(EV/hand^2); SCORE per CVCX (100*(EV/hand)^2/variance * 100? use standard def vs per-100-hand normalization); RoR via log-ruin approximation given bankroll and Kelly fraction; time-to-goal using hands/hour.

## Deviation Support
- Deviations stored as tuples `(hand_key, tc_floor, action)`; `hand_key` encodes player total/soft/pair + dealer upcard.
- Lookup: on decision, floor TC, check deviation table; else fall back to basic.
- Allow user-uploaded CSV; validate and merge.

## Bet Ramp & Optimization
- Ramp represented as map `tc_floor -> bet_units`; enforce table min/max and spread cap.
- Wong-out: optional `wong_out_below_tc` to bet 0 and sit out.
- Optimizer (phase 2): grid search or heuristic: define candidate ramps, simulate shorter pilot runs (e.g., 200k hands), pick best DI/SCORE subject to RoR/bankroll constraints, refine around best ramp.
- Kelly support: compute full Kelly unit from EV/variance; allow fraction (e.g., 0.5 Kelly) to reduce RoR.

## Frontend (React/Vite) Outline
- Pages: Dashboard (recent runs), Scenario Builder (rules, penetration, bet ramp, deviations), Optimizer, Results/Compare.
- Components: RulesForm, RampEditor (TC vs bet slider/table), DeviationTable uploader, ProgressCard, MetricsCards, Charts (EV vs TC, TC histogram, bankroll sim optional).
- API client: fetch simulation status; use Server-Sent Events or polling for progress.
- Styling: lightweight (Tailwind or vanilla CSS modules) since local; focus on clarity.

## CLI (optional)
- `python -m app simulate --rules presets/default_midwest_h17.json --hands 2000000 --ramp ramps/basic.json --seed 123 --out result.json`
- `python -m app optimize --rules ... --target-ror 0.05 --max-spread 1-12`

## Libraries/Repos to Consider
- Could adapt existing open-source blackjack sims for rules/strategy tables (e.g., PyPI "blackjack-simulator", GitHub community sims) by vendoring their strategy tables and hand resolution logic; ensure license compatibility.
- For speed, NumPy + Numba often outperform pure-Python sims; avoid network dependencies.

## Implementation Steps (MVP first)
1) Scaffold FastAPI project structure (`app/` with `main.py`, `models.py`, `engine/`, `services/`), add requirements.txt.
2) Implement rules/strategy data classes and basic strategy table loader.
3) Build Hi-Lo count + deviation-aware decision engine; write unit tests for hand outcomes and count updates.
4) Build simulation loop (single process), validate against sanity checks (EV for flat-bet BS near known benchmarks).
5) Add multiprocessing chunking + progress tracking; ensure deterministic seeds.
6) Add metrics computation (EV/100, stdev/100, SCORE, N0, RoR, hours-to-goal).
7) Expose FastAPI endpoints; add background task runner.
8) Build minimal React UI (forms + status + results cards); wire to API.
9) Add optimizer endpoint (pilot-run grid search) and UI tab.
10) Polish: CSV/JSON export, scenario presets, persistence of past runs.

## Risks & Notes
- Performance tuning may be needed to hit multi-million-hand runs; start with Numba and profiling.
- Ensure deviation table coverage to avoid falling back incorrectly; validate uploads.
- Be explicit about assumptions for SCORE/N0 formulas; document them in UI.
- Multisplit rules and surrender edge cases can be complex—unit tests required.

## Open Questions
- Hands/hour assumption for time-to-goal? (e.g., 100–200 hph depending on heads-up vs full table)
- Preferred UI theme (light/dark), charting lib (Recharts vs Chart.js)?
- Data retention: keep previous runs on disk or in-memory only?

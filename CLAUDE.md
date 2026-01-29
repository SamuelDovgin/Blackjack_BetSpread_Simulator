# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CVCX-inspired blackjack simulator with two modes: **Simulator** (run millions of hands with configurable rules, Hi-Lo counting, bet ramps, deviations) and **Training** (interactive browser-based practice with real-time feedback). FastAPI backend handles simulation; React frontend handles UI and training mode (training runs entirely client-side, no backend needed).

## Commands

### Backend
```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # Dev server at http://localhost:5173
npm run build    # Production build
```

### Tests
```bash
cd backend
pytest                              # Run all tests
pytest tests/test_strategy.py       # Run single test file
pytest tests/test_strategy.py::test_h17_soft18_vs2_is_double_else_stand  # Single test
```

## Architecture

### Backend (`backend/app/`)
```
main.py          → FastAPI app + CORS middleware (allows localhost:5173/5174)
api/routes.py    → REST endpoints: POST /api/simulations, GET status/results
models.py        → Pydantic request/response models (Rules, SimulationRequest, SimulationResult)
data/presets.py  → Default rules, Hi-Lo count values, Illustrious 18 + Fab 4 deviations, bet ramp
services/sim_runner.py → InMemorySimulationRunner: ThreadPoolExecutor with progress callbacks, optional ProcessPoolExecutor for parallel chunk processing
engine/simulation.py   → Core simulation engine (~1200 lines): shoe management, hand loop, basic strategy, pair strategy, deviations, deck estimation, metrics aggregation
```

**Request flow:** `POST /api/simulations` → `sim_runner.start()` → background thread runs `run_simulation()` → frontend polls `/api/simulations/{id}/status` for progress → fetches `/api/simulations/{id}` for final results.

### Frontend (`frontend/src/`)
```
App.tsx              → Main SPA: simulator config forms + results display
api/client.ts        → Axios client + shared TypeScript types (mirrors backend Pydantic models)
components/training/ → Self-contained training mode (no backend dependency)
  engine/gameEngine.ts     → Game state management (immutable state updates)
  engine/basicStrategy.ts  → Pure functions for strategy lookup
  engine/deviations.ts     → Deviation rule checking
  TrainingPage.tsx         → Main training UI
  Card.tsx, Table.tsx, ActionButtons.tsx, FeedbackPanel.tsx, StatsPanel.tsx
```

### Key Design Decisions
- **Unit-first metrics:** All simulation internals use betting units, not dollars. `unit_size` is display/conversion only; `bankroll` only affects RoR calculations.
- **Deterministic seeding:** Optional seed for reproducible runs; default randomizes each run.
- **Multiprocessing fallback:** Uses ProcessPoolExecutor when available, falls back to single-thread in sandboxed environments.
- **Training mode is standalone:** Runs entirely in-browser with no backend calls, enabling GitHub Pages deployment with `VITE_DISABLE_BACKEND=1`.
- **Client-side defaults (`frontend/src/api/client.ts`):** `CLIENT_DEFAULTS` mirrors `backend/app/data/presets.py` — Midwest 6D H17 DAS rules (surrender OFF, resplit aces ON, 0.75 pen), Hi-Lo count, I18 + Fab 4 deviations, 1-12 bet ramp. When the backend is unavailable, `App.tsx` uses these to populate the rules widget, deviations list, and bet ramp so the full UI works without a backend. Training mode's own `DEFAULT_RULES` in `basicStrategy.ts` and `DEFAULT_TRAINING_SETTINGS` in `types.ts` also default surrender OFF and TC estimation to floor.
- **Card sizing:** Desktop cards are 1.5x standard (135x189 large, 105x147 medium). Mobile sizes are unchanged. Card layout constants in `Table.tsx` (offsets, stack spacing) must stay in sync with `Card.css` sizes.

### Environment Variables
- `VITE_API_BASE` — Backend API URL (default: `http://127.0.0.1:8001/api`)
- `VITE_DEFAULT_PAGE` — Starting page (`training` for GitHub Pages)
- `VITE_DISABLE_BACKEND` — Set to `1` to disable backend API calls

## Domain Context

- **Hi-Lo count:** Card counting system where 2-6 = +1, 7-9 = 0, T/J/Q/K/A = -1. True count = running count / remaining decks.
- **Illustrious 18 + Fab 4:** Standard index play deviations for Hi-Lo (strategy changes based on true count).
- **Bet ramp:** Maps true count ranges to bet sizes in units. Supports wong-out (leaving table at negative counts).
- **Key metrics:** EV/100 (expected value per 100 hands), N0 (hands to overcome variance), DI (Desirability Index), SCORE, RoR (Risk of Ruin).
- **Deck estimation:** True count calculation uses configurable rounding (nearest, ceil) and step size for remaining deck estimates.

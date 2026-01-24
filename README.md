# Blackjack Simulator (CVCX-inspired)

Local, Hi-Lo focused blackjack simulator with a FastAPI backend and Vite/React frontend.

## Why FastAPI + React?
- FastAPI gives typed request/response models, async endpoints, and easy background tasks for long-running sims.
- React/Vite keeps the UI decoupled, fast to iterate, and easy to add charts/forms without server templating.
- Clear API boundary makes it straightforward to swap UI or integrate CLI/automation later.
- Note: Python 3.10+ recommended (uses modern typing); if on 3.9 or earlier, ensure optional union syntax is compatible.

## Core Defaults and Focus
- Rules preset: 6D, H17, DAS, RSA, late surrender, max splits 3, no hit split aces, 3:2 BJ, 75% pen (Midwest-style).
- Count: Hi-Lo only (extensible later).
- Deviations: Illustrious 18 + Fab 4 preloaded; user CSV upload planned.
- Bet ramp: starter 1–12 spread with wong-out below TC -2 (editable in UI/API).
- Simulation target: default 2,000,000 hands; UI knob for 100k–10M with guardrails.
- Outputs to target: EV/100, stdev/100, SCORE, N0, RoR, DI, TC histogram, bankroll/time-to-goal.

## Architecture Overview
- Backend: FastAPI (`backend/app/main.py`), routes in `backend/app/api/routes.py`, models in `backend/app/models.py`, presets in `backend/app/data/presets.py`, in-memory runner in `backend/app/services/sim_runner.py`, simulation stub in `backend/app/engine/simulation.py`.
- Frontend: Vite/React/TS SPA (`frontend/src/App.tsx`), API client in `frontend/src/api/client.ts`, entry in `frontend/src/main.tsx`.
- Cross-cutting: CORS for localhost dev, OpenAPI via FastAPI, Axios client in UI, polling for simulation completion.

## Project Layout
- `backend/`: FastAPI app and simulation engine stubs.
- `frontend/`: Vite/React TypeScript SPA.
- `PLAN.md`: design/architecture notes.
- `docs/FRONTEND_PLAN.md`: SPA layout, input behavior, and preset strategy.

## Quickstart
Backend:
```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate  # on PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
# If port 8000 is busy, use 8001 (recommended here to avoid conflicts)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Frontend (in a second shell):
```bash
cd frontend
npm install
# set API base if needed (default is http://127.0.0.1:8001/api)
# $env:VITE_API_BASE="http://127.0.0.1:8001/api"
npm run dev
```

Open the printed Vite URL (e.g., http://localhost:5173 or 5174) and start a sim.

## Next Steps
- Extend simulation: splits/more advanced rules, multiprocessing/Numba tuning, richer risk metrics (RoR).
- Harden strategy tables and deviation coverage; allow CSV upload/validation.
- Enhance UI with charts (EV vs TC, histograms) and optimizer workflow.

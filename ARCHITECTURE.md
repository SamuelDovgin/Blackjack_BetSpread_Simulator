# Architecture Overview

## Repository Layout
- `backend/`
  - `app/`
    - `api/` - FastAPI routes (simulation endpoints, defaults).
    - `data/` - Preset data (rules, deviations, ramp).
    - `engine/` - Simulation engine (shoe, play loop, metrics).
    - `services/` - Run orchestration, progress tracking.
    - `models.py` - Pydantic request/response models.
    - `main.py` - FastAPI app entrypoint.
  - `tests/` - Pytest checks for strategy and estimation.
  - `requirements.txt` - Python dependencies.

- `frontend/`
  - `src/`
    - `api/` - API client + shared types.
    - `App.tsx` - Main SPA layout and logic.
    - `App.css` - UI styling.
    - `main.tsx` - React entrypoint.
  - `package.json` - Frontend dependencies and scripts.
  - `vite.config.ts` - Vite dev/build config.

- `docs/`
  - `FEATURES.md` - Implemented features + roadmap.
  - `FRONTEND_PLAN.md` - UI/UX plan and behaviors.

- `PLAN.md` - Original planning document.
- `README.md` - Setup/run instructions and quickstart.
- `ARCHITECTURE.md` - This file.

## Runtime Architecture
- **Frontend (React/Vite)** calls **FastAPI** at `http://127.0.0.1:8001/api`.
- **FastAPI** starts simulation jobs in a background thread and tracks progress.
- **Simulation engine** runs the hand loop, applies rules/ramp/deviations, and computes metrics.
- **UI** polls `/api/simulations/{id}/status` for progress + estimates, and `/api/simulations/{id}` for final results.

## Data Flow
1) User configures rules/ramp/deviations in the UI.
2) UI sends a `POST /api/simulations` request.
3) Backend runs the simulation and updates progress snapshots.
4) UI shows live estimates, then final metrics when complete.

# Frontend Plan (CVCX-Style SPA)

## Goals
- Build a responsive, two-column SPA with sticky inputs and scrolling results.
- Keep inputs fast to adjust; results easy to compare and trust.
- Provide presets for rules, ramp, deviations, and scenarios without spreadsheet fatigue.

## Layout
- **Top bar (sticky):**
  - Scenario name (editable) + unsaved changes dot.
  - Buttons: Run, Stop, Duplicate, Save preset, Load preset, Export JSON.
  - Status chip: Idle / Running (xx%) / Complete / Error.
- **Two-column main layout:**
  - Left: Inputs (sticky sidebar, grouped cards/accordions).
  - Right: Results (cards + charts, scrollable).

## Input Sections
1) **Rules (card/accordion)**
   - Decks stepper (1–8).
   - Penetration slider + numeric box (0.50–0.95) with auto-normalize if user enters 75 → 0.75.
   - Optional cut-decks input (converted to penetration).
   - Grouped toggles: dealer (H17/S17, peek, BJ payout), doubling (DA2, DAS), surrender (LS/ES), splits (max splits, RSA, hit split aces).
   - Rules presets dropdown (e.g., 6D H17 DAS LS, 6D S17 DAS LS) that fills defaults but remains editable.
   - Read-only basic strategy preview tables (pairs/soft/hard/surrender) for the selected rules.
   - Inline warnings for invalid combos; no blocking input.

2) **Counting & TC estimation**
   - Count system dropdown (Hi-Lo now; extensible).
   - TC estimation mode: Perfect / Half-deck / Full-deck (default Full-deck).
   - Rounding: Nearest / Floor / Ceil (default Floor).
   - Toggles: Use estimated TC for betting / deviations (default on unless Perfect).

3) **Bet Ramp**
   - Table: TC floor | Units (or $) | Remove.
   - Input mode toggle: Units / Dollars (show $ conversion inline).
   - Wong-out below TC + shaded region on mini chart.
   - Wong-out policy selector: anytime / after loss only / after hand only.
   - Add row, sort by TC, clamp actions.
   - Mini chart: X=TC, Y=bet units.
   - Built-in ramp library with common presets; user presets saved locally.

4) **Deviations**
   - Deviation sets with presets: I18 + Fab 4.
   - Search + filters: Hard / Soft / Pairs / Surrender / Insurance.
   - Table: Hand | TC index | Action (dropdown H/S/D/P/R/I) | Remove.
   - Conflicts: highlight same hand/index collisions (future).
   - Auto-disable surrender deviations when surrender off.
   - Import/export CSV (future).

5) **Simulation Settings**
   - Hands, unit size, bankroll, hands/hour, seed (randomized by default), debug log N hands.
   - Quick hands buttons (50k/200k/2M) in top bar.

## Results Layout
- **Primary metrics row:** EV/100, EV/round, SD/100, N0, SCORE (with tooltip), RoR as %, equivalent table time (hours + days + 4h sessions).
- **Additional metrics:** Bet Average (units), win rate (units/hour + $/hour).
- **Units toggle:** show $ and units.
- **Charts:** Session outcomes chart (multiple simulated paths + variance band); TC histogram (raw + estimated) in collapsible section; bet distribution (future), bankroll path (future).
- **Run details:** collapsible meta (seed, rounds, rules hash, ramp hash, deviation set).
- **Stale results banner:** show when inputs change after a run.
- **Live estimates:** show partial EV/SD/bet average while run is in progress.

## Presets Strategy (Local-first)
- Store presets in localStorage (future: IndexedDB + API sync).
- Preset types: rules, ramp, deviations, scenario (bundle all).
- Preset schema:
  - id, type, name, tags, created_at, updated_at, payload, app_version
- Save modal: name + tags + type.
- Load drawer: search + sort + tags, show details.
- Preset actions: duplicate, rename, delete, import/export JSON (ramp + deviations).
- Compatibility handling: if missing fields, apply defaults + show “updated” badge.

## State Shape (Suggested)
- `rules`, `betRamp`, `deviations`, `counting`, `tc_estimation`.
- `simulation_settings` (hands, unit_size, bankroll, hph, seed).
- `scenario_name`, `dirty`, `last_run_config`, `last_saved_config`.
- `presets[]` stored locally and loaded on app init.

## Motion & Visual Language
- Purposeful animation: card enter, progress bar update.
- Bold, warm palette; textured background; no default purple.
- Typography: expressive serif/sans mix, high contrast, legible on mobile.

## Status & Progress
- Run button disabled while running.
- Progress bar + percent in status chip.
- Stop button cancels polling (future: backend cancel endpoint).

## Future Enhancements
- Full deviation preset manager with overlay/override layers.
- Scenario comparison view (2–4 runs).
- Preset sync API.
- Optimizer workflow and report export.

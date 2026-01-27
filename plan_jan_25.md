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
- Toggle “Show confidence intervals” in Primary Metrics.
- Hover the Performance Tables cells to see CI tooltips for EV/SD, RoR, Win Rate, DI, N0, and Score.

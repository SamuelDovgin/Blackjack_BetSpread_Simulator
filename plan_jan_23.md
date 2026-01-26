# Plan Jan 23 - QFIT Footer + Newsletter Widget

## Purpose
- Track changes and next steps for the Jan 23 update request.

## Changes Completed
- Removed the QFIT-style footer and newsletter block (example-only content).
- Adjusted bet-ramp row layout so inputs and Remove buttons no longer overflow the card.
- Added per-count EV/SE (IBA) and optimal bet tables driven by TC buckets.
- Added Kelly-style optimal bet inputs (max units, bet increment, simplify).
- Improved hands selector UI with active presets, custom input, and append mode.
- Constrained deviations toolbar and row inputs so they wrap within the card.
- Primary metrics now prefer live progress estimates even when appending.
- Live metrics during append runs are combined with the existing result (not just the new batch).
- Hands preset buttons use segmented styling with a stronger active state.
- Midwest rules default surrender is off and preset labels no longer mention LS.
- Trip Outcomes chart upgraded with new controls, axes, gridlines, bands (sigma/percentile), and tooltips.
- Fixed per-count tc_table generation to use Welford stats (n_total/n_iba/n_zero), resolving backend KeyError during polling.
- Restricted CORS to local dev origins for reliable frontend polling.
- Fixed stale banner to respect randomized seed runs and show RoR from the calculator when bankroll changes.
- Added styling for the optimal bet chart (colors, backgrounds, legend, axes) to avoid the black-on-black SVG issue.
- Unified bankroll input across Simulation Settings and RoR widget; removed the toggle and increased RoR precision.
- Added tooltip help icons for trip controls and optimal bet controls, plus improved spacing.
- Load Preset modal now allows deleting saved presets.
- Default wong-out threshold adjusted to -1 for the built-in Midwest ramp.
- Hands custom input now uses an Apply button and supports Enter to set.
- Added a playing-card favicon for the SPA.
- Added 95% confidence interval display for primary metrics and table tooltips (Task #40).
- Added Precision Target presets and auto-append button for CI-based stopping (now inline near Run/Stop).

## To Do (Remaining)
- Verify bet ramp row width on small screens and confirm no clipping in the sidebar.
- Validate ramp input UX when switching Units/Dollars to ensure no misalignment.
- Add per-count variance/EV exports if you want CSV output.
- Confirm append mode behavior: should it aggregate independent runs (current) or require true in-shoe continuation?

## Ideas / Next Steps to Review
- Extend RoR widget with goal-based (double-barrier) mode.
- Add a compact ramp chart legend for min/max/spread at a glance.
- Improve optimal bet “simplify” to a rational algorithm (limit jumps, merge adjacent levels).
- Add an "Extend run" backend API to continue a simulation from its internal state (future).

## Acceptance Notes
- No footer text remains in the UI.
- Bet ramp rows stay within the card width; no truncated buttons.
- Per-count EV/SE and optimal bet rows render when the backend includes `tc_table`.
- Hands presets show active state; custom hands can be set or appended.
- Deviation toolbar/buttons and row fields no longer spill outside the card.
- Default rules load with surrender off (Midwest).
- Trip Outcomes chart responds to trip hours, hands/hour, steps, and band mode.

# Plan Jan 25 - Bankroll UX + Preset Management + Tooltips

## Purpose
- Track the Jan 25 UI/UX improvements around global bankroll, preset management, and help text.

## Changes Completed
- Bankroll is now a single shared value across Simulation Settings and the RoR widget (no toggle).
- RoR formatting increased to show more precision.
- Trip Outcomes and Optimal Bet controls now include help tooltips and better spacing.
- Load Preset modal includes a Delete action for saved presets.
- Custom hands input now supports Enter to apply and uses an “Apply” button.
- Default wong-out threshold updated to -1 for the built-in Midwest ramp.
- Added a playing-card favicon for the SPA.

## To Do (Remaining)
- Validate that the stale-results banner no longer appears immediately after a run when seed is randomized.
- Confirm the new preset delete UI is easy to tap on mobile (no mis-clicks on Load).
- Review tooltip copy for tone/accuracy and adjust based on your feedback.

## Notes
- RoR now uses the calculator output directly, so updating bankroll updates both the widget and Primary Metrics instantly.
- Built-in ramp defaults avoid wong-out thresholds below -1, per recent discussion.

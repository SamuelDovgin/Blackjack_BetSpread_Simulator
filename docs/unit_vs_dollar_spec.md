# Unit vs Dollar Spec

## Purpose
Define how "units" and "dollars" work in this project, and what changing `Unit size ($)` is allowed to affect.

## Quick Mental Model (Best One)
- The game is naturally described in units (1u, 2u, 8u...), because ramps and card counting decisions are expressed in units.
- Dollars are a scale factor: `dollars = units * unit_size`.
- The main place unit size changes "economics" is when something is specified in dollars (especially bankroll), because bankroll-in-units changes.

## Current Behavior (Unit-First Engine)
The backend simulates outcomes in **units**.

Core simulation uses:
- `bet_units` from the bet ramp
- payouts in units (e.g., blackjack payout is `bet_units * 1.5` for 3:2)
- metrics reported in units (EV/100 in u, SD/100 in u, variance in u^2)

The frontend:
- treats unit outputs as canonical
- multiplies by `unit_size` only for display (e.g., $/hour)
- converts bankroll dollars -> bankroll units for RoR/optimal-bet calculators

## What Unit Size Changes
Changing unit size changes all dollar-based outputs:
- EV in dollars
- SD in dollars
- $/hour
- RoR and any bankroll-based calculators (bankroll is in dollars; bankroll-in-units changes)

It does NOT change:
- strategy (basic strategy / deviations)
- count logic and TC distribution
- bet ramp in units
- unit-based EV/SD (u/100, u/hr)

## Why RoR Changes When Unit Size Changes (Even If We Simulate In Units)
RoR depends on bankroll measured in units.

If bankroll is fixed in dollars:
- bankroll $15,000 at $10/unit = 1500 units
- bankroll $15,000 at $150/unit = 100 units

Those are very different bankroll sizes in unit terms, so RoR changes dramatically. This is expected and correct.

## Appending Hands and Unit Size
Because the engine is unit-first, appending additional hands is compatible across `unit_size` changes *as long as the ramp is unit-based*.

In other words:
- Append is compatible when `bet_ramp.steps[].units` are treated as true units.
- Dollar displays and RoR calculations can be recomputed after the fact from the combined unit results.

## Stale Results Banner (Frontend)
The UI banner "Results are from a previous configuration" is based on a sanitized config hash. It intentionally ignores:
- `unit_size` (display-only)
- `bankroll` (calculator-only)
- `hands_per_hour` (time conversion only)
- debug logging flags

It does NOT ignore rule/ramp/deviation/counting settings that change EV/SD.

## Safe Usage Patterns
Allowed:
- Run a sim, then change Unit size to see dollar outputs scale (unit metrics should not change).
- Append more hands after changing Unit size (unit metrics remain valid; dollars are display-only).

## How CVCX Thinks About It (Conceptual)
CVCX exposes core statistics in unit-normalized terms (e.g., EV/SD per 100 hands, IBA, bet average in units), then:
- converts unit/hour to $/hour using your unit size
- converts bankroll $ to bankroll units using unit size for RoR-style calculators

Conceptually: unit-normalized core + dollar conversion layer.

## Cash Bet Mode (Important Caveat)
If the UI allows entering ramps in dollars (e.g., "$80 at TC+2"):
- the system must convert dollars -> units using `unit_size` (and apply rounding rules)
- **unit_size becomes part of the simulation definition** for that scenario
- caching and appending must treat that config as different from a pure unit-based ramp

## Summary
This project now follows the CVCX mental model:
- simulate in unit-normalized terms
- treat dollars as a presentation layer and bankroll conversion layer

This makes results more comparable, easier to cache, and less fragile when users change `Unit size ($)`.

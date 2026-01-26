# Confidence Interval Stop Rules (EV/100)

## Purpose
Define when to stop (or auto-continue) a simulation based on the precision of EV/100.

This app uses the 95% confidence interval (CI) around EV/100 and stops when the CI is "tight enough".

## Core Metric
EV/100 is reported in table units (u). The CI is computed from the current run's EV/SD and number of rounds.

Define:
- CI half-width (u/100) = (CI_high - CI_low) / 2

## Stop Rule (Current UI)
Stop when:
- CI half-width (u/100) <= Target (u/100)

Optional stricter rule (not enforced by the UI today, but useful when you care about "is my edge actually positive"):
- CI excludes 0 (CI_low > 0 or CI_high < 0)

## Presets (Absolute Targets)
These are the built-in Precision Target presets (no percent-based rule):
- Fast / Exploratory: Target = 0.50u/100
- Balanced / Recommended: Target = 0.25u/100
- Strict / Professional: Target = 0.10u/100 (sometimes 0.15u/100 if you want faster runs)

## Example
EV/100 = 3.80u
95% CI = [3.34u, 4.27u]

Half-width = (4.27 - 3.34) / 2 = 0.465u/100

So:
- Fast (0.50u) would stop.
- Balanced (0.25u) would continue.
- Strict (0.10u) would continue a lot longer.

## How Many More Hands?
CI width shrinks approximately with 1/sqrt(N), so a simple estimate for total hands needed is:

N_target ~= N_current * (current_halfwidth / target_halfwidth)^2

Example:
- current_halfwidth = 0.47u
- target_halfwidth = 0.25u
- factor ~= (0.47/0.25)^2 ~= 3.5x

So 2,000,000 hands would need about 7,000,000 hands total.

## EV Near Zero
When EV is close to 0, percent-based targets become unstable (divide by a number near 0).

That is why the current Precision Target control is absolute-only (u/100):
- It behaves sensibly even when EV is small.
- You can still use the relative CI badge in the UI as context, but it does not drive the stop condition.

## Auto-Continue Behavior
The UI "Continue until precision" button:
- ensures a minimum total hands threshold (Min hands)
- then repeatedly appends additional hands until the CI half-width target is reached


# Confidence Interval Stop Rules (EV/100)

## Purpose
Help decide when to stop a simulation based on the precision of EV/100. This uses the 95% confidence interval (CI) around EV/100 rather than the point estimate alone.

## Key Idea
Stop when the 95% CI is "tight enough" around EV/100. Precision is measured by the CI half-width:

- CI half-width = (CI_high - CI_low) / 2
- Relative precision = half-width / |EV/100|

You can use a relative target, an absolute target, or both (recommended).

## Recommended Stop Rule (Balanced Default)
Stop when:

1) Relative precision <= 10% of |EV/100|, AND
2) Absolute precision <= 0.25u per 100 rounds, AND
3) CI excludes 0 (optional but useful for confirming a positive edge)

In code terms:

```
half = (ci_high - ci_low) / 2
rel_ok = half <= 0.10 * abs(ev_per_100)
abs_ok = half <= 0.25
zero_ok = (ci_low > 0 or ci_high < 0)
stop = rel_ok and abs_ok and zero_ok
```

## Alternative Targets

### Fast/Exploratory
- Relative: 20%
- Absolute: 0.5u/100
- Use when: quick ramp checks or early UI validation.

### Balanced (Recommended)
- Relative: 10%
- Absolute: 0.25u/100
- Use when: normal analysis and ramp comparisons.

### Strict/Professional
- Relative: 5%
- Absolute: 0.10–0.15u/100
- Use when: you want high-confidence EV before betting decisions.

## Example (Your Current Run)

EV/100 = 3.80u  
95% CI = [3.34u, 4.27u]

Half-width = (4.27 - 3.34) / 2 = 0.465u  
Relative precision = 0.465 / 3.80 = 12.2%

Interpretation:
- This is close to the 10% target, but not quite there.
- It meets the 0.5u "fast" absolute target.
- It does not meet the 0.25u "balanced" absolute target.

## How Many More Hands?
To estimate additional hands needed:

```
N_target ≈ N_current * (current_halfwidth / target_halfwidth)^2
```

Example:
- Current half-width = 0.47u
- Target half-width = 0.25u
- Factor ≈ (0.47 / 0.25)^2 ≈ 3.5x

If you ran 2,000,000 hands, you would need ~7,000,000 hands total.

## Suggested UI Defaults (Proposal)
Add a "Continue until precision" button with defaults:

- Relative threshold: 10%
- Absolute threshold: 0.25u/100
- Min hands: 1,000,000
- Stop when:
  - half-width <= max(absolute_threshold, relative_threshold * |EV/100|)
  - and (optional) CI excludes 0

## Preset Targets (UI)
- Fast (Exploratory): 20% relative, 0.50u/100 absolute
- Balanced (Recommended): 10% relative, 0.25u/100 absolute
- Strict (Professional): 5% relative, 0.10u/100 absolute (can be adjusted to 0.15u)

## Notes
- These CIs are normal approximations; they improve with large hand counts.
- If EV is near zero, relative precision becomes unstable. In that case, rely on the absolute threshold.
- Different rules/spreads can change variance a lot; adjust thresholds if the sim is slow.

## Auto-Continue Behavior
- The UI can auto-append hands until the selected precision target is met.
- It first ensures a minimum total hands threshold, then continues until the CI half-width target is reached.

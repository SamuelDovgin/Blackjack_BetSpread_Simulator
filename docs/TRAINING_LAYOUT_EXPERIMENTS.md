# Training Layout / Animation Experiments

This doc captures a few attempted approaches (what we tried, what went wrong, and what we decided to do instead) while tuning Training Mode's multi-hand layout + animations.

## Problem: "Hand Jumps" / Vertical Jitter

Observed behavior:
- After dealer reveal/payout, some player hands would appear to "jump" vertically, especially when one hand had only 2 cards and another had 4-5 cards.
- This was most noticeable when result/bust/double indicators appeared/disappeared.

What we tried first:
- Rendered per-hand labels/badges in normal document flow (`.hand-info`) above the card stack.
- Added a small reserved height (`min-height`) so that adding/removing badges would not push the card stack.
- Used a `translateY(-stackRisePx)` to move labels upward as the card stack grew (cards overlap upward with negative y offsets).

Why it wasn't good enough:
- Even with a reserved `min-height`, content changes (e.g., outcome badge + tags) can still create subtle per-hand height differences and visual jitter.
- Any in-flow element above/below the stack risks impacting perceived vertical alignment between hands.

What we do now (current approach):
- Render per-hand labels/badges as an absolutely positioned overlay inside the `.card-stack` (so it never affects layout).
- Position it above the top-most card by using a CSS variable `--stack-rise-px` computed from the number of cards in the hand.

Result:
- Cards no longer shift when badges appear/disappear; only the overlay itself changes.

## Problem: Initial Hands Not Centered as a Group

Goal:
- If the row of hands fits within the viewport, center the whole group (e.g., 3 hands -> middle hand is centered).
- Avoid unnecessary horizontal movement on desktop when everything fits.

What we tried / prior behavior:
- Always centered the active hand, which caused the entire row to shift as the active hand changed.
- This was distracting on desktop because all hands were visible anyway.

What we do now (current approach):
- When `rowWidth <= viewportWidth`: compute a single centered translate so the whole group is centered.
- When `rowWidth > viewportWidth`: shift the row minimally to keep the active (or split-deal focus) hand fully visible.

## Experiment: Mobile Horizontal Scrollbar (Deferred)

Idea:
- Allow horizontal scrolling on mobile so users can pan around hands when many splits/hits occur.

What we tried:
- Added a horizontal scrollbar (`overflow-x: auto`) and an auto-scroll-to-active behavior.

Why it's deferred:
- It interacted poorly with the existing "translate the row" behavior and didn't feel predictable.
- The UX goal is "least movement" and predictable motion; scrollbar + auto-scroll introduced too much motion.

Current decision:
- Do not implement mobile scroll yet.
- Keep the single-row + minimal translate behavior.


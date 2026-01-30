# Card Dealing Sequencing & Animation Fix (Table + Card)

**Feature goal:** Make dealing animations feel *natural* and *sequential* by ensuring that **only one card at a time** is marked as “dealing”. This fixes “dealer too fast”, “multiple cards animating at once”, and “weird overlap/flash” issues.

This document is written to be **Codex-ready**: it explains what’s broken, why, and the exact implementation changes to make in `Table.tsx` and (optionally) `Card.tsx`.

---

## 1) Current Context (What you have)

### Components involved
- `Table.tsx`
  - Decides which cards are visible (`visibleCardCount` + `getDealSequenceIndex`)
  - Decides which cards are “dealing” (sets `isDealing`)
  - Controls dealer stacking (`isDealerStacked`, `dealerOffset`)
  - Controls hole-card flipping (`isRevealingHoleCard`, `isHoleCard`, `isFlipping`)
  - Controls split animations (`isSplitting`, `splitDealingPhase`)
- `Card.tsx`
  - Applies a CSS class for dealing (`dealing` / `dealing-dealer`)
  - Includes a `hasDealtRef` workaround to reduce flashes when dealing class disappears
  - Handles 3D flip container (`isHoleCard` / `isFlipping`) to keep DOM stable

### Intended deal model
- Initial deal uses a global sequence via `getDealSequenceIndex(...)` and `visibleCardCount`
- Hits / dealer draws are currently “inferred” by index and phase

---

## 2) The Problem (What’s broken)

### Root cause: Too many cards flagged as `isDealing=true`
In `Table.tsx`, these two patterns cause **many cards to be “dealing” at the same time**:

#### Dealer:
```ts
const isThisCardDealing = isInitialDeal || (phase === 'dealer-turn' && i >= 2);
```
During `dealer-turn`, *every* dealer hit card (i = 2,3,4,...) stays “dealing” for the entire phase.

#### Player:
```ts
const isHitDealing = phase === 'player-action' && cardIdx >= 2;
```
During `player-action`, *every* hit card (2nd hit onward) stays “dealing” for the entire phase.

### Symptoms
- Multiple cards animating simultaneously (feels “fast” / unnatural)
- Z-index fights (cards popping above each other unexpectedly)
- Need for stickiness hacks like `hasDealtRef` (symptom treatment, not the cause)
- Visual “flash” or “retrigger” when re-rendering during action phases

---

## 3) Design Rules (What “fixed” looks like)

1. **At most one** card is “dealing” at any moment (except if you explicitly want two-card simultaneous special effects — not recommended here).
2. During **initial deal**, dealing should be driven by `visibleCardCount` + `dealIndex`:
   - Only the newest revealed card animates.
3. During **player hits**, only the newest card of the relevant active/focus hand animates.
4. During **dealer hits**, only the newest dealer card animates.
5. Dealing animation must **not fight**:
   - `isFlipping` (hole card reveal)
   - `isRemovingCards`
   - `isSplitting` / `isSplitSettling`
6. `isVisible` should be consistent and (preferably) always use `dealIndex < visibleCardCount` when sequencing is desired.

---

## 4) Minimal Patch (Recommended Fix Using Current Architecture)

### Step A — Add a helper in `Table.tsx`
Near render logic:

```ts
const isNewestByVisible = (dealIndex: number) =>
  Number.isFinite(visibleCardCount) &&
  visibleCardCount > 0 &&
  dealIndex === visibleCardCount - 1;
```

This lets you animate **only the newest card that just became visible**.

---

### Step B — Dealer card logic: only newest card deals

#### Before
```ts
const isThisCardDealing = isInitialDeal || (phase === 'dealer-turn' && i >= 2);
```

#### After (suggested)
```ts
const isCardVisible = dealIndex < visibleCardCount;

// Initial deal: only the newest visible card animates.
const isDealerInitialDealing = isInitialDeal && isNewestByVisible(dealIndex);

// Dealer hits: only the newest dealer card animates.
const isDealerHitDealing =
  phase === 'dealer-turn' &&
  i >= 2 &&
  i === dealerHand.length - 1;

// Suppress dealing when flipping/removing to avoid competing transforms.
const isThisCardDealing =
  (isDealerInitialDealing || isDealerHitDealing) &&
  !isRevealingHoleCard &&
  !isRemovingCards;
```

Keep your z-index logic, but note it will become less critical once only one card is dealing.

---

### Step C — Player card logic: only newest visible card deals (initial), only newest hit deals (action)

#### Fix visibility condition
Currently you have:
```ts
const isCardVisible = !isInitialDeal || dealIndex < visibleCardCount;
```
This makes *everything visible* outside the initial deal, which can undermine sequencing if you also want to sequence hits later.

**Recommended change:**
```ts
const isCardVisible = dealIndex < visibleCardCount;
```
If you truly want hits always instantly visible, you can keep the old logic — but for consistent “one-at-a-time” visuals, prefer the new one.

#### Fix dealing logic
Replace:
```ts
const isThisCardDealing = isInitialDeal && cardIdx < 2;
const isHitDealing = phase === 'player-action' && cardIdx >= 2;
```
With something like:

```ts
// Initial deal: animate only the newest visible card.
const isPlayerInitialDealing = isInitialDeal && isNewestByVisible(dealIndex);

// Choose the same focus hand you already compute (important during split).
const isActiveHandForHits = handIdx === focusHandIdx;

// Player hit: animate only the newest card of the active/focus hand.
const isPlayerHitDealing =
  phase === 'player-action' &&
  splitDealingPhase === 0 &&
  !isSplitting &&
  isActiveHandForHits &&
  cardIdx >= 2 &&
  cardIdx === hand.cards.length - 1;

// Split deal card stays as you defined it, but ensure it’s exclusive.
const isDealingNow =
  (isPlayerInitialDealing || isPlayerHitDealing || isSplitDealCard) &&
  !isRemovingCards;
```

**Important:** This ensures “dealing” applies to **one specific card** only.

---

## 5) Card.tsx Improvement (Optional, but recommended)

Right now, `Card.tsx` tries to “stick” the dealing class via `hasDealtRef` to avoid flashes. Once you fix Table to only set `isDealing` on the true newest card, you can simplify this. However, if you keep it, at least **prevent dealing from competing** with other animations:

### Add a “no dealing while other anims” gate
Where you compute `dealingClass`, do:

```ts
const suppressDealing = isRemoving || isFlipping || isSplitting || isSplitSettling;
const hasDealt = (hasDealtRef.current || isDealing) && !suppressDealing;
const dealingClass = hasDealt ? (isDealerCard ? 'dealing-dealer' : 'dealing') : '';
```

This prevents transform conflicts when multiple animation classes exist.

---

## 6) Acceptance Tests / Checks (How you know it’s fixed)

### Visual checks
- During initial deal: cards appear in correct order, **one at a time**
- During player hit: only the newest hit card animates
- During dealer draw: only the newest dealer card animates
- Hole card flip: no “double movement” (flip + deal) at the same time
- Removing cards: no deal animation re-trigger during removal

### Debug check (high confidence)
Temporarily log how many cards are “dealing” each render:
- Expected max: **0 or 1** (ideally 1 only during the brief deal window)

Example quick debug (temporary):
```ts
// inside Table render, after maps (temporary)
console.log('Dealing cards count:', document.querySelectorAll('.dealing, .dealing-dealer').length);
```
(You can also count in React by accumulating flags rather than querying DOM.)

---

## 7) Clean Architecture Option (Best Long-Term)

If you want perfect control (and to stop relying on `visibleCardCount` as a proxy), pass an explicit “deal target” from the parent/game engine:

```ts
dealingTarget?: {
  who: 'dealer' | 'player';
  handIdx?: number; // required if player
  cardIdx: number;  // index within dealerHand or within playerHands[handIdx].cards
  tick: number;     // increments each time a new card is dealt
}
```

Then in `Table.tsx`, dealing becomes a strict match:
- `isDealing = dealingTarget matches this card`
- `isVisible = true` (or use target to stage visibility)

This fully decouples animation state from render heuristics and prevents regressions.

---

## 8) Codex-Ready Task (Paste This)

```txt
Fix dealing animations so only the newest card is isDealing=true.

Table.tsx:
- Add helper isNewestByVisible(dealIndex) => dealIndex === visibleCardCount-1.
- Dealer: replace (phase==='dealer-turn' && i>=2) with (i===dealerHand.length-1) and suppress during flipping/removing.
- Player: replace (phase==='player-action' && cardIdx>=2) with (cardIdx===hand.cards.length-1 && handIdx===focusHandIdx) and suppress during splitting/removing.
- Prefer isCardVisible = dealIndex < visibleCardCount for consistent sequencing.

Card.tsx (optional):
- Suppress dealingClass when isRemoving/isFlipping/isSplitting/isSplitSettling to avoid transform conflicts.
- After Table fix, consider removing or simplifying hasDealtRef if no longer needed.

Add acceptance check: at most 1 card has dealing class at a time.
```

---

## Notes / Non-goals
- This does **not** change your pip layout, suit text forcing, or stacking geometry.
- This does **not** redesign dealer stacking (your `isDealerStacked` layout can stay as-is).
- This is focused strictly on **dealing state correctness** and preventing simultaneous animations.

---

If you paste your `Card.css` dealing / removing / flipping keyframes, we can also tune easing + duration so the new sequential behavior feels even more “casino-real”.

---

## 9) Make The Pause Real (JS Timing Must Match CSS)

To achieve the "move first, pause, then deal" feel (and to guarantee no overlap), the timers in `TrainingPage.tsx` must match the *actual* CSS durations.

Recommended implementation:

- Drive card deal animation duration from a CSS variable:
  - `Card.css`: `animation-duration: calc(var(--deal-anim-ms, 350) * 1ms)`
  - `TrainingPage.tsx`: set `--deal-anim-ms` from the current `dealingSpeed` timing constants

- Drive player-row slide duration from a CSS variable:
  - `Table.css`: `transition-duration: calc(var(--player-slide-ms, 350) * 1ms)`
  - `TrainingPage.tsx`: set `--player-slide-ms` from the current `dealingSpeed` timing constants

- Use a deal interval that is *longer than* the animation duration:
  - `dealCardInterval > cardDealAnim`
  - This creates a visible "dealer pause" after each card lands.

- After a seat/camera slide, add a buffer before showing the next card:
  - `centerBuffer` should be noticeable (e.g., 60-120ms depending on speed)

This makes the sequence feel like a real dealer: one motion at a time, short pause, next card.

---

## 10) Right-Edge Slack (Reduce Micro-Slides While Hitting)

When the active player hand is near the right edge (especially on mobile), a common visual glitch is:
- the hand is flush against the right margin, and
- the next hit causes the row to slide *after* the card appears (or causes clipping/snapping during the deal animation).

To make this feel more natural and reduce horizontal movement:

- Reserve room for **1 hit card** on the active/focus hand before sliding the row.
  - Treat the active hand as if it had **3 cards total** (2-card start + 1 hit) when computing its "required right edge".
  - Keep this reserved width constant until the hand exceeds 3 cards.

When to apply slack (important):
- Only apply this slack when there are **3+ player hands** (multi-hand / split-heavy layouts) and the active/focus hand is the **rightmost** hand.
- Only apply it when the rightmost hand is actually "pressed up" against the right side of the viewport (i.e., without slack, the next hit would be clipped or would immediately force a slide). Do NOT add slack if there is already room.
- Do not apply slack globally (otherwise 1-hand / 2-hand layouts look off-center for no reason).

Expected behavior (when slack is active):
- Hit #1: **no row shift** (the slack was reserved already).
- Hit #2+: row may shift as needed.

Implementation note:
- In `Table.tsx` row-translate logic, compute a `targetWidth` for the focus hand using:
  - `targetCards = max(actualCards, 3)` while the hand is not complete
  - then use `focusCardRight = focusCardLeft + targetWidth`
- Optionally compute a `projectedRowWidth = actualRowWidth + slackAdded` and use it for centering/clamping, so the row doesn't "re-center" during the first two hits.

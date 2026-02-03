# Practice Scenarios Feature (Training Mode)

## Overview
A new "Scenario" button in the Training Mode header that opens a panel for controlling the current shoe state and generating practice scenarios for specific deviations or count situations.

## UI Location

### Header Layout
```
[← Back to Simulator]     Training Mode     [Scenario] [Stats] [Settings]
                                               ↑ NEW
```

The Scenario button sits to the left of the Stats button, using a similar icon style (e.g., a target/crosshair icon or a deck icon).

### Scenario Panel
Opens as a modal overlay (similar to Settings panel). Contains:

```
┌─────────────────────────────────────────────┐
│  Scenario Controls                      [X] │
├─────────────────────────────────────────────┤
│                                             │
│  SHOE CONTROLS                              │
│  ┌─────────────────────────────────────┐    │
│  │ [Reshuffle Now]                     │    │
│  │                                     │    │
│  │ Bankroll (units): [____1000____]    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  PRACTICE SCENARIOS                         │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │ Target True Count                   │    │
│  │ ┌─────┐                             │    │
│  │ │ +3  │  [Generate Shoe]            │    │
│  │ └─────┘                             │    │
│  │ Range: -10 to +15                   │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │ Practice Specific Deviation         │    │
│  │ ┌───────────────────────────────┐   │    │
│  │ │ I18: 16 vs 10 (Stand @ +0)  ▼│   │    │
│  │ └───────────────────────────────┘   │    │
│  │ [Generate Shoe]                     │    │
│  │                                     │    │
│  │ This will create a shoe where you  │    │
│  │ encounter this exact situation at  │    │
│  │ the threshold TC.                   │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Close]                                    │
└─────────────────────────────────────────────┘
```

## Feature 1: Shoe Controls

### Reshuffle Now
- Button that immediately reshuffles the shoe to a fresh 6-deck state
- Resets running count to 0
- Does NOT reset bankroll or stats
- Closes the panel and deals a new hand

### Bankroll Adjustment
- Number input to set current bankroll (in units)
- Already exists in Settings; this is a quick-access duplicate
- Changes take effect immediately

## Feature 2: Target True Count Scenario

### User Flow
1. User enters a target TC (e.g., +5)
2. Clicks "Generate Shoe"
3. System generates a shoe where, after some number of hands with perfect basic strategy play, the TC will reach approximately the target value
4. Panel closes, new hand is dealt
5. User plays through until they reach the high/low count situation

### Generation Algorithm (Approach A: Forward Simulation)

```typescript
function generateShoeForTargetTC(targetTC: number, numDecks: number): Card[] {
  const maxAttempts = 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Create a fresh shuffled shoe
    const shoe = createShuffledShoe(numDecks);

    // Simulate perfect play through the shoe
    let runningCount = 0;
    let cardsDealt = 0;

    // Deal hands until we either hit the target TC or run out of cards
    while (cardsDealt < shoe.length - 52) { // Leave at least 1 deck
      // Simulate one hand of perfect basic strategy
      const { cardsUsed, countChange } = simulatePerfectHand(shoe, cardsDealt);

      cardsDealt += cardsUsed;
      runningCount += countChange;

      const decksRemaining = (shoe.length - cardsDealt) / 52;
      const currentTC = runningCount / decksRemaining;

      // Check if we've hit (or passed through) the target TC
      if (isWithinRange(currentTC, targetTC, tolerance: 0.5)) {
        // Found a good shoe! Return it with cards dealt removed
        return shoe.slice(cardsDealt);
      }
    }
  }

  // Fallback: return a random shoe (rare)
  return createShuffledShoe(numDecks);
}
```

### Generation Algorithm (Approach B: Constructive)

For extreme counts (e.g., +10), forward simulation may rarely find matches. Alternative:

```typescript
function constructShoeForTargetTC(targetTC: number, numDecks: number): Card[] {
  // 1. Calculate how many cards need to be "dealt" to reach target TC
  //    with a certain number of decks remaining

  // Example: Target TC +6 with 2 decks remaining
  // Need RC = +6 * 2 = +12
  // That means 12 more low cards (2-6) than high cards (T-A) dealt

  // 2. Build the "already dealt" pile with the right count distribution
  const targetDecksRemaining = 2; // configurable
  const targetRC = targetTC * targetDecksRemaining;

  // 3. Remove those cards from a full shoe
  // 4. Shuffle the remaining cards

  return constructedShoe;
}
```

### Recommendation
Start with **Approach A (Forward Simulation)** because:
- Simpler to implement
- Produces realistic game states
- Works well for moderate counts (TC -5 to +8)

Add Approach B later for extreme counts if needed.

## Feature 3: Practice Specific Deviation

### Available Deviations (I18 + Fab4)
Dropdown populated from existing `DEVIATIONS` array in `engine/deviations.ts`:

**Illustrious 18:**
1. Insurance (TC ≥ +3)
2. 16 vs 10 - Stand (TC ≥ +0)
3. 15 vs 10 - Stand (TC ≥ +4)
4. 10,10 vs 5 - Split (TC ≥ +5)
5. 10,10 vs 6 - Split (TC ≥ +4)
6. 10 vs 10 - Double (TC ≥ +4)
7. 12 vs 3 - Stand (TC ≥ +2)
8. 12 vs 2 - Stand (TC ≥ +3)
9. 11 vs A - Double (TC ≥ +1)
10. 9 vs 2 - Double (TC ≥ +1)
11. 10 vs A - Double (TC ≥ +4)
12. 9 vs 7 - Double (TC ≥ +3)
13. 16 vs 9 - Stand (TC ≥ +5)
14. 13 vs 2 - Stand (TC ≥ -1)
15. 12 vs 4 - Stand (TC ≥ 0)
16. 12 vs 5 - Hit (TC < -2)
17. 12 vs 6 - Hit (TC < -1)
18. 13 vs 3 - Hit (TC < -2)

**Fab 4 Surrenders:**
1. 14 vs 10 - Surrender (TC ≥ +3)
2. 15 vs 10 - Surrender (TC ≥ 0)
3. 15 vs 9 - Surrender (TC ≥ +2)
4. 15 vs A - Surrender (TC ≥ +1)

### User Flow
1. User selects a deviation from dropdown
2. Clicks "Generate Shoe"
3. System generates a shoe where:
   - The player will be dealt the specific hand (e.g., hard 16)
   - The dealer will show the specific upcard (e.g., 10)
   - The true count will be at or near the deviation threshold
4. Panel closes, the scenario hand is dealt
5. User must make the correct deviation play

### Generation Algorithm

```typescript
function generateShoeForDeviation(deviation: Deviation, numDecks: number): {
  shoe: Card[];
  playerCards: Card[];
  dealerUpcard: Card;
} {
  const { playerTotal, dealerUp, tcThreshold, isSoft, isPair } = deviation;

  // 1. First, generate a shoe state that reaches the target TC
  //    (use the TC generation algorithm above)
  const baseShoe = generateShoeForTargetTC(tcThreshold, numDecks);

  // 2. Construct the player's hand
  let playerCards: Card[];
  if (isPair) {
    // e.g., 10,10 vs 5 → two ten-value cards
    playerCards = extractPair(baseShoe, playerTotal / 2);
  } else if (isSoft) {
    // e.g., soft 18 → Ace + 7
    playerCards = extractSoftHand(baseShoe, playerTotal);
  } else {
    // e.g., hard 16 → could be 10+6, 9+7, etc.
    playerCards = extractHardHand(baseShoe, playerTotal);
  }

  // 3. Extract dealer's upcard
  const dealerUpcard = extractCard(baseShoe, dealerUp);

  // 4. Extract dealer's hole card (random non-ace to avoid blackjack complications)
  const dealerHoleCard = extractRandomCard(baseShoe, excludeAces: true);

  // 5. Arrange the shoe so these cards come out first
  const arrangedShoe = [
    dealerHoleCard,  // First card dealt (face down)
    playerCards[0],  // Player's first card
    dealerUpcard,    // Dealer's upcard
    playerCards[1],  // Player's second card
    ...remainingShoe // Rest of the shoe
  ];

  return { shoe: arrangedShoe, playerCards, dealerUpcard };
}
```

### Edge Cases
- **Pair deviations (10,10 vs 5/6):** Must ensure two ten-value cards are dealt to player
- **Insurance:** Dealer must show Ace; generate shoe at TC ≥ +3
- **Negative TC deviations (12 vs 5 Hit @ TC < -2):** Generate shoe at TC -3 or lower

## Implementation Plan

### Phase 1: UI Shell
- [ ] Add Scenario button to header (icon + click handler)
- [ ] Create ScenarioPanel component (modal overlay)
- [ ] Add Reshuffle button (simple state reset)
- [ ] Add Bankroll quick-edit input

### Phase 2: Target TC Generation
- [ ] Implement `simulatePerfectHand()` helper
- [ ] Implement `generateShoeForTargetTC()` with forward simulation
- [ ] Add TC input + Generate button to panel
- [ ] Wire up to replace current shoe and deal

### Phase 3: Deviation Practice
- [ ] Build deviation dropdown from existing DEVIATIONS array
- [ ] Implement `generateShoeForDeviation()`
- [ ] Implement card extraction helpers (extractPair, extractHardHand, etc.)
- [ ] Implement shoe arrangement to deal specific hands
- [ ] Add "Generate Shoe" button for deviations

### Phase 4: Polish
- [ ] Loading state while generating (can take a moment)
- [ ] Toast/feedback when scenario is ready
- [ ] Track deviation practice accuracy separately in stats
- [ ] Add "Quick Practice" buttons for most common deviations (16v10, Insurance, etc.)

## Files to Create/Modify

### New Files
- `frontend/src/components/training/ScenarioPanel.tsx` — UI component
- `frontend/src/components/training/ScenarioPanel.css` — Styles
- `frontend/src/components/training/engine/scenarioGenerator.ts` — Generation algorithms

### Modified Files
- `frontend/src/components/training/TrainingPage.tsx` — Add Scenario button, panel state
- `frontend/src/components/training/TrainingPage.css` — Button styles
- `frontend/src/components/training/types.ts` — Any new types needed

## Open Questions

1. **Max generation time:** How long should we try before giving up? (Suggest: 2 seconds / 1000 attempts)

2. **TC tolerance:** How close to the target TC is "good enough"? (Suggest: ±0.5)

3. **Decks remaining for deviation scenarios:** Should we aim for a specific penetration, or just any valid state? (Suggest: aim for 2-4 decks remaining for realism)

4. **Multiple deviations in one shoe:** Future feature — generate a shoe that will encounter several deviation situations in sequence?

5. **Count verification UI:** Should we show "Target: TC +5, Actual: TC +4.8" after generation? (Suggest: Yes, brief toast message)

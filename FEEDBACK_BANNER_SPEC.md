# Persistent Feedback Banner with Undo

## Overview
Upgrade the inline feedback banner (shown when a player makes an incorrect decision) to be persistent with action buttons, giving users time to digest the feedback and optionally undo their mistake.

## Current Behavior
- Banner appears briefly (~1.5 seconds) after an incorrect decision
- Auto-dismisses via timer
- No way to undo — the incorrect action is already applied
- User must continue playing with the mistake

## New Behavior
- Banner **persists** until explicitly dismissed (no auto-dismiss timer)
- Contains two action buttons: **Undo** and **X (dismiss)**
- User can take their time reading the feedback
- Undo reverts the game state to before the incorrect action
- Dismiss accepts the mistake and continues play

## Decision Legality (IMPORTANT)
Some recommendations only make sense at a specific *decision point*:
- **Double / Surrender**: only legal on a 2-card hand (and surrender is typically not allowed on split hands).
- **Split**: only legal on a 2-card pair, and subject to rules (max splits, resplit aces, etc).

Training Mode must not mark a move as "wrong" for failing to Double/Surrender/Split when the action is not legal *right now*
(example: a 3-card total of 9 vs 2 should not be flagged as "missed 9v2 Double" because doubling is no longer allowed).

## UI Design

### Banner Layout (Incorrect Decision)
```
┌─────────────────────────────────────────────────────────────────┐
│  ✗ Incorrect: You hit, should STAND                    [Undo] [X] │
│    16 vs 10 at TC +1 — Stand per I18 deviation                   │
└─────────────────────────────────────────────────────────────────┘
```

### Banner Layout (Correct Decision)
```
┌─────────────────────────────────────────────────────────────────┐
│  ✓ Correct: STAND                                           [X] │
│    16 vs 10 at TC +1 — I18 deviation play                       │
└─────────────────────────────────────────────────────────────────┘
```

- Correct decisions: brief auto-dismiss (keep current ~1.5s behavior) OR dismiss button only
- Incorrect decisions: persistent with Undo + X buttons

### Button Styles
- **Undo button:** Primary action, highlighted (e.g., blue/teal background)
- **X button:** Secondary, subtle (e.g., transparent with icon)

### Visual States
```css
/* Incorrect — persistent, red-tinted */
.feedback-banner.incorrect {
  background: rgba(231, 76, 60, 0.15);
  border-left: 3px solid #e74c3c;
}

/* Correct — brief, green-tinted (existing) */
.feedback-banner.correct {
  background: rgba(46, 204, 113, 0.15);
  border-left: 3px solid #2ecc71;
}
```

## Undo Functionality

### State Management
TrainingPage already has `preActionStateRef` that stores the game state before each action. This is used for the modal "Take it back" feature.

```typescript
// Existing ref (already implemented for modal mode)
const preActionStateRef = useRef<GameState | null>(null);

// Before each action:
preActionStateRef.current = gameState;
```

### Undo Flow
1. User makes incorrect decision (e.g., hits on 16 vs 10 at TC +1)
2. Action is applied, card is dealt, banner appears
3. Banner persists with Undo button
4. **If user clicks Undo:**
   - Restore `preActionStateRef.current` as the current game state
   - Clear the dealt card animation
   - Clear the feedback banner
   - User can now make a different decision
5. **If user clicks X:**
   - Dismiss banner
   - Continue with the (incorrect) game state
   - Stats already recorded the mistake

### Edge Cases

#### Card Already Dealt
When the user hits incorrectly, a card has already been dealt and animated. On undo:
- The dealt card should disappear (no reverse animation needed — just remove it)
- The hand returns to its pre-hit state

#### Bust After Incorrect Hit
If the incorrect hit caused a bust:
- Undo should still work (restore pre-bust state)
- The bust badge disappears
- User can make a different choice

#### Double/Split Undo
- **Double:** Undo removes the doubled card and un-doubles the bet
- **Split:** More complex — undo would need to "unsplit" the hand
  - **Recommendation:** For MVP, disable Undo for split actions (too complex)
  - Show "Cannot undo split" or just don't show Undo button for splits

#### Dealer Turn Already Started
If the incorrect action caused the hand to complete and dealer turn to begin:
- **Option A:** Disable Undo once dealer turn starts (simpler)
- **Option B:** Undo reverts to player turn (more complex, better UX)
- **Recommendation:** Option A for MVP

#### Stats Already Recorded
The mistake is recorded in stats when the action happens. On undo:
- **Option A:** Don't modify stats (mistake still counts)
- **Option B:** Decrement the mistake counter
- **Recommendation:** Option A — the user DID make the mistake initially; undo is for learning, not erasing history

## Implementation

### Modified Files
- `frontend/src/components/training/FeedbackPanel.tsx`
- `frontend/src/components/training/FeedbackPanel.css`
- `frontend/src/components/training/TrainingPage.tsx`

### FeedbackPanel Props Update
```typescript
interface FeedbackPanelProps {
  lastDecision: LastDecision | null;
  visible: boolean;
  compact?: boolean;
  // NEW:
  onUndo?: () => void;      // Called when Undo clicked
  onDismiss?: () => void;   // Called when X clicked
  canUndo?: boolean;        // Whether Undo is available
}
```

### TrainingPage Changes

```typescript
// New state for banner persistence
const [feedbackDismissed, setFeedbackDismissed] = useState(false);

// Handle undo
const handleFeedbackUndo = useCallback(() => {
  if (!preActionStateRef.current) return;

  // Restore previous state
  setGameState(preActionStateRef.current);
  preActionStateRef.current = null;

  // Clear feedback
  setLastDecision(null);
  setFeedbackDismissed(false);

  // Reset any animation states
  setActionLocked(false);
  setShowBadges(true);
}, []);

// Handle dismiss
const handleFeedbackDismiss = useCallback(() => {
  setFeedbackDismissed(true);
  // Keep lastDecision for potential stats display, but hide banner
}, []);

// Determine if undo is available
const canUndoLastAction = useMemo(() => {
  if (!lastDecision || !preActionStateRef.current) return false;
  if (lastDecision.isCorrect) return false; // No need to undo correct actions
  if (gameState.phase !== 'player-action') return false; // Too late
  if (lastDecision.userAction === 'split') return false; // Too complex
  return true;
}, [lastDecision, gameState.phase]);

// Banner visibility logic
const showFeedbackBanner = useMemo(() => {
  if (!lastDecision) return false;
  if (feedbackDismissed) return false;
  if (settings.correctionMode !== 'inline') return false;
  if (settings.onlyShowMistakes && lastDecision.isCorrect) return false;
  return true;
}, [lastDecision, feedbackDismissed, settings]);
```

### Remove Auto-Dismiss Timer (for incorrect only)
```typescript
// Current: auto-dismiss after 1.5s
useEffect(() => {
  if (!lastDecision) return;

  // NEW: Only auto-dismiss correct decisions
  if (lastDecision.isCorrect) {
    const dismissTimer = window.setTimeout(() => {
      setLastDecision(null);
    }, 1500);
    return () => window.clearTimeout(dismissTimer);
  }

  // Incorrect decisions: no auto-dismiss (persistent)
}, [lastDecision]);
```

### Reset Dismissed State on New Decision
```typescript
// When a new decision is made, reset the dismissed flag
useEffect(() => {
  if (lastDecision) {
    setFeedbackDismissed(false);
  }
}, [lastDecision]);
```

## Visual Mockup

### Incorrect Decision (Persistent)
```
┌────────────────────────────────────────────────────────────────────┐
│ ✗  You chose HIT — correct play is STAND          [↩ Undo]  [✕]  │
│    Hard 16 vs 10 • TC +1 • I18: Stand at TC ≥ 0                   │
└────────────────────────────────────────────────────────────────────┘
```

### Correct Decision (Auto-dismiss after 1.5s)
```
┌────────────────────────────────────────────────────────────────────┐
│ ✓  Correct: STAND                                            [✕]  │
│    Hard 16 vs 10 • TC +1 • I18 deviation                          │
└────────────────────────────────────────────────────────────────────┘
```

### After Undo
- Banner disappears
- Game state reverts to before the action
- User sees their original hand (no extra card)
- User can now choose a different action

## Open Questions

1. **Undo for stand/surrender?** These don't deal a card, so undo is simpler. Should we allow it?
   - Recommendation: Yes, allow undo for all actions except split

2. **Multiple undos?** If user undos, makes another mistake, can they undo again?
   - Recommendation: Yes, each action saves a new preActionState

3. **Undo button position?** Left or right of X?
   - Recommendation: Left (primary action should be first)

4. **Keyboard shortcut for undo?** e.g., Ctrl+Z or just 'U'
   - Recommendation: Add 'U' key for undo (matches Undo button)

5. **Animation on undo?** Should the dealt card animate back to the shoe?
   - Recommendation: No animation for MVP — just disappear. Simpler and faster.

## Future Enhancements

1. **Undo for split:** Track the pre-split state and fully restore it
2. **Undo history:** Allow multiple levels of undo (undo the undo)
3. **"Show me" mode:** After showing correct play, auto-play it so user sees the result
4. **Explanation expansion:** Tap banner to see detailed strategy explanation

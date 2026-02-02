# Training Mode State + Bankroll (Current Implementation)

## Goals
- Keep Training Mode usable on mobile (including GitHub Pages).
- Persist enough state so leaving/reloading does not wipe the session.
- Treat all wagers as **1 unit** (training focuses on decisions and count, not bet sizing).

## What Is Persisted
Training Mode uses localStorage:

- Settings: `blackjack-training-settings`
- Stats: `blackjack-training-stats`
- Game state (shoe + current hand + bankroll): `blackjack-training-game-state`

### Game State Persistence Rules
We only persist game state during safe phases to avoid saving mid-animation states:

- Persisted phases:
  - `idle`
  - `betting`
  - `insurance`
  - `player-action`
- Not persisted:
  - `dealing`
  - `dealer-turn`
  - `payout` (including removal animation)

On load, we restore only if:
- the stored version matches, and
- the stored `numDecks` matches the current TrainingPage config, and
- the stored phase is one of the safe phases above.

## Bankroll + $/Unit
Training Settings now includes:

- `bankrollUnits`: current bankroll in **units** (used by the training engine)
- `dollarsPerUnit`: UI conversion helper (display-only; does not affect gameplay)

In the Settings panel:
- **Bet / Hand (units)** is shown as `1 (fixed)`
- **Bankroll (units)** is editable and also updates the current game state's bankroll
- **$ / Unit** is editable for conversions (future UI/Stats usage)

## Implementation Files
- `frontend/src/components/training/types.ts` (settings fields + defaults)
- `frontend/src/components/training/TrainingPage.tsx` (load/save settings/stats/game state)
- `frontend/src/components/training/engine/gameEngine.ts` (bankroll is tracked in units)


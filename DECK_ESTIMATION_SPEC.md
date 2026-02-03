# Deck Estimation Visualization (Training Mode)

## Purpose
This feature provides a visual "discard tray / shoe depth" cue so players can practice converting running count (RC) into true count (TC) by estimating decks remaining.

In Training Mode, it is implemented as a card-sized image that represents shoe depth.

## Assets
- Location: `frontend/public/assets/deck-estimation/`
- Files: `000.webp` .. `363.webp` (364 images)
- Baseline: image set is calibrated to a 6-deck shoe (312 cards)

## Image Mapping
The image index is chosen by how many cards have been dealt from a 6-deck (312-card) shoe:

```ts
// 000.webp = full shoe (312 cards remaining)
// 312.webp = empty shoe (0 cards remaining)
const getImageFilename = (cardsRemaining: number): string => {
  const imageNumber = Math.max(0, Math.min(363, 312 - cardsRemaining));
  return `${String(imageNumber).padStart(3, "0")}.webp`;
};
```

Note: if Training Mode is ever used with a non-6-deck shoe, this mapping should be generalized (currently it assumes 312 max).

## UI Placement (Final)
When enabled, the deck estimation image is rendered:
- Card-sized
- Directly to the LEFT of the dealer hole card (aligned with the dealer stack)
- Without shifting the dealer cards off-center (it is absolutely positioned inside the dealer stack wrapper)

Conceptually:

```
[ Deck Estimation ] [ Dealer Hole ] [ Dealer Upcard ] [...]
```

The discard pile visualization is hidden while deck estimation is enabled.

## Sizing / Cropping Rules
- The image matches the same dimensions as the training cards (it follows `.card-large` sizes and scales with `--card-scale`).
- The image uses `object-fit: contain` to avoid cropping (the full photo is always visible).

## Freeze / Flicker Rules
To avoid flicker while the dealer is drawing cards or while cards are being removed from the table, the displayed image does NOT update continuously.

Implementation:
- TrainingPage owns a frozen value `deckEstimationCards`.
- That value updates only during safe phases:
  - `idle`
  - `betting`
  - `insurance`
  - `player-action`
- The value is intentionally NOT updated during:
  - `dealer-turn`
  - `payout` (including the card removal animation)

This prevents the deck image from changing mid-dealer-play or mid-removal.

## Tooltip / Decks Remaining Display
The deck estimation tooltip uses whole-deck (full-deck) estimation:

- `decksRemaining = floor(cardsRemaining / 52)`

Example:
- `4 decks remaining (209 cards)`

## GitHub Pages Support
Because the frontend is deployed as a GitHub Pages project site (`/<repo>/`), deck-estimation images must be loaded relative to Vite's `BASE_URL`:

- `imagePath = ${import.meta.env.BASE_URL}assets/deck-estimation/<file>.webp`

## Implementation Files
- `frontend/src/components/training/DeckEstimationImage.tsx`
- `frontend/src/components/training/DeckEstimationImage.css`
- `frontend/src/components/training/Table.tsx`
- `frontend/src/components/training/Table.css`
- `frontend/src/components/training/TrainingPage.tsx`


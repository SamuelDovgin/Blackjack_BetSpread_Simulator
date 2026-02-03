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
- The image is stretched to fill the card-sized box (no letterboxing). This keeps the discard tray photo exactly the same height as the dealer cards.

## Freeze / Flicker Rules
To avoid flicker and to match how a real discard tray "updates" at the end of a round, the displayed image does NOT update continuously.

Implementation:
- TrainingPage owns a frozen value `deckEstimationCards`.
- That value updates **once per round**, at the moment cards begin moving off the table (the removal animation starts).
- The value is intentionally NOT updated card-by-card during player hits or dealer draws.
- If a shuffle happens (new shoe), the deck image is reset immediately to full shoe.

This prevents the deck image from changing mid-dealer-play or mid-removal, and keeps the visual cue stable during decision-making.

## Layout Details
- The deck image stays rendered whenever the setting is enabled (it should not "blink" between rounds).
- The dealer stack wrapper has a fixed height equal to card height to avoid vertical "jumping" as dealer cards become visible.
- Spacing between the deck image and the hole card:
  - Uses a comfortable default gap (~55% of card width) on wide screens.
  - Never collapses below a minimum gap (~50% of stacked card offset) so it doesn't look like it "touches" the hole card.
- **Narrow-screen behavior (responsive gap compression):**
  - Keep a small left-edge margin (8-12px) so the deck image never touches the viewport edge.
  - As the screen narrows, the gap between the deck image and the hole card **shrinks first** (compresses toward the hole card).
  - The dealer upcard stays visible as long as possible — only shifts off-screen if even the minimum gap cannot fit.
  - This prioritizes keeping all dealer cards visible over maintaining a large gap.

## Styling
- The deck image has **no card-like shadow** (it is a photo cue, not a playing card).
- There is no "card-like" placeholder background while loading; the image simply appears once loaded.
- When the deck image changes, it swaps only after the next file is preloaded (prevents flicker).

## Tooltip / Decks Remaining Display
The deck estimation tooltip uses whole-deck (full-deck) estimation:

- `decksRemaining = floor(cardsRemaining / 52)`

Example:
- `4 decks remaining (209 cards)`

## GitHub Pages Support
Because the frontend is deployed as a GitHub Pages project site (`/<repo>/`), deck-estimation images must be loaded relative to Vite's `BASE_URL`:

- `imagePath = ${import.meta.env.BASE_URL}assets/deck-estimation/<file>.webp`

## Count Bar (Divisor / True Count)
Training Mode shows both the estimated (human-style) and exact math values:
- `Divisor`: quantized decks remaining (full-deck conservative/ceil or half-deck step depending on training settings)
- `True`: TC computed from RC / divisor, then quantized per training setting
- `Exact Div`: exact decks remaining (`shoe.length / 52`, shown to 1 decimal)
- `Exact TC`: exact TC (`RC / exactDiv`, shown to 1 decimal)

## Implementation Files
- `frontend/src/components/training/DeckEstimationImage.tsx`
- `frontend/src/components/training/DeckEstimationImage.css`
- `frontend/src/components/training/Table.tsx`
- `frontend/src/components/training/Table.css`
- `frontend/src/components/training/TrainingPage.tsx`

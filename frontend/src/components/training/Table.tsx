// Table Component
// Green felt casino table with dealer and player hands
// Cards deal from off-screen right with proper sequencing
//
// DEALER CARD STACKING FLOW:
// 1. Initial deal: Hole card (face down) on LEFT, upcard (face up) on RIGHT - side by side
// 2. After player done (or auto-stand on 21): Flip hole card
// 3. Slide upcard LEFT to overlap hole card vertically (only left edge of hole card visible)
// 4. Additional dealer hits stack the same way - each card covers previous, showing only left edge

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Card, Shoe, DiscardPile } from './Card';
import { DeckEstimationImage } from './DeckEstimationImage';
import type { Card as CardType, HandState, GamePhase } from './types';
import { calculateHandTotal, calculateFullHandTotal } from './engine/gameEngine';
import './Table.css';

interface TableProps {
  /** Monotonically increasing counter for each dealt round. Used to ensure card animations reset per round. */
  roundNumber: number;
  dealerHand: CardType[];
  playerHands: HandState[];
  activeHandIndex: number;
  phase: GamePhase;
  showDealerTotal?: boolean;
  /** Whether to show hand totals (default: false for realistic practice) */
  showHandTotals?: boolean;
  /** Number of cards remaining in shoe */
  cardsRemaining?: number;
  /** Total cards in shoe (for percentage display) */
  totalCards?: number;
  /** Number of cards that have been discarded (for discard pile) */
  cardsDiscarded?: number;
  /** Number of cards visible (for sequential dealing animation) */
  visibleCardCount?: number;
  /** Whether dealer hole card is being revealed (flipping animation) */
  isRevealingHoleCard?: boolean;
  /** Whether cards are being removed (animating off screen left) */
  isRemovingCards?: boolean;
  /** Whether dealer cards are stacked (after hole card reveal) */
  isDealerStacked?: boolean;
  /** Whether to show status badges like BUST/BLACKJACK (delayed until animation done) */
  showBadges?: boolean;
  /** Whether cards are being split (top card animating to new position) */
  isSplitting?: boolean;
  /** Split dealing phase: 0=none, 1=dealing to right, 2=dealing to left */
  splitDealingPhase?: number;
  /** Which hand index initiated the current split (used to keep animations stable while centering) */
  splitOriginHandIndex?: number | null;
  /** Card scale name ('small' | 'medium' | 'large') — controls card/offset sizing */
  cardScale?: string;
  /** Whether to show deck estimation image to the left of the shoe */
  showDeckEstimation?: boolean;
  /** Frozen cards remaining for deck estimation (doesn't update during dealer/payout) */
  deckEstimationCards?: number;
}

// Base card layout constants at scale=1.0 — multiplied by cardScale prop at runtime.
// Desktop base values
const BASE_PLAYER_OFFSET_DESKTOP = { x: 19, y: -28 };
const BASE_CARD_SIZE_DESKTOP = { w: 90, h: 126 };
// Dealer initial (two-card) layout: keep the two cards slightly closer than "card width + 10px"
// so scaling up doesn't feel like the upcard drifts too far right.
const BASE_DEALER_INITIAL_DESKTOP = { x: 98, y: 0 };
const BASE_DEALER_STACKED_DESKTOP = { x: 19, y: 0 };
// Mobile base values (not scaled — mobile uses its own CSS base sizes)
const BASE_PLAYER_OFFSET_MOBILE = { x: 15, y: -22 };
const BASE_CARD_SIZE_MOBILE = { w: 70, h: 98 };
const BASE_DEALER_INITIAL_MOBILE = { x: 76, y: 0 };
const BASE_DEALER_STACKED_MOBILE = { x: 15, y: 0 };

/** Scale name → numeric multiplier */
export const CARD_SCALE_VALUES: Record<string, number> = {
  small: 1.0,
  medium: 1.2,
  large: 1.5,
  xlarge: 1.8,
};

/**
 * Get the global deal sequence index for a card.
 * Supports 1-3 starting player hands.
 *
 * Deal order (N hands):
 * - Player first card to each hand left-to-right (N cards)
 * - Dealer hole card (face down)
 * - Player second card to each hand left-to-right (N cards)
 * - Dealer upcard (face up)
 * Then hits continue sequentially from there (player first, then dealer).
 */
function getDealSequenceIndex(
  isDealer: boolean,
  cardIndex: number,
  totalPlayerCards: number,
  totalDealerCards: number,
  playerHandsCount: number
): number {
  const nHands = Math.max(1, Math.floor(playerHandsCount));
  const initialPlayerCards = 2 * nHands;
  const initialTotalCards = initialPlayerCards + 2; // + dealer hole + dealer upcard

  // Initial deal mapping (player cardIndex is global across all player hands).
  if (!isDealer) {
    if (cardIndex < initialPlayerCards) {
      const seat = Math.floor(cardIndex / 2);
      const within = cardIndex % 2; // 0=first card, 1=second card
      if (within === 0) return seat;
      // Dealer hole card happens after all first cards.
      return nHands + 1 + seat;
    }

    // Player hits: after initial deal, continue sequentially from there.
    return initialTotalCards + (cardIndex - initialPlayerCards);
  }

  // Dealer initial cards.
  if (cardIndex === 0) return nHands; // hole card after first round of player cards
  if (cardIndex === 1) return (2 * nHands) + 1; // upcard after second round of player cards

  // Dealer hits: after initial deal + all player cards (including hits/splits).
  return initialTotalCards + Math.max(0, totalPlayerCards - initialPlayerCards) + (cardIndex - 2);
}

type StackOutline = {
  d: string;
  width: number;
  height: number;
  left: number;
  top: number;
};

function buildStackOutlinePath(
  nCards: number,
  dx: number,
  dy: number,
  cardW: number,
  cardH: number,
  margin: number
): StackOutline | null {
  if (nCards <= 0) return null;

  const m = margin;
  const W = cardW;
  const H = cardH;

  // Expand each card by margin on all sides so the outline "breathes" around the stack.
  const points: Array<{ x: number; y: number }> = [];

  // Bottom-left of base card (expanded)
  points.push({ x: -m, y: H + m });
  // Top-left of base card (expanded)
  points.push({ x: -m, y: -m });

  // Left-side staircase up to the top of the last card.
  for (let i = 1; i < nCards; i++) {
    // Step right at the previous card's top edge
    points.push({ x: (dx * i) - m, y: (dy * (i - 1)) - m });
    // Then step up to this card's top edge
    points.push({ x: (dx * i) - m, y: (dy * i) - m });
  }

  // Top edge of last card to its top-right.
  points.push({ x: (dx * (nCards - 1)) + W + m, y: (dy * (nCards - 1)) - m });
  // Down the right edge of last card (expanded)
  points.push({ x: (dx * (nCards - 1)) + W + m, y: (dy * (nCards - 1)) + H + m });

  // Right-side staircase back down to the base card bottom.
  for (let i = nCards - 2; i >= 0; i--) {
    // Step left at the next card's bottom edge
    points.push({ x: (dx * i) + W + m, y: (dy * (i + 1)) + H + m });
    // Then step down to this card's bottom edge
    points.push({ x: (dx * i) + W + m, y: (dy * i) + H + m });
  }

  // Close along the bottom back to the origin point.
  points.push({ x: -m, y: H + m });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  const sx = -minX;
  const sy = -minY;

  const d = points
    .map((p, idx) => {
      const x = (p.x + sx).toFixed(2);
      const y = (p.y + sy).toFixed(2);
      return `${idx === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ') + ' Z';

  return { d, width, height, left: minX, top: minY };
}

export const Table: React.FC<TableProps> = ({
  roundNumber,
  dealerHand,
  playerHands,
  activeHandIndex,
  phase,
  showDealerTotal = false,
  showHandTotals = false,
  cardsRemaining = 312,
  totalCards = 312,
  cardsDiscarded = 0,
  visibleCardCount = 999, // Default to all visible
  isRevealingHoleCard = false,
  isRemovingCards = false,
  isDealerStacked = false,
  showBadges = true, // Default to showing badges
  isSplitting = false,
  splitDealingPhase = 0,
  splitOriginHandIndex = null,
  cardScale: cardScaleName = 'medium',
  showDeckEstimation = true,
  deckEstimationCards,
}) => {
  const isMobile =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  const showDeckEstimationImage = !!showDeckEstimation;

  const newestVisibleDealIndex =
    Number.isFinite(visibleCardCount) && visibleCardCount > 0 ? visibleCardCount - 1 : -1;
  const isNewestByVisible = (dealIndex: number) => dealIndex === newestVisibleDealIndex;

  // Track previous card counts so we can mark only the *newly added* card as "dealing".
  // This prevents "the last card is always dealing" during player-action / dealer-turn.
  const prevDealerCountRef = useRef<number>(dealerHand.length);
  const prevPlayerCountsRef = useRef<number[]>(playerHands.map((h) => h.cards.length));
  const prevDealerCount = prevDealerCountRef.current;
  const prevPlayerCounts = prevPlayerCountsRef.current;

  useEffect(() => {
    prevDealerCountRef.current = dealerHand.length;
    prevPlayerCountsRef.current = playerHands.map((h) => h.cards.length);
  }, [dealerHand.length, playerHands]);

  const scaleFactor = CARD_SCALE_VALUES[cardScaleName] ?? 1.2;
  const scaleBase = (base: { w: number; h: number }) => ({
    w: Math.round(base.w * (isMobile ? scaleFactor : scaleFactor)),
    h: Math.round(base.h * (isMobile ? scaleFactor : scaleFactor)),
  });
  const scaleOffset = (base: { x: number; y: number }) => ({
    x: Math.round(base.x * scaleFactor),
    y: Math.round(base.y * scaleFactor),
  });

  const cardSize = scaleBase(isMobile ? BASE_CARD_SIZE_MOBILE : BASE_CARD_SIZE_DESKTOP);
  const cardW = cardSize.w;
  const cardH = cardSize.h;

  // Player hands are always a single row. When the row fits, keep it centered as a group.
  // When it doesn't fit, shift the row *minimally* to keep the currently active hand visible.
  const playerViewportRef = useRef<HTMLDivElement | null>(null);
  const [playerViewportWidth, setPlayerViewportWidth] = useState(0);
  const [playerRowTranslateX, setPlayerRowTranslateX] = useState(0);
  // Disable the translate transition until we've measured the viewport once.
  // This avoids the "first deal finds its spot" look when the width goes 0 -> measured.
  const [centerTransitionEnabled, setCenterTransitionEnabled] = useState(false);

  useLayoutEffect(() => {
    const el = playerViewportRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      setPlayerViewportWidth(w);
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [playerHands.length]);

  useEffect(() => {
    if (centerTransitionEnabled) return;
    if (playerViewportWidth <= 0) return;

    const id = window.setTimeout(() => setCenterTransitionEnabled(true), 0);
    return () => window.clearTimeout(id);
  }, [playerViewportWidth, centerTransitionEnabled]);

  // Calculate visible dealer total (only face-up cards)
  const dealerVisible = calculateHandTotal(dealerHand);
  const dealerFull = calculateFullHandTotal(dealerHand);
  const showFullDealer = showDealerTotal || phase === 'payout' || phase === 'dealer-turn';
  const dealerIsBusted = dealerFull.total > 21;
  const dealerIsBlackjack = dealerHand.length === 2 && dealerFull.total === 21;

  // Dealer outcome is only well-defined when there is a single player hand (no splits).
  const dealerOutcome = useMemo(() => {
    if (phase !== 'payout') return null;
    if (playerHands.length !== 1) return null;
    const r = playerHands[0]?.result ?? null;
    if (!r) return null;
    if (r === 'push') return 'push' as const;
    // Player blackjack is still a player win (dealer lose).
    if (r === 'win' || r === 'blackjack') return 'lose' as const;
    if (r === 'lose') return 'win' as const;
    return null;
  }, [phase, playerHands]);

  // Count total player cards for sequencing
  const totalPlayerCards = playerHands.reduce((sum, h) => sum + h.cards.length, 0);
  const totalDealerCards = dealerHand.length;

  // Determine if we're in the initial dealing phase (first 4 cards)
  const isInitialDeal = phase === 'dealing';

  const playerCardOffset = scaleOffset(isMobile ? BASE_PLAYER_OFFSET_MOBILE : BASE_PLAYER_OFFSET_DESKTOP);
  const dealerInitialOffset = scaleOffset(isMobile ? BASE_DEALER_INITIAL_MOBILE : BASE_DEALER_INITIAL_DESKTOP);
  const dealerStackedOffset = scaleOffset(isMobile ? BASE_DEALER_STACKED_MOBILE : BASE_DEALER_STACKED_DESKTOP);

  // Dealer offset changes based on whether cards are stacked
  const dealerOffset = isDealerStacked ? dealerStackedOffset : dealerInitialOffset;

  // Keep the dealer stack container width stable across the "stacking" transition so
  // the hole card doesn't snap due to flex centering when the width shrinks.
  // We anchor the container to the initial 2-card spread width; any additional dealer
  // draw cards can overflow to the right (more like a real table).
  const dealerStackWidth = cardW + dealerInitialOffset.x;

  // Deck estimation image spacing + dealer stack shift:
  // When deck estimation is enabled, shift the dealer stack LEFT so the deck image
  // and dealer cards are both visible. The gap between deck image and hole card
  // shrinks on narrow screens before the upcard goes off-screen.
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
  const deckEdgeMarginLeftPx = isMobile ? 8 : 12;

  // Gap between deck estimation image and hole card.
  const deckEstDesiredGapPx = Math.round(cardW * 0.3); // Tighter gap
  const deckEstMinGapPx = Math.round(dealerStackedOffset.x * 0.4); // Minimum gap

  // When deck estimation is OFF, use the original centering shift.
  // When deck estimation is ON, don't shift right — keep dealer stack more centered/left.
  const baseShiftWithoutDeckEst = isMobile ? Math.round(cardW * 0.28) : Math.round(cardW * 0.5);

  // Calculate where the dealer stack sits when centered (no shift).
  const baseDealerLeftPx = viewportW ? Math.floor((viewportW - dealerStackWidth) / 2) : 0;

  let deckEstGapPx = 0;
  let dealerCardShiftPx = 0;

  if (showDeckEstimationImage && viewportW) {
    // Space needed on the left for deck image: edge margin + card width + gap.
    const spaceNeededWithDesiredGap = deckEdgeMarginLeftPx + cardW + deckEstDesiredGapPx;
    const spaceNeededWithMinGap = deckEdgeMarginLeftPx + cardW + deckEstMinGapPx;

    // How much space do we have on the left if we don't shift?
    const availableLeftNoShift = baseDealerLeftPx;

    if (availableLeftNoShift >= spaceNeededWithDesiredGap) {
      // Plenty of room — use desired gap, no shift needed.
      deckEstGapPx = deckEstDesiredGapPx;
      dealerCardShiftPx = 0;
    } else if (availableLeftNoShift >= spaceNeededWithMinGap) {
      // Some room — shrink the gap to fit, no shift needed.
      deckEstGapPx = Math.max(deckEstMinGapPx, availableLeftNoShift - deckEdgeMarginLeftPx - cardW);
      dealerCardShiftPx = 0;
    } else {
      // Not enough room even with min gap — shift dealer stack right minimally.
      deckEstGapPx = deckEstMinGapPx;
      dealerCardShiftPx = spaceNeededWithMinGap - availableLeftNoShift;
    }
  } else {
    // No deck estimation — use original shift behavior.
    dealerCardShiftPx = baseShiftWithoutDeckEst;
  }

  // Dynamic spacing: each hand's allocated width grows with its card count.
  // This prevents long hit stacks from overlapping neighboring split hands.
  const playerHandGapPx = Math.round(playerCardOffset.x * 0.8);

  const playerHandStackWidths = useMemo(() => {
    return playerHands.map((h) => cardW + Math.max(0, h.cards.length - 1) * playerCardOffset.x);
  }, [playerHands, playerCardOffset.x, cardW]);

  const playerRowWidth = useMemo(() => {
    if (playerHands.length === 0) return 0;
    // .player-hand-container has 8px horizontal padding on each side.
    const handOuterPad = 16;
    let w = 0;
    for (let i = 0; i < playerHands.length; i++) {
      w += (playerHandStackWidths[i] ?? cardW) + handOuterPad;
      if (i < playerHands.length - 1) w += playerHandGapPx;
    }
    return w;
  }, [playerHands.length, playerHandStackWidths, cardW, playerHandGapPx]);

  useLayoutEffect(() => {
    if (!playerViewportWidth || playerHands.length === 0) {
      setPlayerRowTranslateX(0);
      return;
    }

    const splitLeftHandIdx = splitOriginHandIndex ?? activeHandIndex;
    const splitRightHandIdx = Math.min(splitLeftHandIdx + 1, playerHands.length - 1);
    const focusIdx =
      phase === 'player-action' && (isSplitting || splitDealingPhase === 1)
        ? splitRightHandIdx
        : activeHandIndex;

    // .player-hand-container has 8px horizontal padding on each side.
    const handOuterPad = 16;
    const handInnerPad = 8;
    // Keep some breathing room so the active hand isn't flush against the viewport edge.
    const edgeMarginLeft = isMobile ? 20 : 28;
    const edgeMarginRight = isMobile ? 8 : 10;

    let left = 0;
    for (let i = 0; i < focusIdx; i++) {
      left += (playerHandStackWidths[i] ?? cardW) + handOuterPad;
      left += playerHandGapPx;
    }

    const focusCardLeft = left + handInnerPad;

    // Reserve enough room for at least 1 hit (3 cards total) without shifting the row.
    // We deliberately keep the "required right edge" constant until the hand exceeds 3 cards,
    // which eliminates the micro-slide on the 1st hit.
    const focusCards = playerHands[focusIdx]?.cards.length ?? 0;
    const focusIsComplete = !!playerHands[focusIdx]?.isComplete;
    const minCardsNoShift = 3; // 2-card start + 1 hit

    // When the entire row fits, keep it centered as a group (no slack needed).
    if (playerRowWidth <= playerViewportWidth) {
      const next = Math.round((playerViewportWidth - playerRowWidth) / 2);
      setPlayerRowTranslateX((current) => (current === next ? current : next));
      return;
    }

    // For overflow scenarios: apply slack to rightmost active hand to prevent horizontal jump on first hit.
    // Always reserve space for minCardsNoShift when:
    // - Row doesn't fit (we're in scroll/shift mode)
    // - 3+ hands AND rightmost is active AND not complete
    const shouldReserveSlack =
      !focusIsComplete &&
      playerHands.length >= 3 &&
      focusIdx === playerHands.length - 1;

    const targetCards = focusIsComplete ? focusCards : Math.max(focusCards, minCardsNoShift);
    const focusWidth = playerHandStackWidths[focusIdx] ?? cardW;
    const targetWidth = cardW + Math.max(0, targetCards - 1) * playerCardOffset.x;
    const reservedWidth = shouldReserveSlack ? targetWidth : focusWidth;
    const focusCardRight = focusCardLeft + reservedWidth;

    // Use an effective row width that includes the reserved slack so the clamp
    // doesn't undo the reservation. This keeps minT identical before and after
    // the first hit, eliminating the visible shift.
    const effectiveRowWidth = shouldReserveSlack
      ? playerRowWidth - focusWidth + reservedWidth
      : playerRowWidth;

    setPlayerRowTranslateX((current) => {
      let next = current;

      const leftVis = next + focusCardLeft;
      const rightVis = next + focusCardRight;

      if (leftVis < edgeMarginLeft) next += edgeMarginLeft - leftVis;
      if (rightVis > playerViewportWidth - edgeMarginRight) next -= rightVis - (playerViewportWidth - edgeMarginRight);

      // Clamp so we don't slide beyond the row edges.
      const minT = Math.round((playerViewportWidth - effectiveRowWidth) - edgeMarginRight);
      const maxT = Math.round(edgeMarginLeft);
      if (next < minT) next = minT;
      if (next > maxT) next = maxT;

      next = Math.round(next);
      return next === current ? current : next;
    });
  }, [
    playerViewportWidth,
    playerHands,
    playerRowWidth,
    playerHandStackWidths,
    playerHandGapPx,
    cardW,
    playerCardOffset.x,
    isMobile,
    activeHandIndex,
    phase,
    isSplitting,
    splitDealingPhase,
    splitOriginHandIndex,
    playerRowTranslateX,
  ]);

  // Track global card index for sequential visibility
  let globalCardIndex = 0;

  // Stable split indices for animations even while the active hand is being centered.
  const splitLeftHandIdx = splitOriginHandIndex ?? activeHandIndex;
  const splitRightHandIdx = Math.min(splitLeftHandIdx + 1, playerHands.length - 1);
  const splitSlideX =
    -(((playerHandStackWidths[splitLeftHandIdx] ?? cardW) + 16) + playerHandGapPx);

  // Deck estimation image is a static table aid. Keep it rendered whenever enabled so it
  // doesn't "blink" during initial deal / between rounds. (TrainingPage freezes updates.)

  return (
    <div className="table-felt">
        {/* Shoe - desktop only (hidden via CSS on mobile) */}
        <Shoe cardsRemaining={cardsRemaining} totalCards={totalCards} />

        {/* Discard pile - only shown when deck estimation is off */}
        {!showDeckEstimation && <DiscardPile cardsDiscarded={cardsDiscarded} />}

        {/* Dealer area */}
        <div className="dealer-area">
          <div className="dealer-label">DEALER</div>
            <div className="hand dealer-hand">
              <div
                className="dealer-stack-wrap"
                style={{
                  width: `${dealerStackWidth}px`,
                  height: `${cardH}px`,
                  transform: `translateX(${dealerCardShiftPx}px)`,
                  // CSS var used by DeckEstimationImage.css to control the gap.
                  '--deck-est-gap-px': `${deckEstGapPx}px`,
                } as React.CSSProperties}
              >
                {/* Deck estimation image: card-sized and anchored to the hole card (left of dealer stack). */}
                {showDeckEstimationImage && (
                  <DeckEstimationImage
                    cardsRemaining={deckEstimationCards ?? cardsRemaining}
                    totalCards={totalCards}
                    cardScale={cardScaleName}
                  />
                )}

                {dealerHand.length > 0 ? (
                  <div className="card-stack dealer-stack" style={{ width: `${dealerStackWidth}px` }}>
                    {dealerHand.map((card, i) => {
                      const dealIndex = getDealSequenceIndex(true, i, totalPlayerCards, totalDealerCards, playerHands.length);
                      const isDealerInitialDealing = isInitialDeal && isNewestByVisible(dealIndex);
                      const isNewDealerCard = dealerHand.length > prevDealerCount && i === dealerHand.length - 1;
                      const isDealerHitDealing = phase === 'dealer-turn' && i >= 2 && isNewDealerCard;
                      const isThisCardDealing = (isDealerInitialDealing || isDealerHitDealing) && !isRevealingHoleCard && !isRemovingCards;
                      const isFlipping = isRevealingHoleCard && i === 0;
                      const isHoleCard = i === 0;
                      // Card is visible if its deal sequence index is less than visibleCardCount
                      const isCardVisible = dealIndex < visibleCardCount;
                      const cardZ = isThisCardDealing ? 10000 + i : i;

                      return (
                        <Card
                          key={`dealer-${roundNumber}-${i}`}
                          card={card}
                          size="large"
                          isVisible={isCardVisible}
                          isDealing={isThisCardDealing}
                          isDealerCard={true}
                          isHoleCard={isHoleCard}
                          isFlipping={isFlipping}
                          isRemoving={isRemovingCards}
                          stackOffset={i > 0 ? { x: dealerOffset.x * i, y: dealerOffset.y * i } : undefined}
                          zIndex={cardZ}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-hand">Waiting...</div>
                )}
              </div>
            </div>

            {showHandTotals && dealerHand.length > 0 && (
              <div className={`hand-total dealer-total ${dealerIsBusted && showFullDealer && showBadges ? 'busted' : ''} ${isRemovingCards ? 'removing' : ''}`}>
                {dealerIsBusted && showFullDealer && showBadges
                  ? `${dealerFull.total} BUST`
                  : showFullDealer
                    ? dealerFull.total
                    : dealerVisible.total}
                {!showFullDealer && dealerHand.some(c => !c.faceUp) && '+'}
              </div>
            )}
            {!showHandTotals && dealerHand.length > 0 && dealerIsBusted && showFullDealer && showBadges && (
              <div className={`hand-total busted dealer-total ${isRemovingCards ? 'removing' : ''}`}>BUST</div>
            )}

            {/* Dealer outcome badges during payout (single-hand only). */}
            {phase === 'payout' && showBadges && dealerOutcome && (
              <div className={`hand-result dealer-result result-${dealerOutcome} ${isRemovingCards ? 'removing' : ''}`}>
                {dealerOutcome === 'win' && 'WIN'}
                {dealerOutcome === 'push' && 'PUSH'}
                {dealerOutcome === 'lose' && 'LOSE'}
              </div>
            )}
            {phase === 'payout' && showBadges && dealerIsBlackjack && (
              <div className={`hand-meta-row dealer-meta-row ${isRemovingCards ? 'removing' : ''}`}>
                <span className="hand-tag tag-blackjack">Blackjack</span>
              </div>
            )}
        </div>

        {/* Player area */}
        <div className="player-area">
          {playerHands.length > 0 ? (
            <div className="player-hands-viewport" ref={playerViewportRef}>
              <div
                className={`player-hands ${playerHands.length > 1 ? 'multiple' : ''}`}
                style={{
                  transform: `translateX(${playerRowTranslateX}px)`,
                  gap: `${playerHandGapPx}px`,
                  transition: centerTransitionEnabled ? undefined : 'none',
                }}
              >
                {playerHands.map((hand, handIdx) => {
                  const handTotal = calculateFullHandTotal(hand.cards);
                  const isActive = handIdx === activeHandIndex && phase === 'player-action';
                  const blackjackDealtToPlayer =
                    !isInitialDeal ||
                    // During initial deal, cards are all in state immediately; use the visible gate
                    // so we don't show "Blackjack" until the 2nd card has actually been dealt/seen.
                    visibleCardCount > (playerHands.length + 1 + handIdx);

                const focusHandIdx =
                  (phase === 'player-action' && (isSplitting || splitDealingPhase === 1))
                    ? splitRightHandIdx
                    : activeHandIndex;
                // While a new card is moving, we temporarily hide badges on the *active/focus* hand
                // to avoid visual fights with the dealing animation. Completed/non-focus hands should
                // keep their badges (e.g., BUST) visible so the table doesn't "blink".
                const showBadgesForHand = showBadges || handIdx !== focusHandIdx;

                 // Calculate card offset for this hand (if split, cards dealt later)
                 const cardOffsetBase = handIdx > 0
                   ? playerHands.slice(0, handIdx).reduce((sum, h) => sum + h.cards.length, 0)
                   : 0;

                const stackWidth = playerHandStackWidths[handIdx] ?? cardW;

                // As cards stack upward (negative y offsets), move the info row upward too so it always
                // clears the top-most card (prevents overlap as the hand grows).
                const stackRisePx = Math.max(0, hand.cards.length - 1) * Math.abs(playerCardOffset.y);

                const outlineMargin = isMobile ? 10 : 12;
                const outline = isActive
                  ? buildStackOutlinePath(hand.cards.length, playerCardOffset.x, playerCardOffset.y, cardW, cardH, outlineMargin)
                  : null;

                return (
                  <div
                    key={handIdx}
                    className={`player-hand-container ${isActive ? 'active' : ''} ${
                      hand.isComplete ? 'complete' : ''
                    } ${hand.isBusted ? 'busted' : ''}`}
                  >
                    <div className="hand" style={{ width: `${stackWidth}px` }}>
                      <div className="card-stack player-stack" style={{ width: `${stackWidth}px` }}>
                        {hand.cards.map((card, cardIdx) => {
                          // For initial deal: cardIdx 0 = deal seq 0, cardIdx 1 = deal seq 2
                          // For hits: continue from there
                          const globalCardIdx = cardOffsetBase + cardIdx;
                          const dealIndex = getDealSequenceIndex(false, globalCardIdx, totalPlayerCards, totalDealerCards, playerHands.length);
                          const isCardVisible = dealIndex < visibleCardCount;

                          // Split animation: the moved card is the first card of the newly-created right hand.
                          const isThisCardSplitting = isSplitting && handIdx === splitRightHandIdx && cardIdx === 0;
                          const isThisCardSplitSettling = isSplitting && handIdx === splitLeftHandIdx && cardIdx === 0;

                          // During split dealing phase, only the *new* card should animate in.
                          const isSplitDealCard =
                            (splitDealingPhase === 1 && handIdx === splitRightHandIdx && cardIdx === hand.cards.length - 1) ||
                            (splitDealingPhase === 2 && handIdx === activeHandIndex && cardIdx === hand.cards.length - 1);

                          const isPlayerInitialDealing = isInitialDeal && isNewestByVisible(dealIndex);
                          const isActiveHandForHits = handIdx === focusHandIdx;
                          const prevLen = prevPlayerCounts[handIdx] ?? 0;
                          const isNewPlayerCard = hand.cards.length > prevLen && cardIdx === hand.cards.length - 1;
                          const isPlayerHitDealing =
                            phase === 'player-action' &&
                            splitDealingPhase === 0 &&
                            !isSplitting &&
                            isActiveHandForHits &&
                            cardIdx >= 2 &&
                            isNewPlayerCard;

                          // During split dealing phase, we intentionally keep the dealing flag true
                          // while the timer is running so the animation can't be interrupted by rerenders.
                          const isDealingNow =
                            (isPlayerInitialDealing || isPlayerHitDealing || isSplitDealCard) &&
                            !isRemovingCards;
                          const cardZ = (isDealingNow || isThisCardSplitting || isThisCardSplitSettling) ? 10000 + cardIdx : cardIdx;

                          return (
                            <Card
                              key={`player-${roundNumber}-${handIdx}-${cardIdx}`}
                              card={card}
                              size="large"
                              isVisible={isCardVisible}
                              isDealing={isDealingNow}
                              isRemoving={isRemovingCards}
                              isSplitting={isThisCardSplitting}
                              isSplitSettling={isThisCardSplitSettling}
                              style={
                                isThisCardSplitting
                                  ? ({ ['--split-slide-x' as any]: `${splitSlideX}px` } as React.CSSProperties)
                                  : undefined
                              }
                              stackOffset={cardIdx > 0 ? { x: playerCardOffset.x * cardIdx, y: playerCardOffset.y * cardIdx } : undefined}
                              zIndex={cardZ}
                            />
                          );
                        })}
                        {/* Render AFTER cards so the first card stays the "base" in CSS (:first-child). */}
                        {isActive && outline && (
                          <svg
                            className={`stack-outline ${isRemovingCards ? 'removing' : ''}`}
                            viewBox={`0 0 ${outline.width} ${outline.height}`}
                            style={{
                              left: outline.left,
                              top: outline.top,
                              width: outline.width,
                              height: outline.height,
                            }}
                          >
                            <path d={outline.d} />
                          </svg>
                        )}

                        {/* Hand labels/badges are absolutely positioned so they never affect layout
                            (prevents vertical "jumping" between hands with different stack heights). */}
                        <div
                          className="hand-info-overlay"
                          style={{ ['--stack-rise-px' as any]: `${stackRisePx}px` } as React.CSSProperties}
                        >
                          <div className={`hand-info-overlay-inner ${isRemovingCards ? 'removing' : ''}`}>
                             {showHandTotals && (
                              <div className={`hand-total ${hand.isBusted && showBadgesForHand ? 'busted' : ''}`}>
                                {handTotal.total}
                                {handTotal.isSoft && handTotal.total <= 21 && ' (soft)'}
                                {hand.isBusted && showBadgesForHand && ' BUST'}
                              </div>
                            )}

                            {!showHandTotals && hand.isBusted && showBadgesForHand && (
                              <div className="hand-total busted">BUST</div>
                            )}

                            {/* Outcome badges during payout phase */}
                            {phase === 'payout' && showBadges && hand.result && (
                              <div
                                className={`hand-result result-${hand.result === 'blackjack' ? 'win' : hand.result}`}
                              >
                                {(hand.result === 'win' || hand.result === 'blackjack') && 'WIN'}
                                {hand.result === 'push' && 'PUSH'}
                                {hand.result === 'lose' && 'LOSE'}
                              </div>
                            )}

                            <div className="hand-meta-row">
                              {hand.isBlackjack && showBadgesForHand && blackjackDealtToPlayer && (
                                <span className="hand-tag tag-blackjack">Blackjack</span>
                              )}
                              {hand.isDoubled && showBadgesForHand && <span className="hand-tag tag-doubled">Double</span>}
                              {hand.isSurrendered && showBadgesForHand && <span className="hand-tag tag-surrendered">SUR</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          ) : (
            <div className="empty-hand">Place your bet to start</div>
          )}
          <div className="player-label">PLAYER</div>
        </div>
      </div>
  );
};

export default Table;

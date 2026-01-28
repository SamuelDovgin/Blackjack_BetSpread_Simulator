// Table Component
// Green felt casino table with dealer and player hands
// Cards deal from off-screen right with proper sequencing
//
// DEALER CARD STACKING FLOW:
// 1. Initial deal: Hole card (face down) on LEFT, upcard (face up) on RIGHT - side by side
// 2. After player done (or auto-stand on 21): Flip hole card
// 3. Slide upcard LEFT to overlap hole card vertically (only left edge of hole card visible)
// 4. Additional dealer hits stack the same way - each card covers previous, showing only left edge

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Card, Shoe, DiscardPile } from './Card';
import type { Card as CardType, HandState, GamePhase } from './types';
import { calculateHandTotal, calculateFullHandTotal } from './engine/gameEngine';
import './Table.css';

interface TableProps {
  dealerHand: CardType[];
  playerHands: HandState[];
  activeHandIndex: number;
  phase: GamePhase;
  showDealerTotal?: boolean;
  /** Whether to show hand totals (default: false for realistic practice) */
  showHandTotals?: boolean;
  result?: {
    playerTotal: number;
    dealerTotal: number;
    outcome: 'win' | 'lose' | 'push' | 'blackjack' | null;
  } | null;
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
}

// Player card overlap offset - show top-left and bottom-right corners of each card
// Cards go up and to the right (first card on bottom)
const PLAYER_CARD_OFFSET_DESKTOP = { x: 28, y: -20 }; // Enough to see corners
const PLAYER_CARD_OFFSET_MOBILE = { x: 22, y: -16 };
const CARD_WIDTH_LARGE = 90; // Keep in sync with .card-large width in Card.css

// Dealer cards - two modes:
// Initial: side by side (hole card left, upcard right)
const DEALER_INITIAL_OFFSET_DESKTOP = { x: 100, y: 0 };
const DEALER_INITIAL_OFFSET_MOBILE = { x: 80, y: 0 };
// Stacked: vertical alignment, only left edge visible (like real casino)
const DEALER_STACKED_OFFSET_DESKTOP = { x: 28, y: 0 }; // Only show left edge
const DEALER_STACKED_OFFSET_MOBILE = { x: 22, y: 0 };

/**
 * Get the global deal sequence index for a card.
 * Deal order: Player card 1 (idx 0), Dealer card 1 (idx 1), Player card 2 (idx 2), Dealer card 2 (idx 3)
 * Then hits continue sequentially from there.
 */
function getDealSequenceIndex(
  isDealer: boolean,
  cardIndex: number,
  totalPlayerCards: number,
  totalDealerCards: number
): number {
  // During initial deal (4 cards total: 2 player, 2 dealer)
  // Sequence: P0=0, D0=1, P1=2, D1=3
  if (cardIndex === 0) {
    return isDealer ? 1 : 0;
  }
  if (cardIndex === 1) {
    return isDealer ? 3 : 2;
  }

  // After initial deal, cards are dealt sequentially
  // Player hits happen first, then dealer hits
  if (!isDealer) {
    // Player hits start at index 4
    return 4 + (cardIndex - 2);
  } else {
    // Dealer hits come after all player cards
    // Base: 4 (initial) + (playerCards - 2) for player hits + cardIndex - 2 for dealer hits
    return 4 + Math.max(0, totalPlayerCards - 2) + (cardIndex - 2);
  }
}

export const Table: React.FC<TableProps> = ({
  dealerHand,
  playerHands,
  activeHandIndex,
  phase,
  showDealerTotal = false,
  showHandTotals = false,
  result = null,
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
}) => {
  const isMobile =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  // Keep the active hand visually centered by translating the entire hand row.
  // This is especially important on mobile where we never want multiple rows.
  const playerViewportRef = useRef<HTMLDivElement | null>(null);
  const [playerViewportWidth, setPlayerViewportWidth] = useState(0);

  useLayoutEffect(() => {
    const el = playerViewportRef.current;
    if (!el) return;

    const update = () => setPlayerViewportWidth(el.clientWidth);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Calculate visible dealer total (only face-up cards)
  const dealerVisible = calculateHandTotal(dealerHand);
  const dealerFull = calculateFullHandTotal(dealerHand);
  const showFullDealer = showDealerTotal || phase === 'payout' || phase === 'dealer-turn';

  // Count total player cards for sequencing
  const totalPlayerCards = playerHands.reduce((sum, h) => sum + h.cards.length, 0);
  const totalDealerCards = dealerHand.length;

  // Determine if we're in the initial dealing phase (first 4 cards)
  const isInitialDeal = phase === 'dealing';

  const playerCardOffset = isMobile ? PLAYER_CARD_OFFSET_MOBILE : PLAYER_CARD_OFFSET_DESKTOP;
  const dealerInitialOffset = isMobile ? DEALER_INITIAL_OFFSET_MOBILE : DEALER_INITIAL_OFFSET_DESKTOP;
  const dealerStackedOffset = isMobile ? DEALER_STACKED_OFFSET_MOBILE : DEALER_STACKED_OFFSET_DESKTOP;

  // Dealer offset changes based on whether cards are stacked
  const dealerOffset = isDealerStacked ? dealerStackedOffset : dealerInitialOffset;

  // Dynamic spacing: each hand's allocated width grows with its card count.
  // This prevents long hit stacks from overlapping neighboring split hands.
  const playerHandGapPx = Math.round(playerCardOffset.x * 1.2);

  const playerHandStackWidths = useMemo(() => {
    return playerHands.map((h) => CARD_WIDTH_LARGE + Math.max(0, h.cards.length - 1) * playerCardOffset.x);
  }, [playerHands, playerCardOffset.x]);

  // Center the active hand as a whole (not just its first card) so the hand you are
  // currently playing is visually "dead center" on both desktop and mobile.
  const playerRowTranslateX = useMemo(() => {
    if (!playerViewportWidth || playerHands.length === 0) return 0;

    // .player-hand-container has 8px horizontal padding on each side.
    const handOuterPad = 16;
    const handInnerOffset = 8; // centered child offset within the padded container

    let left = 0;
    for (let i = 0; i < activeHandIndex; i++) {
      const w = (playerHandStackWidths[i] ?? CARD_WIDTH_LARGE) + handOuterPad;
      left += w + playerHandGapPx;
    }

    const activeWidth = playerHandStackWidths[activeHandIndex] ?? CARD_WIDTH_LARGE;
    // Center the visible card stack inside the padded container.
    const activeCenter = left + handInnerOffset + (activeWidth / 2);
    return (playerViewportWidth / 2) - activeCenter;
  }, [playerViewportWidth, playerHands.length, activeHandIndex, playerHandStackWidths, playerHandGapPx]);

  // Track global card index for sequential visibility
  let globalCardIndex = 0;

  return (
    <div className="table">
      <div className="table-felt">
        {/* Shoe - desktop only (hidden via CSS on mobile) */}
        <Shoe cardsRemaining={cardsRemaining} totalCards={totalCards} />

        {/* Discard pile - desktop only (hidden via CSS on mobile) */}
        <DiscardPile cardsDiscarded={cardsDiscarded} />

        {/* Dealer area */}
        <div className="dealer-area">
          <div className="dealer-label">DEALER</div>
          <div className="hand dealer-hand">
            {dealerHand.length > 0 ? (
              <div className="card-stack dealer-stack">
                {dealerHand.map((card, i) => {
                  const dealIndex = getDealSequenceIndex(true, i, totalPlayerCards, totalDealerCards);
                  const isThisCardDealing = isInitialDeal || (phase === 'dealer-turn' && i >= 2);
                  const isFlipping = isRevealingHoleCard && i === 0;
                  const isHoleCard = i === 0;
                  // Card is visible if its deal sequence index is less than visibleCardCount
                  const isCardVisible = dealIndex < visibleCardCount;
                  const cardZ = isThisCardDealing ? 10000 + i : i;

                  return (
                    <Card
                      key={`dealer-${i}`}
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
          {showHandTotals && dealerHand.length > 0 && (
            <div className="hand-total dealer-total">
              {showFullDealer ? dealerFull.total : dealerVisible.total}
              {!showFullDealer && dealerHand.some(c => !c.faceUp) && '+'}
            </div>
          )}
        </div>

        {/* Outcome display */}
        {result && phase === 'payout' && (
          <div className={`outcome-display outcome-${result.outcome}`}>
            {result.outcome === 'win' && 'WIN!'}
            {result.outcome === 'lose' && 'LOSE'}
            {result.outcome === 'push' && 'PUSH'}
            {result.outcome === 'blackjack' && 'BLACKJACK!'}
          </div>
        )}

        {/* Player area */}
        <div className="player-area">
          {playerHands.length > 0 ? (
            <div className="player-hands-viewport" ref={playerViewportRef}>
              <div
                className={`player-hands ${playerHands.length > 1 ? 'multiple' : ''}`}
                style={{
                  transform: `translateX(${playerRowTranslateX}px)`,
                  gap: `${playerHandGapPx}px`,
                }}
              >
                {playerHands.map((hand, handIdx) => {
                const handTotal = calculateFullHandTotal(hand.cards);
                const isActive = handIdx === activeHandIndex && phase === 'player-action';

                // Ensure any dealing animation renders above other split hands.
                // NOTE: opacity on a busted hand creates a stacking context, so we must
                // raise the *hand container* z-index for the currently dealing hand.
                const splitRightHandIdx = Math.min(activeHandIndex + 1, playerHands.length - 1);
                const focusHandIdx =
                  (phase === 'player-action' && (isSplitting || splitDealingPhase === 1))
                    ? splitRightHandIdx
                    : activeHandIndex;
                const handZ = handIdx === focusHandIdx ? 200 : handIdx;

                // Calculate card offset for this hand (if split, cards dealt later)
                const cardOffsetBase = handIdx > 0
                  ? playerHands.slice(0, handIdx).reduce((sum, h) => sum + h.cards.length, 0)
                  : 0;

                const stackWidth = playerHandStackWidths[handIdx] ?? CARD_WIDTH_LARGE;

                return (
                  <div
                    key={handIdx}
                    className={`player-hand-container ${isActive ? 'active' : ''} ${
                      hand.isComplete ? 'complete' : ''
                    } ${hand.isBusted ? 'busted' : ''}`}
                    style={{ zIndex: handZ }}
                  >
                    {/* All labels/badges are above the cards so stacks never shift upward. */}
                    <div className="hand-info">
                      {showHandTotals && (
                        <div className={`hand-total ${hand.isBusted && showBadges ? 'busted' : ''}`}>
                          {handTotal.total}
                          {handTotal.isSoft && handTotal.total <= 21 && ' (soft)'}
                          {hand.isBusted && showBadges && ' BUST'}
                        </div>
                      )}

                      {!showHandTotals && hand.isBusted && showBadges && (
                        <div className="hand-total busted">BUST</div>
                      )}

                      <div className="hand-meta-row">
                        {playerHands.length > 1 && <span className="hand-tag tag-bet">{hand.bet}u</span>}
                        {hand.isBlackjack && showBadges && <span className="hand-tag tag-blackjack">BJ</span>}
                        {hand.isDoubled && showBadges && <span className="hand-tag tag-doubled">2x</span>}
                        {hand.isSurrendered && showBadges && <span className="hand-tag tag-surrendered">SUR</span>}
                      </div>
                    </div>

                    <div className="hand" style={{ width: `${stackWidth}px` }}>
                      <div className="card-stack player-stack" style={{ width: `${stackWidth}px` }}>
                        {hand.cards.map((card, cardIdx) => {
                          // For initial deal: cardIdx 0 = deal seq 0, cardIdx 1 = deal seq 2
                          // For hits: continue from there
                          const globalCardIdx = cardOffsetBase + cardIdx;
                          const dealIndex = getDealSequenceIndex(false, globalCardIdx, totalPlayerCards, totalDealerCards);
                          const isThisCardDealing = isInitialDeal && cardIdx < 2;
                          const isHitDealing = phase === 'player-action' && cardIdx >= 2;
                          const isCardVisible = !isInitialDeal || dealIndex < visibleCardCount;

                          // Split animation: the moved card is the first card of the newly-created right hand.
                          const isThisCardSplitting = isSplitting && handIdx === splitRightHandIdx && cardIdx === 0;

                          // During split dealing phase, only the *new* card should animate in.
                          const isSplitDealCard =
                            (splitDealingPhase === 1 && handIdx === splitRightHandIdx && cardIdx === hand.cards.length - 1) ||
                            (splitDealingPhase === 2 && handIdx === activeHandIndex && cardIdx === hand.cards.length - 1);

                          const isDealingNow = isThisCardDealing || isHitDealing || isSplitDealCard;
                          const cardZ = (isDealingNow || isThisCardSplitting) ? 10000 + cardIdx : cardIdx;

                          return (
                            <Card
                              key={`player-${handIdx}-${cardIdx}`}
                              card={card}
                              size="large"
                              isVisible={isCardVisible}
                              isDealing={isDealingNow}
                              isRemoving={isRemovingCards}
                              isSplitting={isThisCardSplitting}
                              stackOffset={cardIdx > 0 ? { x: playerCardOffset.x * cardIdx, y: playerCardOffset.y * cardIdx } : undefined}
                              zIndex={cardZ}
                            />
                          );
                        })}
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
    </div>
  );
};

export default Table;

// Card Component
// Classic casino-style playing card with pip patterns
// Supports dealing animations and natural 3D flip

import React, { useRef } from 'react';
import type { Card as CardType, Rank, Suit } from './types';
import './Card.css';

interface CardProps {
  card: CardType;
  size?: 'small' | 'medium' | 'large';
  /** Whether this card should be visible (for sequential dealing) */
  isVisible?: boolean;
  /** Whether this card is currently being dealt (triggers animation) */
  isDealing?: boolean;
  /** Whether this is a dealer card (horizontal-only motion) */
  isDealerCard?: boolean;
  /** Marks the dealer hole card so we can keep a stable flip container (no "swap" after flip) */
  isHoleCard?: boolean;
  /** Whether this card is flipping (for hole card reveal) */
  isFlipping?: boolean;
  /** Whether this card is being removed (after hand completes) */
  isRemoving?: boolean;
  /** Whether this card is sliding during a split (from original hand to new position) */
  isSplitting?: boolean;
  /** Whether this card is settling into the left-hand base position after a split */
  isSplitSettling?: boolean;
  /** Position offset for overlapping stack (pixels) */
  stackOffset?: { x: number; y: number };
  /** Z-index for stacking order (higher = on top) */
  zIndex?: number;
  /** Additional inline styles (used for CSS variables like split offsets) */
  style?: React.CSSProperties;
}

// NOTE: iOS/Safari may render these as emoji by default, which breaks spacing/alignment.
// Append Variation Selector-15 (FE0E) to force a text presentation where supported.
const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665\uFE0E',
  diamonds: '\u2666\uFE0E',
  clubs: '\u2663\uFE0E',
  spades: '\u2660\uFE0E',
};

const RANK_DISPLAY: Record<Rank, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6',
  '7': '7', '8': '8', '9': '9', 'T': '10',
  'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

const isRedSuit = (suit: Suit): boolean => suit === 'hearts' || suit === 'diamonds';

export const Card: React.FC<CardProps> = ({
  card,
  size = 'medium',
  isVisible = true,
  isDealing = false,
  isDealerCard = false,
  isHoleCard = false,
  isFlipping = false,
  isRemoving = false,
  isSplitting = false,
  isSplitSettling = false,
  stackOffset,
  zIndex,
  style,
}) => {
  const { rank, suit, faceUp } = card;

  // Track if card has ever started dealing - once true, keep the class to avoid flash on removal
  const hasDealtRef = useRef(false);
  // Track which card we've dealt, so we reset when card changes (new hand)
  const cardIdRef = useRef<string | null>(null);
  const cardId = `${rank}-${suit}`;

  // Check if this is a different card (new hand) - reset immediately before render
  if (cardIdRef.current !== null && cardIdRef.current !== cardId) {
    hasDealtRef.current = false;
  }
  cardIdRef.current = cardId;

  // Mark as dealt when dealing starts
  if (isDealing && !hasDealtRef.current) {
    hasDealtRef.current = true;
  }

  // Stack offset styling
  const baseStyle: React.CSSProperties = stackOffset
    ? {
        left: stackOffset.x,
        top: stackOffset.y,
        zIndex: zIndex ?? 'auto',
      }
    : { zIndex: zIndex ?? 'auto' };
  const offsetStyle: React.CSSProperties = style ? { ...baseStyle, ...style } : baseStyle;

  // Don't render if not visible yet (for sequential dealing)
  if (!isVisible) {
    return null;
  }

  const suitSymbol = SUIT_SYMBOLS[suit];
  const rankDisplay = RANK_DISPLAY[rank];
  const colorClass = isRedSuit(suit) ? 'card-red' : 'card-black';
  const isFaceCard = ['J', 'Q', 'K'].includes(rank);

  // Keep dealing class on if card has ever dealt - prevents flash when class would be removed
  // The animation only plays once, so keeping the class has no visual effect after completion
  const hasDealt = hasDealtRef.current || isDealing;
  const dealingClass = hasDealt ? (isDealerCard ? 'dealing-dealer' : 'dealing') : '';
  const removingClass = isRemoving ? 'removing' : '';
  const flippingClass = isFlipping ? 'flipping' : '';
  const faceUpClass = faceUp && !isFlipping ? 'face-up' : '';
  const splittingClass = isSplitting ? 'splitting' : '';
  const splitSettlingClass = isSplitSettling ? 'split-settle' : '';

  // For flipping cards, we render both sides and use CSS 3D transform
  // The flip animation shows back first, then rotates to show front at 50%
  // For the dealer hole card, keep the flip container mounted at all times so the reveal
  // does not "swap" DOM nodes at the end of the animation (looks unnatural).
  if (isHoleCard || isFlipping) {
    return (
      <div
        className={`card card-${size} card-flip-container ${dealingClass} ${removingClass} ${flippingClass} ${faceUpClass} ${splittingClass} ${splitSettlingClass}`}
        style={offsetStyle}
      >
        <div className="card-flip-inner">
          {/* Back face (visible at start of flip) */}
          <div className="card-flip-back card-back">
            <div className="card-back-pattern">
              <div className="card-back-inner" />
            </div>
          </div>
          {/* Front face (visible at end of flip) */}
          <div className={`card-flip-front card-front ${colorClass}`}>
            <div className="card-corner card-corner-top">
              <div className="card-rank">{rankDisplay}</div>
              <div className="card-suit">{suitSymbol}</div>
            </div>
            <div className="card-center">
              {isFaceCard ? (
                <div className="card-face-symbol">{rankDisplay}</div>
              ) : rank === 'A' ? (
                <div className="card-ace-symbol">{suitSymbol}</div>
              ) : (
                <CardPips rank={rank} suitSymbol={suitSymbol} />
              )}
            </div>
            <div className="card-corner card-corner-bottom">
              <div className="card-rank">{rankDisplay}</div>
              <div className="card-suit">{suitSymbol}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Face down card (not flipping)
  if (!faceUp) {
    return (
      <div
        className={`card card-back card-${size} ${dealingClass} ${removingClass} ${splittingClass} ${splitSettlingClass}`}
        style={offsetStyle}
      >
        <div className="card-back-pattern">
          <div className="card-back-inner" />
        </div>
      </div>
    );
  }

  // Face up card
  return (
    <div
      className={`card card-front card-${size} ${colorClass} ${dealingClass} ${removingClass} ${splittingClass} ${splitSettlingClass}`}
      style={offsetStyle}
    >
      {/* Top-left corner */}
      <div className="card-corner card-corner-top">
        <div className="card-rank">{rankDisplay}</div>
        <div className="card-suit">{suitSymbol}</div>
      </div>

      {/* Center pip pattern */}
      <div className="card-center">
        {isFaceCard ? (
          <div className="card-face-symbol">{rankDisplay}</div>
        ) : rank === 'A' ? (
          <div className="card-ace-symbol">{suitSymbol}</div>
        ) : (
          <CardPips rank={rank} suitSymbol={suitSymbol} />
        )}
      </div>

      {/* Bottom-right corner (inverted) */}
      <div className="card-corner card-corner-bottom">
        <div className="card-rank">{rankDisplay}</div>
        <div className="card-suit">{suitSymbol}</div>
      </div>
    </div>
  );
};

// Pip layout component for number cards
interface CardPipsProps {
  rank: Rank;
  suitSymbol: string;
}

const CardPips: React.FC<CardPipsProps> = ({ rank, suitSymbol }) => {
  const numPips = parseInt(rank === 'T' ? '10' : rank, 10);
  if (isNaN(numPips)) return null;

  // Define pip positions for each rank
  const getPipPositions = (n: number): { row: number; col: number }[] => {
    const positions: { row: number; col: number }[] = [];

    switch (n) {
      case 2:
        positions.push({ row: 1, col: 2 }, { row: 5, col: 2 });
        break;
      case 3:
        positions.push({ row: 1, col: 2 }, { row: 3, col: 2 }, { row: 5, col: 2 });
        break;
      case 4:
        positions.push(
          { row: 1, col: 1 }, { row: 1, col: 3 },
          { row: 5, col: 1 }, { row: 5, col: 3 }
        );
        break;
      case 5:
        positions.push(
          { row: 1, col: 1 }, { row: 1, col: 3 },
          { row: 3, col: 2 },
          { row: 5, col: 1 }, { row: 5, col: 3 }
        );
        break;
      case 6:
        positions.push(
          { row: 1, col: 1 }, { row: 1, col: 3 },
          { row: 3, col: 1 }, { row: 3, col: 3 },
          { row: 5, col: 1 }, { row: 5, col: 3 }
        );
        break;
      case 7:
        positions.push(
          { row: 1, col: 1 }, { row: 1, col: 3 },
          { row: 2, col: 2 },
          { row: 3, col: 1 }, { row: 3, col: 3 },
          { row: 5, col: 1 }, { row: 5, col: 3 }
        );
        break;
      case 8:
        positions.push(
          { row: 1, col: 1 }, { row: 1, col: 3 },
          { row: 2, col: 2 },
          { row: 3, col: 1 }, { row: 3, col: 3 },
          { row: 4, col: 2 },
          { row: 5, col: 1 }, { row: 5, col: 3 }
        );
        break;
      case 9:
        positions.push(
          { row: 1, col: 1 }, { row: 1, col: 3 },
          { row: 2, col: 1 }, { row: 2, col: 3 },
          { row: 3, col: 2 },
          { row: 4, col: 1 }, { row: 4, col: 3 },
          { row: 5, col: 1 }, { row: 5, col: 3 }
        );
        break;
      case 10:
        positions.push(
          { row: 1, col: 1 }, { row: 1, col: 3 },
          { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 },
          { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 },
          { row: 5, col: 1 }, { row: 5, col: 3 }
        );
        break;
    }

    return positions;
  };

  const positions = getPipPositions(numPips);

  return (
    <div className="card-pips">
      {positions.map((pos, i) => (
        <div
          key={i}
          className="card-pip"
          style={{
            gridRow: pos.row,
            gridColumn: pos.col,
          }}
        >
          {suitSymbol}
        </div>
      ))}
    </div>
  );
};

// Shoe component - visual deck (desktop only, hidden on mobile via CSS)
export const Shoe: React.FC<{ cardsRemaining: number; totalCards: number }> = ({
  cardsRemaining,
  totalCards
}) => {
  // Show 1-5 card backs based on remaining deck percentage
  const deckPercent = cardsRemaining / totalCards;
  const visibleCards = Math.max(1, Math.ceil(deckPercent * 5));

  return (
    <div className="shoe">
      <div className="shoe-stack">
        {Array.from({ length: visibleCards }).map((_, i) => (
          <div key={i} className="shoe-card" />
        ))}
      </div>
      <div className="shoe-label">Shoe</div>
    </div>
  );
};

// Discard pile component (desktop only, hidden on mobile via CSS)
export const DiscardPile: React.FC<{ cardsDiscarded: number }> = ({
  cardsDiscarded
}) => {
  // Show 1-5 card backs based on discard count
  const visibleCards = Math.min(5, Math.max(1, Math.ceil(cardsDiscarded / 20)));

  return (
    <div className="discard-pile">
      <div className="discard-stack">
        {cardsDiscarded > 0 && Array.from({ length: visibleCards }).map((_, i) => (
          <div key={i} className="discard-card" />
        ))}
      </div>
      <div className="discard-label">Discard</div>
    </div>
  );
};

export default Card;

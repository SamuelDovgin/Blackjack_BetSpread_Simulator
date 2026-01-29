// Basic Strategy Oracle
// Pure functions for determining the mathematically correct play
// Based on standard 6-deck, H17, DAS, Late Surrender rules (configurable)

import type { Card, Rank, PlayerAction, HandState } from '../types';

// ============================================
// Types
// ============================================

export type HandType = 'hard' | 'soft' | 'pair';

export interface RuleSet {
  /** Dealer hits soft 17 */
  hitSoft17: boolean;
  /** Double after split allowed */
  doubleAfterSplit: boolean;
  /** Can double on any two cards (vs 9/10/11 only) */
  doubleAnyTwo: boolean;
  /** Late surrender allowed */
  surrenderAllowed: boolean;
  /** Number of decks (affects some edge cases) */
  numDecks: number;
  /** Can re-split aces */
  resplitAces: boolean;
  /** Can hit split aces */
  hitSplitAces: boolean;
}

export interface HandContext {
  /** Player's cards */
  playerCards: Card[];
  /** Dealer's face-up card */
  dealerUpcard: Card;
  /** Current rules */
  rules: RuleSet;
  /** Is this a split hand? (affects doubling/surrender eligibility) */
  isSplitHand?: boolean;
  /** Can the player double? (enough bankroll, 2 cards, etc.) */
  canDouble?: boolean;
  /** Can the player split? (pair, not max splits, enough bankroll) */
  canSplit?: boolean;
  /** Can the player surrender? (first action, not split hand) */
  canSurrender?: boolean;
}

export interface StrategyResult {
  /** The correct action to take */
  action: PlayerAction;
  /** Short explanation */
  reason: string;
  /** Hand classification key (e.g., "hard-16", "soft-17", "pair-8") */
  handKey: string;
  /** The hand type */
  handType: HandType;
  /** Player's total */
  total: number;
  /** Whether the hand is soft */
  isSoft: boolean;
  /** Dealer's upcard value (2-11) */
  dealerUp: number;
}

// ============================================
// Constants
// ============================================

export const DEFAULT_RULES: RuleSet = {
  hitSoft17: true,
  doubleAfterSplit: true,
  doubleAnyTwo: true,
  surrenderAllowed: false,
  numDecks: 6,
  resplitAces: false,
  hitSplitAces: false,
};

const CARD_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11,
};

// ============================================
// Hand Analysis Helpers
// ============================================

/**
 * Calculate hand total and softness
 */
export function calculateHand(cards: Card[]): { total: number; isSoft: boolean; aceCount: number } {
  let total = 0;
  let aceCount = 0;

  for (const card of cards) {
    total += CARD_VALUES[card.rank];
    if (card.rank === 'A') aceCount++;
  }

  // Convert aces from 11 to 1 as needed
  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount--;
  }

  // Hand is soft if there's still an ace counting as 11
  const isSoft = aceCount > 0 && total <= 21;

  return { total, isSoft, aceCount };
}

/**
 * Get the numeric value of the dealer's upcard (2-11)
 */
export function getDealerUpValue(upcard: Card): number {
  return CARD_VALUES[upcard.rank];
}

/**
 * Check if hand is a pair (can split)
 */
export function isPair(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  // For splitting, T/J/Q/K are all equivalent "tens"
  const val1 = CARD_VALUES[cards[0].rank];
  const val2 = CARD_VALUES[cards[1].rank];
  return val1 === val2;
}

/**
 * Get the pair value (for split decisions)
 */
export function getPairValue(cards: Card[]): number | null {
  if (!isPair(cards)) return null;
  return CARD_VALUES[cards[0].rank];
}

/**
 * Determine hand type
 */
export function getHandType(cards: Card[]): HandType {
  if (isPair(cards)) return 'pair';
  const { isSoft } = calculateHand(cards);
  return isSoft ? 'soft' : 'hard';
}

/**
 * Generate a unique key for the hand (for stats tracking)
 */
export function getHandKey(cards: Card[], dealerUp: number): string {
  const handType = getHandType(cards);
  const { total } = calculateHand(cards);

  if (handType === 'pair') {
    const pairVal = getPairValue(cards);
    return `pair-${pairVal === 11 ? 'A' : pairVal}-v${dealerUp}`;
  }

  if (handType === 'soft') {
    return `soft-${total}-v${dealerUp}`;
  }

  return `hard-${total}-v${dealerUp}`;
}

// ============================================
// Strategy Tables
// Indexed by [playerTotal/pairValue][dealerUpcard]
// Values: H=hit, S=stand, D=double, P=split, R=surrender, Ds=double/stand, Dh=double/hit
// ============================================

type StrategyAction = 'H' | 'S' | 'D' | 'Dh' | 'Ds' | 'P' | 'Ph' | 'Pd' | 'R' | 'Rh' | 'Rs';

// Hard totals: rows are player total (5-21), columns are dealer upcard (2-A)
// Index 0 = dealer 2, index 9 = dealer A
const HARD_STRATEGY: Record<number, StrategyAction[]> = {
  // Total: [2,   3,   4,   5,   6,   7,   8,   9,   T,   A]
  5:       ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  6:       ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  7:       ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  8:       ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9:       ['H', 'Dh','Dh','Dh','Dh','H', 'H', 'H', 'H', 'H'],
  10:      ['Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh','H', 'H'],
  11:      ['Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh'],
  12:      ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13:      ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14:      ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15:      ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'Rh','Rh'],
  16:      ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh','Rh','Rh'],
  17:      ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'Rs'],
  18:      ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  19:      ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20:      ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21:      ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

// Soft totals: rows are player total (13-21), columns are dealer upcard (2-A)
const SOFT_STRATEGY: Record<number, StrategyAction[]> = {
  // Total: [2,   3,   4,   5,   6,   7,   8,   9,   T,   A]
  13:      ['H', 'H', 'H', 'Dh','Dh','H', 'H', 'H', 'H', 'H'],  // A,2
  14:      ['H', 'H', 'H', 'Dh','Dh','H', 'H', 'H', 'H', 'H'],  // A,3
  15:      ['H', 'H', 'Dh','Dh','Dh','H', 'H', 'H', 'H', 'H'],  // A,4
  16:      ['H', 'H', 'Dh','Dh','Dh','H', 'H', 'H', 'H', 'H'],  // A,5
  17:      ['H', 'Dh','Dh','Dh','Dh','H', 'H', 'H', 'H', 'H'],  // A,6
  18:      ['Ds','Ds','Ds','Ds','Ds','S', 'S', 'H', 'H', 'H'],  // A,7
  19:      ['S', 'S', 'S', 'S', 'Ds','S', 'S', 'S', 'S', 'S'],  // A,8
  20:      ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],  // A,9
  21:      ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],  // A,T (blackjack handled separately)
};

// Pairs: rows are pair value (2-A), columns are dealer upcard (2-A)
// P = split, Ph = split if DAS else hit, Pd = split if DAS else double
const PAIR_STRATEGY: Record<number, StrategyAction[]> = {
  // Pair:  [2,   3,   4,   5,   6,   7,   8,   9,   T,   A]
  2:       ['Ph','Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  3:       ['Ph','Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  4:       ['H', 'H', 'H', 'Ph','Ph','H', 'H', 'H', 'H', 'H'],
  5:       ['Dh','Dh','Dh','Dh','Dh','Dh','Dh','Dh','H', 'H'],  // Never split 5s, treat as 10
  6:       ['Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
  7:       ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  8:       ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],  // Always split 8s
  9:       ['P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],
  10:      ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],  // Never split tens
  11:      ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],  // Always split aces
};

// ============================================
// Strategy Lookup
// ============================================

/**
 * Convert dealer upcard value to table index (0-9)
 */
function dealerToIndex(dealerUp: number): number {
  // 2-10 map to 0-8, Ace (11) maps to 9
  if (dealerUp === 11) return 9;
  return dealerUp - 2;
}

/**
 * Resolve a strategy action code to an actual PlayerAction
 */
function resolveAction(
  code: StrategyAction,
  canDouble: boolean,
  canSplit: boolean,
  canSurrender: boolean,
  das: boolean
): PlayerAction {
  switch (code) {
    case 'H': return 'hit';
    case 'S': return 'stand';
    case 'D': return canDouble ? 'double' : 'hit';
    case 'Dh': return canDouble ? 'double' : 'hit';
    case 'Ds': return canDouble ? 'double' : 'stand';
    case 'P': return canSplit ? 'split' : 'hit';
    case 'Ph': return canSplit && das ? 'split' : 'hit';
    case 'Pd': return canSplit && das ? 'split' : (canDouble ? 'double' : 'hit');
    case 'R': return canSurrender ? 'surrender' : 'hit';
    case 'Rh': return canSurrender ? 'surrender' : 'hit';
    case 'Rs': return canSurrender ? 'surrender' : 'stand';
    default: return 'hit';
  }
}

/**
 * Get explanation for the action
 */
function getExplanation(
  action: PlayerAction,
  handType: HandType,
  total: number,
  dealerUp: number,
  pairValue?: number
): string {
  const dealerStr = dealerUp === 11 ? 'A' : String(dealerUp);

  switch (action) {
    case 'hit':
      if (handType === 'soft') {
        return `Soft ${total} vs ${dealerStr}: Hit to improve without busting`;
      }
      if (total <= 11) {
        return `${total} vs ${dealerStr}: Hit - can't bust`;
      }
      return `${total} vs ${dealerStr}: Hit - dealer likely has better`;

    case 'stand':
      if (handType === 'soft' && total >= 19) {
        return `Soft ${total} vs ${dealerStr}: Strong hand, stand`;
      }
      if (total >= 17) {
        return `${total} vs ${dealerStr}: Stand on hard 17+`;
      }
      return `${total} vs ${dealerStr}: Dealer likely busts, stand`;

    case 'double':
      if (handType === 'soft') {
        return `Soft ${total} vs ${dealerStr}: Double - good spot with ace flexibility`;
      }
      return `${total} vs ${dealerStr}: Double down for value`;

    case 'split':
      if (pairValue === 11) {
        return `Pair of Aces vs ${dealerStr}: Always split aces`;
      }
      if (pairValue === 8) {
        return `Pair of 8s vs ${dealerStr}: Always split 8s (16 is terrible)`;
      }
      return `Pair of ${pairValue}s vs ${dealerStr}: Split for better expected value`;

    case 'surrender':
      return `${total} vs ${dealerStr}: Surrender - lose half instead of more`;

    default:
      return `${handType} ${total} vs ${dealerStr}`;
  }
}

// ============================================
// Main Strategy Function
// ============================================

/**
 * Get the correct basic strategy action for a given hand context
 */
export function getBasicStrategyAction(ctx: HandContext): StrategyResult {
  const { playerCards, dealerUpcard, rules, isSplitHand = false } = ctx;

  // Determine capabilities
  const canDouble = ctx.canDouble ?? (playerCards.length === 2 && !isSplitHand);
  const canSplit = ctx.canSplit ?? (isPair(playerCards) && playerCards.length === 2);
  const canSurrender = ctx.canSurrender ?? (rules.surrenderAllowed && playerCards.length === 2 && !isSplitHand);

  const { total, isSoft } = calculateHand(playerCards);
  const dealerUp = getDealerUpValue(dealerUpcard);
  const dealerIdx = dealerToIndex(dealerUp);
  const handType = getHandType(playerCards);
  const handKey = getHandKey(playerCards, dealerUp);

  let action: PlayerAction;
  let code: StrategyAction;

  // Check for pairs first (if can split)
  if (handType === 'pair' && canSplit) {
    const pairVal = getPairValue(playerCards)!;
    const pairKey = pairVal === 11 ? 11 : pairVal; // Aces are 11
    code = PAIR_STRATEGY[pairKey]?.[dealerIdx] ?? 'H';
    action = resolveAction(code, canDouble, canSplit, canSurrender, rules.doubleAfterSplit);

    // If we're not splitting, fall through to hard/soft strategy
    if (action !== 'split') {
      // Re-evaluate as hard/soft hand
      if (isSoft) {
        code = SOFT_STRATEGY[total]?.[dealerIdx] ?? 'H';
      } else {
        code = HARD_STRATEGY[total]?.[dealerIdx] ?? 'H';
      }
      action = resolveAction(code, canDouble, false, canSurrender, rules.doubleAfterSplit);
    }
  } else if (isSoft) {
    // Soft totals
    code = SOFT_STRATEGY[total]?.[dealerIdx] ?? 'H';
    action = resolveAction(code, canDouble, false, canSurrender, rules.doubleAfterSplit);
  } else {
    // Hard totals
    code = HARD_STRATEGY[total]?.[dealerIdx] ?? 'H';
    action = resolveAction(code, canDouble, false, canSurrender, rules.doubleAfterSplit);
  }

  // Generate explanation
  const pairValue = handType === 'pair' ? getPairValue(playerCards) ?? undefined : undefined;
  const reason = getExplanation(action, handType, total, dealerUp, pairValue);

  return {
    action,
    reason,
    handKey,
    handType,
    total,
    isSoft,
    dealerUp,
  };
}

// ============================================
// Validation / Testing Helpers
// ============================================

/**
 * Test a specific hand scenario
 */
export function testHand(
  playerRanks: Rank[],
  dealerRank: Rank,
  rules: Partial<RuleSet> = {}
): StrategyResult {
  const playerCards: Card[] = playerRanks.map((rank, i) => ({
    rank,
    suit: 'spades' as const,
    faceUp: true,
  }));

  const dealerUpcard: Card = {
    rank: dealerRank,
    suit: 'hearts' as const,
    faceUp: true,
  };

  const fullRules: RuleSet = { ...DEFAULT_RULES, ...rules };

  return getBasicStrategyAction({
    playerCards,
    dealerUpcard,
    rules: fullRules,
  });
}

/**
 * Batch test canonical hands (for verification)
 */
export function runCanonicalTests(): Array<{ hand: string; dealer: string; expected: PlayerAction; actual: PlayerAction; pass: boolean }> {
  const tests: Array<{ player: Rank[]; dealer: Rank; expected: PlayerAction }> = [
    // Hard totals
    { player: ['T', '2'], dealer: '2', expected: 'hit' },      // 12 vs 2 = hit
    { player: ['T', '2'], dealer: '3', expected: 'hit' },      // 12 vs 3 = hit
    { player: ['T', '2'], dealer: '4', expected: 'stand' },    // 12 vs 4 = stand
    { player: ['T', '2'], dealer: '5', expected: 'stand' },    // 12 vs 5 = stand
    { player: ['T', '2'], dealer: '6', expected: 'stand' },    // 12 vs 6 = stand
    { player: ['T', '2'], dealer: '7', expected: 'hit' },      // 12 vs 7 = hit
    { player: ['T', '2'], dealer: 'T', expected: 'hit' },      // 12 vs 10 = hit
    { player: ['T', '2'], dealer: 'J', expected: 'hit' },      // 12 vs J = hit
    { player: ['7', '5'], dealer: 'T', expected: 'hit' },      // 12 vs 10 (7+5) = hit
    { player: ['T', '3'], dealer: 'T', expected: 'hit' },      // 13 vs 10 = hit
    { player: ['T', '3'], dealer: 'J', expected: 'hit' },      // 13 vs J = hit
    { player: ['7', '6'], dealer: 'T', expected: 'hit' },      // 13 vs 10 (7+6) = hit
    { player: ['T', '6'], dealer: 'T', expected: 'surrender' }, // 16 vs 10 = surrender
    { player: ['T', '6'], dealer: '3', expected: 'stand' },    // 16 vs 3 = stand
    { player: ['T', '6'], dealer: '7', expected: 'hit' },      // 16 vs 7 = hit
    { player: ['9', '2'], dealer: '5', expected: 'double' },   // 11 vs 5 = double
    { player: ['T', '7'], dealer: 'A', expected: 'surrender' }, // 17 vs A = surrender (H17)

    // Soft totals
    { player: ['A', '7'], dealer: '3', expected: 'double' },  // A7 vs 3 = double
    { player: ['A', '7'], dealer: '9', expected: 'hit' },     // A7 vs 9 = hit
    { player: ['A', '6'], dealer: '4', expected: 'double' },  // A6 vs 4 = double
    { player: ['A', '8'], dealer: '6', expected: 'double' },  // A8 vs 6 = double (Ds)
    { player: ['A', '8'], dealer: '7', expected: 'stand' },   // A8 vs 7 = stand

    // Pairs
    { player: ['8', '8'], dealer: 'T', expected: 'split' },   // 88 vs 10 = split
    { player: ['A', 'A'], dealer: '6', expected: 'split' },   // AA vs 6 = split
    { player: ['T', 'T'], dealer: '5', expected: 'stand' },   // TT vs 5 = stand (never split tens)
    { player: ['9', '9'], dealer: '7', expected: 'stand' },   // 99 vs 7 = stand
    { player: ['9', '9'], dealer: '8', expected: 'split' },   // 99 vs 8 = split
    { player: ['5', '5'], dealer: '6', expected: 'double' },  // 55 vs 6 = double (never split 5s)
    { player: ['2', '2'], dealer: '7', expected: 'split' },   // 22 vs 7 = split (DAS)
    { player: ['6', '6'], dealer: '2', expected: 'split' },   // 66 vs 2 = split (DAS)
  ];

  return tests.map(test => {
    const result = testHand(test.player, test.dealer);
    return {
      hand: test.player.join(''),
      dealer: test.dealer,
      expected: test.expected,
      actual: result.action,
      pass: result.action === test.expected,
    };
  });
}

// Scenario Generator
// Generates shoes for specific TC targets or deviation practice

import type { Card } from '../types';
import { ILLUSTRIOUS_18, FAB_FOUR_SURRENDERS, type Deviation } from './deviations';

// Combined deviations list
const ALL_DEVIATIONS: Deviation[] = [...ILLUSTRIOUS_18, ...FAB_FOUR_SURRENDERS];

// Card ranks and suits for building shoes
const RANKS: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];

// Hi-Lo count values
function getCountValue(card: Card): number {
  const rank = card.rank;
  if (['2', '3', '4', '5', '6'].includes(rank)) return 1;
  if (['7', '8', '9'].includes(rank)) return 0;
  return -1; // T, J, Q, K, A
}

export type TcEstimationMethod = 'perfect' | 'floor' | 'halfDeck';

/**
 * Create a fresh shuffled shoe
 */
export function createShuffledShoe(numDecks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ rank, suit, faceUp: true });
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/**
 * Calculate running count for a set of cards
 */
function calculateRunningCount(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + getCountValue(card), 0);
}

/**
 * Calculate true count from running count and remaining decks
 */
function calculateTrueCount(runningCount: number, decksRemaining: number): number {
  if (decksRemaining <= 0) return 0;
  return runningCount / decksRemaining;
}

function estimateDivisor(exactDecksRemaining: number, method: TcEstimationMethod): number {
  if (method === 'perfect') return exactDecksRemaining;
  if (method === 'halfDeck') return Math.max(0.5, Math.round(exactDecksRemaining * 2) / 2);
  // Conservative full-deck estimation: round decks remaining UP.
  return Math.max(1, Math.ceil(exactDecksRemaining));
}

function applyTcEstimation(rawTc: number, method: TcEstimationMethod): number {
  if (method === 'floor') return Math.floor(rawTc);
  if (method === 'halfDeck') return Math.round(rawTc * 2) / 2;
  return rawTc;
}

function calculatePracticeTrueCount(
  runningCount: number,
  exactDecksRemaining: number,
  method: TcEstimationMethod
): number {
  const divisor = estimateDivisor(exactDecksRemaining, method);
  return applyTcEstimation(calculateTrueCount(runningCount, divisor), method);
}

export interface GeneratedScenario {
  shoe: Card[];
  runningCount: number;
  trueCount: number;
  cardsDealt: number;
}

/**
 * Generate a shoe that reaches approximately the target true count.
 * Uses forward simulation - deals cards until TC is near target.
 */
export function generateShoeForTargetTC(
  targetTC: number,
  numDecks: number,
  tolerance: number = 0.5,
  maxAttempts: number = 500,
  tcEstimationMethod: TcEstimationMethod = 'perfect'
): GeneratedScenario | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const fullShoe = createShuffledShoe(numDecks);
    let runningCount = 0;
    let cardsDealt = 0;

    // Deal cards one at a time until we hit the target TC
    // Leave at least 2 decks for play
    const minCardsRemaining = 2 * 52;

    while (cardsDealt < fullShoe.length - minCardsRemaining) {
      const card = fullShoe[cardsDealt];
      runningCount += getCountValue(card);
      cardsDealt++;

      const decksRemaining = (fullShoe.length - cardsDealt) / 52;
      const currentTC = calculatePracticeTrueCount(runningCount, decksRemaining, tcEstimationMethod);

      // Check if we've hit the target TC
      const hit =
        tcEstimationMethod === 'perfect'
          ? Math.abs(currentTC - targetTC) <= tolerance
          : currentTC === targetTC;
      if (hit) {
        // Found a good state! Return the remaining shoe
        const remainingShoe = fullShoe.slice(cardsDealt);
        return {
          shoe: remainingShoe,
          runningCount,
          trueCount: currentTC,
          cardsDealt,
        };
      }

      // For perfect TC (continuous), it's safe to bail out when we've overshot badly.
      // For rounded/quantized modes, TC can swing back; don't overshoot-break.
      if (tcEstimationMethod === 'perfect') {
        if (targetTC > 0 && currentTC > targetTC + 3) break;
        if (targetTC < 0 && currentTC < targetTC - 3) break;
      }
    }
  }

  // Fallback: return a shoe at approximately the right count using construction
  return constructShoeForTargetTC(targetTC, numDecks, tcEstimationMethod);
}

/**
 * Construct a shoe with a specific running count by removing cards.
 * Used as fallback for extreme counts.
 */
function constructShoeForTargetTC(
  targetTC: number,
  numDecks: number,
  tcEstimationMethod: TcEstimationMethod
): GeneratedScenario {
  // Target: 2-3 decks remaining for realistic play
  const targetDecksRemaining = Math.max(2, Math.min(3, numDecks - 1));
  const targetCardsRemaining = targetDecksRemaining * 52;
  const targetRunningCount = Math.round(targetTC * targetDecksRemaining);

  // Start with a full shoe
  const fullShoe = createShuffledShoe(numDecks);

  // We need to "remove" cards to achieve the target running count
  // Positive RC = more low cards dealt, Negative RC = more high cards dealt
  const cardsToRemove = fullShoe.length - targetCardsRemaining;

  // Separate cards by count value
  const lowCards: Card[] = []; // +1 count (2-6)
  const neutralCards: Card[] = []; // 0 count (7-9)
  const highCards: Card[] = []; // -1 count (10-A)

  for (const card of fullShoe) {
    const cv = getCountValue(card);
    if (cv === 1) lowCards.push(card);
    else if (cv === 0) neutralCards.push(card);
    else highCards.push(card);
  }

  // Shuffle each group
  const shuffle = (arr: Card[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  shuffle(lowCards);
  shuffle(neutralCards);
  shuffle(highCards);

  // Remove cards to achieve target RC
  const removedCards: Card[] = [];
  let currentRC = 0;

  // Strategy: remove cards until we hit the target RC and card count
  while (removedCards.length < cardsToRemove) {
    const rcDiff = targetRunningCount - currentRC;

    if (rcDiff > 0 && lowCards.length > 0) {
      // Need more positive RC - remove a low card
      const card = lowCards.pop()!;
      removedCards.push(card);
      currentRC += 1;
    } else if (rcDiff < 0 && highCards.length > 0) {
      // Need more negative RC - remove a high card
      const card = highCards.pop()!;
      removedCards.push(card);
      currentRC -= 1;
    } else if (neutralCards.length > 0) {
      // Remove neutral cards
      removedCards.push(neutralCards.pop()!);
    } else if (lowCards.length > 0) {
      const card = lowCards.pop()!;
      removedCards.push(card);
      currentRC += 1;
    } else if (highCards.length > 0) {
      const card = highCards.pop()!;
      removedCards.push(card);
      currentRC -= 1;
    } else {
      break;
    }
  }

  // Remaining shoe
  const remainingShoe = [...lowCards, ...neutralCards, ...highCards];
  shuffle(remainingShoe);

  const actualDecksRemaining = remainingShoe.length / 52;
  const practiceTC = calculatePracticeTrueCount(currentRC, actualDecksRemaining, tcEstimationMethod);

  return {
    shoe: remainingShoe,
    runningCount: currentRC,
    trueCount: practiceTC,
    cardsDealt: removedCards.length,
  };
}

export interface DeviationScenario extends GeneratedScenario {
  playerCards: Card[];
  dealerUpcard: Card;
  dealerHoleCard: Card;
}

/**
 * Extract a card of specific value from the shoe
 */
function extractCard(shoe: Card[], value: number): Card | null {
  // Value 11 = Ace, 10 = any ten-value card
  for (let i = 0; i < shoe.length; i++) {
    const card = shoe[i];
    const cardValue = getCardValue(card);
    if (cardValue === value || (value === 10 && cardValue >= 10)) {
      shoe.splice(i, 1);
      return card;
    }
  }
  return null;
}

/**
 * Get numeric value of a card (Ace = 11)
 */
function getCardValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (card.rank === 'T' || ['K', 'Q', 'J'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

/**
 * Extract cards for a pair hand
 */
function extractPair(shoe: Card[], pairValue: number): Card[] | null {
  const cards: Card[] = [];
  for (let i = 0; i < 2; i++) {
    const card = extractCard(shoe, pairValue);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

/**
 * Extract cards for a soft hand (Ace + X)
 */
function extractSoftHand(shoe: Card[], total: number): Card[] | null {
  // Soft total = Ace (11) + other card
  // e.g., Soft 18 = Ace + 7
  const otherValue = total - 11;
  if (otherValue < 2 || otherValue > 10) return null;

  const ace = extractCard(shoe, 11);
  if (!ace) return null;

  const other = extractCard(shoe, otherValue);
  if (!other) {
    // Put ace back
    shoe.push(ace);
    return null;
  }

  return [ace, other];
}

/**
 * Extract cards for a hard hand
 */
function extractHardHand(shoe: Card[], total: number): Card[] | null {
  // Try various two-card combinations
  // Prefer combinations without aces to keep it clearly hard
  const combinations: [number, number][] = [];

  for (let a = 2; a <= 10; a++) {
    const b = total - a;
    if (b >= 2 && b <= 10 && a <= b) {
      combinations.push([a, b]);
    }
  }

  // Shuffle combinations for variety
  for (let i = combinations.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combinations[i], combinations[j]] = [combinations[j], combinations[i]];
  }

  for (const [a, b] of combinations) {
    const cardA = extractCard(shoe, a);
    if (!cardA) continue;

    const cardB = extractCard(shoe, b);
    if (!cardB) {
      shoe.push(cardA);
      continue;
    }

    return [cardA, cardB];
  }

  return null;
}

/**
 * Get a random non-ace card for dealer hole card
 */
function extractRandomNonAce(shoe: Card[]): Card | null {
  // Find indices of non-ace cards
  const indices: number[] = [];
  for (let i = 0; i < shoe.length; i++) {
    if (shoe[i].rank !== 'A') {
      indices.push(i);
    }
  }
  if (indices.length === 0) return null;

  const idx = indices[Math.floor(Math.random() * indices.length)];
  return shoe.splice(idx, 1)[0];
}

/**
 * Generate a shoe for practicing a specific deviation.
 * Sets up the exact hand situation at the deviation's threshold TC.
 */
export function generateShoeForDeviation(
  deviationIndex: number,
  numDecks: number,
  tcEstimationMethod: TcEstimationMethod = 'perfect'
): DeviationScenario | null {
  const deviation = ALL_DEVIATIONS[deviationIndex];
  if (!deviation) return null;

  const { playerTotal, dealerUp: dealerUpValue, tcThreshold, isSoft, isPair, pairValue } = deviation;

  // Determine target TC based on the deviation threshold
  // Negative thresholds mean "at or below" (e.g., -2 means TC <= -2)
  // Positive thresholds mean "at or above" (e.g., +3 means TC >= +3)
  // For negative thresholds, use threshold value directly (e.g., -2 or -3)
  // For positive thresholds, use threshold value directly
  const targetTC = tcThreshold;

  const baseScenario = generateShoeForTargetTC(targetTC, numDecks, 0.5, 300, tcEstimationMethod);
  if (!baseScenario) return null;

  const shoe = [...baseScenario.shoe];

  // Extract player cards
  let playerCards: Card[] | null = null;
  if (isPair && pairValue) {
    playerCards = extractPair(shoe, pairValue);
  } else if (isSoft) {
    playerCards = extractSoftHand(shoe, playerTotal);
  } else {
    playerCards = extractHardHand(shoe, playerTotal);
  }

  if (!playerCards) return null;

  // Extract dealer upcard
  const dealerUp = extractCard(shoe, dealerUpValue);
  if (!dealerUp) return null;

  // Extract dealer hole card (non-ace to avoid blackjack complications)
  const dealerHole = extractRandomNonAce(shoe);
  if (!dealerHole) return null;

  // Arrange shoe: dealer hole, player card 1, dealer up, player card 2, rest
  const arrangedShoe: Card[] = [
    { ...dealerHole, faceUp: false }, // Hole card face down
    { ...playerCards[0], faceUp: true },
    { ...dealerUp, faceUp: true },
    { ...playerCards[1], faceUp: true },
    ...shoe.map(c => ({ ...c, faceUp: true })),
  ];

  return {
    shoe: arrangedShoe,
    runningCount: baseScenario.runningCount,
    trueCount: baseScenario.trueCount,
    cardsDealt: baseScenario.cardsDealt,
    playerCards,
    dealerUpcard: dealerUp,
    dealerHoleCard: dealerHole,
  };
}

/**
 * Get list of available deviations for the dropdown
 */
export function getDeviationOptions(): Array<{ index: number; name: string; description: string }> {
  return ALL_DEVIATIONS.map((dev, index) => {
    // Negative thresholds use "<=" comparison, positive use ">="
    const comparison = dev.tcThreshold < 0 ? '<=' : '>=';
    const tcDisplay = dev.tcThreshold >= 0 ? `+${dev.tcThreshold}` : `${dev.tcThreshold}`;
    return {
      index,
      name: dev.name,
      description: `${dev.name}: ${dev.deviationAction} at TC ${comparison} ${tcDisplay}`,
    };
  });
}

/**
 * Generate a full shoe that will eventually reach the target TC.
 * Returns the full shoe starting from RC=0, player plays until they reach the target.
 */
export function generatePlayToTCShoe(
  targetTC: number,
  numDecks: number,
  tolerance: number = 0.5,
  maxAttempts: number = 500
): GeneratedScenario | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const fullShoe = createShuffledShoe(numDecks);
    let runningCount = 0;

    // Simulate dealing cards to see if this shoe will reach the target TC
    // Leave at least 2 decks for play
    const minCardsRemaining = 2 * 52;

    for (let cardsDealt = 0; cardsDealt < fullShoe.length - minCardsRemaining; cardsDealt++) {
      const card = fullShoe[cardsDealt];
      runningCount += getCountValue(card);

      const decksRemaining = (fullShoe.length - cardsDealt - 1) / 52;
      const currentTC = calculateTrueCount(runningCount, decksRemaining);

      // Check if this shoe will reach the target TC at some point
      if (Math.abs(currentTC - targetTC) <= tolerance) {
        // This shoe will reach the target - return the full shoe from the beginning
        return {
          shoe: fullShoe,
          runningCount: 0, // Starting from beginning
          trueCount: 0, // Starting TC is 0
          cardsDealt: 0,
        };
      }
    }
  }

  // Fallback: return a random shoe
  const fallbackShoe = createShuffledShoe(numDecks);
  return {
    shoe: fallbackShoe,
    runningCount: 0,
    trueCount: 0,
    cardsDealt: 0,
  };
}

/**
 * Generate a full shoe that will eventually encounter the specified deviation.
 * Returns the full shoe starting from RC=0, player plays until they encounter the deviation.
 */
export function generatePlayToDeviationShoe(
  deviationIndex: number,
  numDecks: number,
  maxAttempts: number = 500
): GeneratedScenario | null {
  const deviation = ALL_DEVIATIONS[deviationIndex];
  if (!deviation) return null;

  const { tcThreshold } = deviation;
  const targetTC = tcThreshold;

  // Use the TC generator to find a shoe that reaches the deviation TC
  return generatePlayToTCShoe(targetTC, numDecks, 0.5, maxAttempts);
}

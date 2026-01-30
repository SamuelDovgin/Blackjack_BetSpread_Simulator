// Playing Deviations Module
// Contains the Illustrious 18 and other count-based strategy deviations

import type { PlayerAction, Rank, Card } from '../types';

export interface Deviation {
  /** Deviation name for display */
  name: string;
  /** Player total */
  playerTotal: number;
  /** Whether the hand is soft */
  isSoft: boolean;
  /** Whether this applies to a specific pair */
  isPair: boolean;
  /** Pair value if isPair is true */
  pairValue?: number;
  /** Dealer upcard value (2-11, where 11=Ace) */
  dealerUp: number;
  /** True count threshold (positive = at or above, negative = at or below) */
  tcThreshold: number;
  /** The deviation action (what you do when count is favorable) */
  deviationAction: PlayerAction;
  /** The basic strategy action (what you normally do) */
  basicAction: PlayerAction;
  /** Brief explanation */
  reason: string;
}

// The Illustrious 18 - most important playing deviations
// Listed in order of importance (most valuable first)
export const ILLUSTRIOUS_18: Deviation[] = [
  // 1. Insurance (most important)
  {
    name: 'Insurance',
    playerTotal: 0, // Any total
    isSoft: false,
    isPair: false,
    dealerUp: 11, // Ace
    tcThreshold: 3,
    deviationAction: 'insurance',
    basicAction: 'hit', // Normally decline
    reason: 'Take insurance at TC +3 or higher',
  },

  // 2. 16 vs 10: Stand at TC 0+
  {
    name: '16 vs 10 Stand',
    playerTotal: 16,
    isSoft: false,
    isPair: false,
    dealerUp: 10,
    tcThreshold: 0,
    deviationAction: 'stand',
    basicAction: 'hit',
    reason: 'Stand on 16 vs 10 at TC 0 or higher',
  },

  // 3. 15 vs 10: Stand at TC +4
  {
    name: '15 vs 10 Stand',
    playerTotal: 15,
    isSoft: false,
    isPair: false,
    dealerUp: 10,
    tcThreshold: 4,
    deviationAction: 'stand',
    basicAction: 'hit',
    reason: 'Stand on 15 vs 10 at TC +4 or higher',
  },

  // 4. 10 vs 10: Double at TC +4
  {
    name: '10 vs 10 Double',
    playerTotal: 10,
    isSoft: false,
    isPair: false,
    dealerUp: 10,
    tcThreshold: 4,
    deviationAction: 'double',
    basicAction: 'hit',
    reason: 'Double 10 vs 10 at TC +4 or higher',
  },

  // 5. 12 vs 3: Stand at TC +2
  {
    name: '12 vs 3 Stand',
    playerTotal: 12,
    isSoft: false,
    isPair: false,
    dealerUp: 3,
    tcThreshold: 2,
    deviationAction: 'stand',
    basicAction: 'hit',
    reason: 'Stand on 12 vs 3 at TC +2 or higher',
  },

  // 6. 12 vs 2: Stand at TC +3
  {
    name: '12 vs 2 Stand',
    playerTotal: 12,
    isSoft: false,
    isPair: false,
    dealerUp: 2,
    tcThreshold: 3,
    deviationAction: 'stand',
    basicAction: 'hit',
    reason: 'Stand on 12 vs 2 at TC +3 or higher',
  },

  // 7. 11 vs A: Double at TC +1
  {
    name: '11 vs A Double',
    playerTotal: 11,
    isSoft: false,
    isPair: false,
    dealerUp: 11,
    tcThreshold: 1,
    deviationAction: 'double',
    basicAction: 'hit',
    reason: 'Double 11 vs Ace at TC +1 or higher',
  },

  // 8. 9 vs 2: Double at TC +1
  {
    name: '9 vs 2 Double',
    playerTotal: 9,
    isSoft: false,
    isPair: false,
    dealerUp: 2,
    tcThreshold: 1,
    deviationAction: 'double',
    basicAction: 'hit',
    reason: 'Double 9 vs 2 at TC +1 or higher',
  },

  // 9. 10 vs A: Double at TC +4
  {
    name: '10 vs A Double',
    playerTotal: 10,
    isSoft: false,
    isPair: false,
    dealerUp: 11,
    tcThreshold: 4,
    deviationAction: 'double',
    basicAction: 'hit',
    reason: 'Double 10 vs Ace at TC +4 or higher',
  },

  // 10. 9 vs 7: Double at TC +3
  {
    name: '9 vs 7 Double',
    playerTotal: 9,
    isSoft: false,
    isPair: false,
    dealerUp: 7,
    tcThreshold: 3,
    deviationAction: 'double',
    basicAction: 'hit',
    reason: 'Double 9 vs 7 at TC +3 or higher',
  },

  // 11. 16 vs 9: Stand at TC +5
  {
    name: '16 vs 9 Stand',
    playerTotal: 16,
    isSoft: false,
    isPair: false,
    dealerUp: 9,
    tcThreshold: 5,
    deviationAction: 'stand',
    basicAction: 'hit',
    reason: 'Stand on 16 vs 9 at TC +5 or higher',
  },

  // 12. 13 vs 2: Stand at TC -1 (negative means deviate at TC -1 or LOWER, hit otherwise)
  {
    name: '13 vs 2 Hit',
    playerTotal: 13,
    isSoft: false,
    isPair: false,
    dealerUp: 2,
    tcThreshold: -1,
    deviationAction: 'hit',
    basicAction: 'stand',
    reason: 'Hit 13 vs 2 at TC -1 or lower',
  },

  // 13. 12 vs 4: Stand at TC 0+ (hit at negative)
  {
    name: '12 vs 4 Hit',
    playerTotal: 12,
    isSoft: false,
    isPair: false,
    dealerUp: 4,
    tcThreshold: 0,
    deviationAction: 'stand',
    basicAction: 'stand', // Actually basic is stand, deviate to hit below 0
    reason: 'Hit 12 vs 4 at TC below 0',
  },

  // 14. 12 vs 5: Hit at TC -2 or lower
  {
    name: '12 vs 5 Hit',
    playerTotal: 12,
    isSoft: false,
    isPair: false,
    dealerUp: 5,
    tcThreshold: -2,
    deviationAction: 'hit',
    basicAction: 'stand',
    reason: 'Hit 12 vs 5 at TC -2 or lower',
  },

  // 15. 12 vs 6: Hit at TC -1 or lower
  {
    name: '12 vs 6 Hit',
    playerTotal: 12,
    isSoft: false,
    isPair: false,
    dealerUp: 6,
    tcThreshold: -1,
    deviationAction: 'hit',
    basicAction: 'stand',
    reason: 'Hit 12 vs 6 at TC -1 or lower',
  },

  // 16. 13 vs 3: Hit at TC -2 or lower
  {
    name: '13 vs 3 Hit',
    playerTotal: 13,
    isSoft: false,
    isPair: false,
    dealerUp: 3,
    tcThreshold: -2,
    deviationAction: 'hit',
    basicAction: 'stand',
    reason: 'Hit 13 vs 3 at TC -2 or lower',
  },

  // 17. TT vs 5: Split at TC +5
  {
    name: 'TT vs 5 Split',
    playerTotal: 20,
    isSoft: false,
    isPair: true,
    pairValue: 10,
    dealerUp: 5,
    tcThreshold: 5,
    deviationAction: 'split',
    basicAction: 'stand',
    reason: 'Split 10s vs 5 at TC +5 or higher',
  },

  // 18. TT vs 6: Split at TC +4
  {
    name: 'TT vs 6 Split',
    playerTotal: 20,
    isSoft: false,
    isPair: true,
    pairValue: 10,
    dealerUp: 6,
    tcThreshold: 4,
    deviationAction: 'split',
    basicAction: 'stand',
    reason: 'Split 10s vs 6 at TC +4 or higher',
  },
];

// Additional "Fab Four" surrender deviations (for H17)
export const FAB_FOUR_SURRENDERS: Deviation[] = [
  {
    name: '14 vs 10 Surrender',
    playerTotal: 14,
    isSoft: false,
    isPair: false,
    dealerUp: 10,
    tcThreshold: 3,
    deviationAction: 'surrender',
    basicAction: 'hit',
    reason: 'Surrender 14 vs 10 at TC +3 or higher',
  },
  {
    name: '15 vs 10 Surrender',
    playerTotal: 15,
    isSoft: false,
    isPair: false,
    dealerUp: 10,
    tcThreshold: 0,
    deviationAction: 'surrender',
    basicAction: 'hit',
    reason: 'Surrender 15 vs 10 at TC 0 or higher (instead of hitting)',
  },
  {
    name: '15 vs 9 Surrender',
    playerTotal: 15,
    isSoft: false,
    isPair: false,
    dealerUp: 9,
    tcThreshold: 2,
    deviationAction: 'surrender',
    basicAction: 'hit',
    reason: 'Surrender 15 vs 9 at TC +2 or higher',
  },
  {
    name: '15 vs A Surrender',
    playerTotal: 15,
    isSoft: false,
    isPair: false,
    dealerUp: 11,
    tcThreshold: 1,
    deviationAction: 'surrender',
    basicAction: 'hit',
    reason: 'Surrender 15 vs Ace at TC +1 or higher',
  },
];

export interface DeviationResult {
  /** Whether a deviation applies */
  hasDeviation: boolean;
  /** The deviation if one applies */
  deviation?: Deviation;
  /** The action to take (deviation or basic) */
  action: PlayerAction;
  /** Whether the deviation should be taken at this count */
  shouldDeviate: boolean;
  /** Explanation text */
  reason: string;
}

/**
 * Check if any deviation applies to the current hand
 */
export function checkDeviation(
  playerTotal: number,
  isSoft: boolean,
  isPair: boolean,
  pairValue: number | null,
  dealerUp: number,
  trueCount: number,
  surrenderAllowed: boolean = true,
  includeIllustrious18: boolean = true,
  includeFabFour: boolean = true
): DeviationResult {
  const deviations: Deviation[] = [];

  if (includeIllustrious18) {
    deviations.push(...ILLUSTRIOUS_18);
  }
  if (includeFabFour && surrenderAllowed) {
    deviations.push(...FAB_FOUR_SURRENDERS);
  }

  // Find matching deviation
  for (const dev of deviations) {
    // Check if this deviation matches the hand
    if (dev.isPair) {
      if (!isPair || pairValue !== dev.pairValue) continue;
    } else {
      // IMPORTANT: Do not apply hard/soft total deviations to a splittable pair.
      // Pair decisions are evaluated separately (and have their own pair deviations, e.g. TT vs 5/6).
      // Without this guard, a pair like 6,6 can incorrectly match a "12 vs 6" deviation.
      if (isPair) continue;
      if (dev.playerTotal !== 0 && dev.playerTotal !== playerTotal) continue;
      if (dev.isSoft !== isSoft) continue;
    }

    if (dev.dealerUp !== dealerUp) continue;

    // Found a matching deviation - check if we should apply it
    const shouldDeviate = dev.tcThreshold >= 0
      ? trueCount >= dev.tcThreshold
      : trueCount <= dev.tcThreshold;

    return {
      hasDeviation: true,
      deviation: dev,
      action: shouldDeviate ? dev.deviationAction : dev.basicAction,
      shouldDeviate,
      reason: shouldDeviate
        ? `Deviation: ${dev.reason}`
        : `TC ${trueCount.toFixed(1)} - basic strategy applies`,
    };
  }

  return {
    hasDeviation: false,
    action: 'hit', // Placeholder - caller should use basic strategy
    shouldDeviate: false,
    reason: 'No deviation for this hand',
  };
}

/**
 * Get the insurance decision based on true count
 */
export function shouldTakeInsurance(trueCount: number): boolean {
  // Insurance is profitable at TC +3 or higher
  return trueCount >= 3;
}

/**
 * Get all deviations that apply at the current true count
 */
export function getActiveDeviations(
  trueCount: number,
  surrenderAllowed: boolean = true
): Deviation[] {
  const allDeviations = [...ILLUSTRIOUS_18];
  if (surrenderAllowed) {
    allDeviations.push(...FAB_FOUR_SURRENDERS);
  }

  return allDeviations.filter(dev => {
    return dev.tcThreshold >= 0
      ? trueCount >= dev.tcThreshold
      : trueCount <= dev.tcThreshold;
  });
}

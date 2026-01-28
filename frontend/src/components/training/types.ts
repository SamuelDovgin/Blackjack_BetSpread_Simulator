// Training Mode Types
// These types define the state and configuration for the training mode

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
  faceUp: boolean;
}

export type PlayerAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance';

export type GamePhase =
  | 'idle'           // Waiting to start
  | 'betting'        // Placing bets (if manual betting)
  | 'dealing'        // Cards being dealt with animation
  | 'insurance'      // Insurance decision when dealer shows Ace
  | 'player-action'  // Player making decision
  | 'dealer-turn'    // Dealer playing out hand
  | 'payout'         // Showing results
  | 'feedback';      // Showing feedback for incorrect play

export type HandResult = 'win' | 'lose' | 'push' | 'blackjack' | null;

export interface HandState {
  cards: Card[];
  bet: number;
  isDoubled: boolean;
  isSurrendered: boolean;
  isBusted: boolean;
  isBlackjack: boolean;
  isComplete: boolean;
  // Result after payout resolution
  result?: HandResult;
  // Split-hand flow helpers (optional)
  isSplitHand?: boolean;
  needsSplitCard?: boolean;
  splitCardJustDealt?: boolean;
  isSplitAces?: boolean;
}

export interface GameState {
  phase: GamePhase;
  shoe: Card[];
  cardsDealt: number;
  runningCount: number;

  // Dealer
  dealerHand: Card[];
  dealerTotal: number | null;

  // Player hands (supports splits)
  playerHands: HandState[];
  activeHandIndex: number;

  // Betting
  currentBet: number;
  bankroll: number;

  // Insurance
  insuranceBet: number | null;

  // Round tracking
  roundNumber: number;
  lastAction: PlayerAction | null;
  lastActionCorrect: boolean | null;
  correctAction: PlayerAction | null;
  feedbackMessage: string | null;
}

export interface TrainingSettings {
  // Display
  showCount: boolean;
  showHandTotals: boolean;
  showDeviations: boolean;
  showHints: boolean;

  // Gameplay
  autoBet: boolean;
  defaultBet: number;
  correctionMode: 'inline' | 'modal' | 'off';
  autoAdvanceDelay: number; // ms
  onlyShowMistakes: boolean; // Only show feedback when player makes a mistake

  // Sound
  soundEnabled: boolean;

  // Practice mode
  practiceMode: 'free-play' | 'counting-drill' | 'high-count' | 'situations';

  // High count settings
  highCountTcMin: number;
  highCountTcMax: number;
}

export interface TrainingStats {
  handsPlayed: number;
  correctDecisions: number;
  incorrectDecisions: number;

  // By action type (what the correct action was)
  hitAccuracy: { correct: number; total: number };
  standAccuracy: { correct: number; total: number };
  doubleAccuracy: { correct: number; total: number };
  splitAccuracy: { correct: number; total: number };
  surrenderAccuracy: { correct: number; total: number };

  // By hand type
  hardAccuracy: { correct: number; total: number };
  softAccuracy: { correct: number; total: number };
  pairAccuracy: { correct: number; total: number };

  // Per-hand tracking for weak spots
  handStats: Record<string, { correct: number; total: number; mistakes: Record<string, number> }>;

  // Counting
  countChecksPassed: number;
  countChecksFailed: number;

  // Session
  sessionStart: number;
  totalProfit: number;
}

export interface SessionState {
  settings: TrainingSettings;
  stats: TrainingStats;
  gameState: GameState;
}

// Decision Result Taxonomy
// Distinguishes between basic strategy and deviation outcomes
export type DecisionResultType =
  | 'correct_basic'      // No deviation applies, user did basic correctly
  | 'correct_deviation'  // Deviation applies, user took deviation correctly
  | 'missed_deviation'   // Deviation applies, user did basic instead of deviation
  | 'wrong_deviation'    // User took deviation action but TC wasn't right for it
  | 'incorrect_basic';   // No deviation, user was just wrong

// Decision tracking for feedback
export interface LastDecision {
  /** What the user chose */
  userAction: PlayerAction;
  /** What basic strategy says */
  basicAction: PlayerAction;
  /** What the deviation says (if applicable) */
  deviationAction?: PlayerAction;
  /** The final expected action (deviation if applicable, else basic) */
  correctAction: PlayerAction;
  /** Whether the user was correct */
  isCorrect: boolean;
  /** Decision result classification */
  resultType: DecisionResultType;
  /** Whether a deviation was available for this hand/count */
  deviationApplies: boolean;
  /** Deviation name if applicable (e.g., "I18: 16 vs 10 Stand") */
  deviationName?: string;
  /** TC threshold for the deviation */
  deviationThreshold?: number;
  /** Short explanation of why the correct action is correct */
  reason: string;
  /** Hand key for stats tracking (e.g., "H16vT") */
  handKey: string;
  /** Hand classification */
  handType: 'hard' | 'soft' | 'pair';
  /** Player's total at decision time */
  total: number;
  /** Whether hand was soft */
  isSoft: boolean;
  /** Dealer's upcard value */
  dealerUp: number;
  /** True count at decision time (for deviation tracking) */
  trueCount?: number;
  /** Timestamp */
  timestamp: number;
}

// Weak spot tracking
export interface WeakSpot {
  /** Hand key (e.g., "hard-16-v10") */
  handKey: string;
  /** Number of times this hand was seen */
  occurrences: number;
  /** Number of correct decisions */
  correct: number;
  /** Accuracy percentage */
  accuracy: number;
  /** Most common mistake */
  commonMistake?: PlayerAction;
}

// Default values
export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  showCount: false,        // Hidden by default (realistic practice)
  showHandTotals: false,   // Hidden by default (realistic practice)
  showDeviations: true,
  showHints: false,        // Opt-in feature
  autoBet: true,
  defaultBet: 1,
  correctionMode: 'inline',
  autoAdvanceDelay: 2000,
  onlyShowMistakes: true,  // Only show feedback on mistakes by default
  soundEnabled: false,     // Off by default
  practiceMode: 'free-play',
  highCountTcMin: 2,
  highCountTcMax: 6,
};

export const DEFAULT_TRAINING_STATS: TrainingStats = {
  handsPlayed: 0,
  correctDecisions: 0,
  incorrectDecisions: 0,
  hitAccuracy: { correct: 0, total: 0 },
  standAccuracy: { correct: 0, total: 0 },
  doubleAccuracy: { correct: 0, total: 0 },
  splitAccuracy: { correct: 0, total: 0 },
  surrenderAccuracy: { correct: 0, total: 0 },
  hardAccuracy: { correct: 0, total: 0 },
  softAccuracy: { correct: 0, total: 0 },
  pairAccuracy: { correct: 0, total: 0 },
  handStats: {},
  countChecksPassed: 0,
  countChecksFailed: 0,
  sessionStart: Date.now(),
  totalProfit: 0,
};

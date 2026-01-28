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

export interface HandState {
  cards: Card[];
  bet: number;
  isDoubled: boolean;
  isSurrendered: boolean;
  isBusted: boolean;
  isBlackjack: boolean;
  isComplete: boolean;
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

  // By action type
  hitAccuracy: { correct: number; total: number };
  standAccuracy: { correct: number; total: number };
  doubleAccuracy: { correct: number; total: number };
  splitAccuracy: { correct: number; total: number };
  surrenderAccuracy: { correct: number; total: number };

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
  countChecksPassed: 0,
  countChecksFailed: 0,
  sessionStart: Date.now(),
  totalProfit: 0,
};

// Training Page Component
// Main training mode page with game table and controls
// Cards deal from shoe (right side) with realistic timing

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Table, CARD_SCALE_VALUES } from './Table';
import { ActionButtons } from './ActionButtons';
import { FeedbackPanel, CorrectionModal } from './FeedbackPanel';
import { StatsPanel } from './StatsPanel';
import type {
  GameState,
  GamePhase,
  PlayerAction,
  TrainingSettings,
  TrainingStats,
  LastDecision,
  DecisionResultType,
} from './types';
import {
  DEFAULT_TRAINING_SETTINGS,
  DEFAULT_TRAINING_STATS,
} from './types';
import {
  getBasicStrategyAction,
  DEFAULT_RULES,
  calculateHand,
  isPair,
  getPairValue,
  type RuleSet,
} from './engine/basicStrategy';
import {
  checkDeviation,
  shouldTakeInsurance,
} from './engine/deviations';
import {
  createInitialGameState,
  dealInitialCards,
  revealDealerHoleCard,
  drawCard,
  getCountValue,
  hit,
  stand,
  double,
  split,
  splitSeparate,
  dealToHand,
  surrender,
  resolveRound,
  advanceGame,
  canDouble,
  canSplit,
  canSurrender,
  calculateFullHandTotal,
  calculateTrueCount,
} from './engine/gameEngine';
import './TrainingPage.css';

// Base animation timing constants (ms) — adjusted by dealingSpeed setting
const BASE_TIMING = {
  slow: {
    cardDealAnim: 380,
    dealCardInterval: 460, // faster initial deal, still leaves a small pause after landing
    dealerDrawInterval: 640,
    playerCenterSlide: 360,
    centerBuffer: 100, // pause after sliding the row before dealing the next card
    settleBuffer: 40,
  },
  medium: {
    cardDealAnim: 320,
    dealCardInterval: 360,
    dealerDrawInterval: 560,
    playerCenterSlide: 320,
    centerBuffer: 100,
    settleBuffer: 30,
  },
  fast: {
    cardDealAnim: 240,
    dealCardInterval: 280,
    dealerDrawInterval: 440,
    playerCenterSlide: 240,
    centerBuffer: 70,
    settleBuffer: 20,
  },
};

function getTimingConstants(speed: 'slow' | 'medium' | 'fast') {
  return BASE_TIMING[speed];
}

// Non-speed-dependent constants
const HOLE_CARD_REVEAL_TIME = 500; // Time to flip hole card
const DEALER_STACK_TRANSITION_MS = 400; // Matches Card.css stack transition
const CARD_REMOVE_ANIM_MS = 400; // Matches Card.css removal animation
const SPLIT_SEPARATE_MS = 400; // Matches Card.css splitSlide / splitSettle

function getInitialDealTotalTimeMs(totalCards: number, timing: ReturnType<typeof getTimingConstants>): number {
  // The last card starts at (totalCards - 1) * interval, then runs for cardDealAnim.
  return (timing.dealCardInterval * Math.max(0, totalCards - 1)) + timing.cardDealAnim + 20;
}

function seatForInitialDealIndex(dealIndex: number, handsToPlay: number): number | null {
  const nHands = Math.max(1, Math.min(3, Math.floor(handsToPlay)));
  // dealIndex 0..nHands-1: first card to each seat (L->R)
  if (dealIndex >= 0 && dealIndex <= nHands - 1) return dealIndex;
  // dealIndex nHands: dealer hole card
  if (dealIndex === nHands) return null;
  // dealIndex nHands+1..2*nHands: second card to each seat (L->R)
  if (dealIndex >= (nHands + 1) && dealIndex <= (2 * nHands)) return dealIndex - (nHands + 1);
  // dealIndex 2*nHands+1: dealer upcard
  return null;
}

// localStorage keys for persistence
const STORAGE_KEY_SETTINGS = 'blackjack-training-settings';
const STORAGE_KEY_STATS = 'blackjack-training-stats';

/**
 * Load settings from localStorage, merging with defaults
 */
function loadSettings(): TrainingSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle any new settings added in updates
      return { ...DEFAULT_TRAINING_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load training settings from localStorage:', e);
  }
  return DEFAULT_TRAINING_SETTINGS;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: TrainingSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save training settings to localStorage:', e);
  }
}

/**
 * Load stats from localStorage, resetting session start time
 */
function loadStats(): TrainingStats {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_STATS);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Keep the stored session start time for continuity
      return { ...DEFAULT_TRAINING_STATS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load training stats from localStorage:', e);
  }
  return { ...DEFAULT_TRAINING_STATS, sessionStart: Date.now() };
}

/**
 * Save stats to localStorage
 */
function saveStats(stats: TrainingStats): void {
  try {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats));
  } catch (e) {
    console.warn('Failed to save training stats to localStorage:', e);
  }
}

interface TrainingPageProps {
  onBack: () => void;
  // Config from main app
  numDecks?: number;
  penetration?: number;
  hitSoft17?: boolean;
  allowSurrender?: boolean;
  doubleAfterSplit?: boolean;
  doubleAnyTwo?: boolean;
  resplitAces?: boolean;
  hitSplitAces?: boolean;
  maxSplits?: number;
  blackjackPayout?: number;
  // TC estimation method from simulator settings (perfect, floor, or halfDeck)
  tcEstimationMethod?: 'perfect' | 'floor' | 'halfDeck';
}

export const TrainingPage: React.FC<TrainingPageProps> = ({
  onBack,
  numDecks = 6,
  penetration = 0.75,
  hitSoft17 = true,
  allowSurrender = true,
  doubleAfterSplit = true,
  doubleAnyTwo = true,
  resplitAces = false,
  hitSplitAces = false,
  maxSplits = 3,
  blackjackPayout = 1.5,
  tcEstimationMethod = 'floor',
}) => {
  // Game state
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGameState(numDecks, 1000)
  );

  // Settings (persisted to localStorage)
  const [settings, setSettings] = useState<TrainingSettings>(() => loadSettings());

  // Stats (persisted to localStorage)
  const [stats, setStats] = useState<TrainingStats>(() => loadStats());

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [isRevealingHoleCard, setIsRevealingHoleCard] = useState(false);
  const [isRemovingCards, setIsRemovingCards] = useState(false);
  const [isDealerStacked, setIsDealerStacked] = useState(false);
  const [visibleCardCount, setVisibleCardCount] = useState<number>(999);
  const [actionLocked, setActionLocked] = useState(false);
  const [showBadges, setShowBadges] = useState(true); // Hide badges during card animations
  const [isSplitting, setIsSplitting] = useState(false); // During split card separation animation
  const [splitDealingPhase, setSplitDealingPhase] = useState<number>(0); // 0=none, 1=dealing to right, 2=dealing to left, 3=centering (no dealing)
  const [splitOriginHandIndex, setSplitOriginHandIndex] = useState<number | null>(null); // for split animations/layout

  // Decision validation state
  const [lastDecision, setLastDecision] = useState<LastDecision | null>(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const preActionStateRef = useRef<GameState | null>(null);

  // Stats panel state
  const [showStats, setShowStats] = useState(false);

  // Insurance state
  const [showInsurancePrompt, setShowInsurancePrompt] = useState(false);
  const [insuranceDecisionMade, setInsuranceDecisionMade] = useState(false);

  // Build RuleSet from props
  const ruleSet: RuleSet = {
    ...DEFAULT_RULES,
    hitSoft17,
    doubleAfterSplit,
    doubleAnyTwo,
    surrenderAllowed: allowSurrender,
    numDecks,
    resplitAces,
    hitSplitAces,
  };

  // Timing constants ref — always reflects the current dealingSpeed so every
  // callback (split animations, hit delays, dealer auto-play, etc.) uses the
  // correct timing without needing it in its dependency array.
  const timingRef = useRef(getTimingConstants(settings.dealingSpeed ?? 'medium'));
  useEffect(() => {
    timingRef.current = getTimingConstants(settings.dealingSpeed ?? 'medium');
  }, [settings.dealingSpeed]);

  const timersRef = useRef<number[]>([]);
  const queuedActionRef = useRef<PlayerAction | null>(null);
  const clearTimers = () => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  };

  const clearSplitDealFlags = (state: GameState): GameState => {
    let changed = false;
    const newHands = state.playerHands.map((hand) => {
      if (hand.splitCardJustDealt) {
        changed = true;
        return { ...hand, splitCardJustDealt: false };
      }
      return hand;
    });
    return changed ? { ...state, playerHands: newHands } : state;
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  // Persist settings to localStorage when they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const cycleHandsToPlay = useCallback(() => {
    setSettings((s) => {
      const current = s.handsToPlay ?? 1;
      const next = current === 1 ? 2 : current === 2 ? 3 : 1;
      return { ...s, handsToPlay: next };
    });
  }, []);

  // Persist stats to localStorage when they change (debounced to avoid excessive writes)
  const statsTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (statsTimeoutRef.current) {
      window.clearTimeout(statsTimeoutRef.current);
    }
    statsTimeoutRef.current = window.setTimeout(() => {
      saveStats(stats);
    }, 500); // Debounce 500ms
    return () => {
      if (statsTimeoutRef.current) {
        window.clearTimeout(statsTimeoutRef.current);
      }
    };
  }, [stats]);

  // Total cards in full shoe
  const totalCards = numDecks * 52;

  // Calculate derived values
  const decksRemaining = (gameState.shoe.length / 52);
  const rawTrueCount = calculateTrueCount(gameState.runningCount, decksRemaining);

  // Helper to apply TC estimation method (floor for realistic casino play)
  // Prefer the persisted training setting; fall back to prop for backwards compat
  const effectiveTcMethod = settings.tcEstimationMethod ?? tcEstimationMethod;
  const applyTcEstimation = useCallback((rawTc: number): number => {
    if (effectiveTcMethod === 'floor') {
      return Math.floor(rawTc);
    } else if (effectiveTcMethod === 'halfDeck') {
      return Math.round(rawTc * 2) / 2; // Round to nearest 0.5
    }
    return rawTc;
  }, [effectiveTcMethod]);

  const trueCount = applyTcEstimation(rawTrueCount);

  // Current hand
  const currentHand = gameState.playerHands[gameState.activeHandIndex];
  // Dealer's upcard is the second card dealt (index 1), first card is hole card (face down)
  const dealerUpcard = gameState.dealerHand[1];

  // Check available actions
  const canHitAction = currentHand && !currentHand.isComplete;
  const canStandAction = currentHand && !currentHand.isComplete;
  const canDoubleAction = currentHand && canDouble(currentHand);
  const canSplitAction = currentHand && canSplit(currentHand);
  const canSurrenderAction = currentHand && dealerUpcard && canSurrender(currentHand, dealerUpcard, allowSurrender);

  // Need to reshuffle?
  const needsReshuffle = gameState.shoe.length < (numDecks * 52 * (1 - penetration));

  // Start a new hand with dealing animation
  const startNewHand = useCallback(() => {
    clearTimers();
    setActionLocked(false);
    queuedActionRef.current = null;
    setIsRemovingCards(false);
    setIsRevealingHoleCard(false);
    setIsDealerStacked(false);
    setIsSplitting(false);
    setSplitDealingPhase(0);
    setSplitOriginHandIndex(null);
    setShowBadges(true);
    setLastDecision(null);
    setShowCorrectionModal(false);

    const handsToPlay = settings.handsToPlay ?? 1;
    const initialCardsToShow = (2 * handsToPlay) + 2; // 2 per player hand + dealer hole + dealer upcard

    // Get timing constants based on dealing speed setting
    const timing = getTimingConstants(settings.dealingSpeed ?? 'medium');
    const DEAL_CARD_INTERVAL_MS = timing.dealCardInterval; // includes a pause after the card lands
    const PLAYER_CENTER_SLIDE_MS = timing.playerCenterSlide;
    const PLAYER_CENTER_BUFFER_MS = timing.centerBuffer;

    // Gate visibility so cards appear sequentially with no overlap.
    // For multi-hand deals, "pan" the centered hand so every dealt player card lands on the centered hand.
    // (We never deal a card while the row is still sliding.)
    setVisibleCardCount(1);

    // The first card is visible immediately; schedule subsequent cards at a fixed interval.
    // Interval > animation duration gives a "dealer pause" between cards.
    let t = DEAL_CARD_INTERVAL_MS;
    let currentSeat = 0;

    const scheduleSetSeat = (seat: number, atMs: number) => {
      const id = window.setTimeout(() => {
        setGameState((prev) => {
          if (prev.phase !== 'dealing') return prev;
          return { ...prev, activeHandIndex: seat };
        });
      }, atMs);
      timersRef.current.push(id);
    };

    const scheduleShowCount = (count: number, atMs: number) => {
      const id = window.setTimeout(() => setVisibleCardCount(count), atMs);
      timersRef.current.push(id);
    };

    for (let count = 2; count <= initialCardsToShow; count++) {
      const dealIndex = count - 1;
      const seat = seatForInitialDealIndex(dealIndex, handsToPlay);

      if (seat !== null && seat !== currentSeat) {
        // Move the "camera" to the next seat, then wait until the slide finishes.
        scheduleSetSeat(seat, t);
        t += PLAYER_CENTER_SLIDE_MS + PLAYER_CENTER_BUFFER_MS;
        currentSeat = seat;
      }

      scheduleShowCount(count, t);
      t += DEAL_CARD_INTERVAL_MS;
    }

    // Deal cards - this sets phase to 'dealing'
    setGameState((prev) => {
      const reshuffleAt = numDecks * 52 * (1 - penetration);
      const needShuffle = prev.shoe.length < reshuffleAt;
      const base = needShuffle ? createInitialGameState(numDecks, prev.bankroll) : prev;
      return dealInitialCards(base, settings.defaultBet, handsToPlay);
    });

    // After the last card finishes moving, transition to player-action or dealer-turn.
    const doneId = window.setTimeout(() => {
      setVisibleCardCount(999);
      setInsuranceDecisionMade(false);
      setGameState((prev) => {
        const dealerHand = prev.dealerHand;
        // Upcard is index 1 (second card dealt), hole card is index 0
        const dealerUpcard = dealerHand[1];
        const dealerHasBJ = dealerHand.length === 2 && calculateFullHandTotal(dealerHand).total === 21;

        const updatedHands = prev.playerHands.map((h) => {
          if (!h) return h;
          const total = calculateFullHandTotal(h.cards).total;
          if (h.isBlackjack || total === 21) {
            return { ...h, isComplete: true };
          }
          return h;
        });

        let nextActive = 0;
        for (let i = updatedHands.length - 1; i >= 0; i--) {
          if (!updatedHands[i]?.isComplete) {
            nextActive = i;
            break;
          }
        }

        // If dealer has a natural, the round ends immediately (reveal hole card then pay).
        if (dealerHasBJ) {
          return { ...prev, playerHands: updatedHands, activeHandIndex: nextActive, phase: 'dealer-turn' as GamePhase };
        }

        // Check if dealer shows Ace - offer insurance
        if (dealerUpcard?.rank === 'A') {
          setShowInsurancePrompt(true);
          return { ...prev, playerHands: updatedHands, activeHandIndex: nextActive, phase: 'insurance' as GamePhase };
        }

        // If every player hand is already complete (e.g., all naturals), skip directly to dealer reveal/payout.
        if (updatedHands.length > 0 && updatedHands.every((h) => h.isComplete)) {
          return { ...prev, playerHands: updatedHands, activeHandIndex: nextActive, phase: 'dealer-turn' as GamePhase };
        }

        return { ...prev, playerHands: updatedHands, activeHandIndex: nextActive, phase: 'player-action' as GamePhase };
      });
    }, Math.max(getInitialDealTotalTimeMs(initialCardsToShow, timing), t));
    timersRef.current.push(doneId);
  }, [numDecks, penetration, settings.defaultBet, settings.handsToPlay, settings.dealingSpeed, blackjackPayout]);

  // Validate action against basic strategy and track decision
  const validateAndTrackDecision = useCallback((
    action: PlayerAction,
    state: GameState
  ): { decision: LastDecision; shouldBlock: boolean } => {
    const hand = state.playerHands[state.activeHandIndex];
    // Upcard is index 1 (second card dealt), hole card is index 0
    const dealerUpcard = state.dealerHand[1];

    if (!hand || !dealerUpcard) {
      // Shouldn't happen, but return a dummy decision
      return {
        decision: {
          userAction: action,
          basicAction: action,
          correctAction: action,
          isCorrect: true,
          resultType: 'correct_basic',
          deviationApplies: false,
          reason: '',
          handKey: '',
          handType: 'hard',
          total: 0,
          isSoft: false,
          dealerUp: 0,
          timestamp: Date.now(),
        },
        shouldBlock: false,
      };
    }

    // Get basic strategy recommendation
    const strategyResult = getBasicStrategyAction({
      playerCards: hand.cards,
      dealerUpcard,
      rules: ruleSet,
      isSplitHand: hand.isSplitHand,
      canDouble: canDouble(hand),
      canSplit: canSplit(hand),
      canSurrender: canSurrender(hand, dealerUpcard, allowSurrender),
    });

    const rawTc = calculateTrueCount(state.runningCount, state.shoe.length / 52);
    const tc = applyTcEstimation(rawTc);
    const basicAction = strategyResult.action;

    // Default to basic strategy
    let correctAction = basicAction;
    let reason = strategyResult.reason;
    let deviationApplies = false;
    let deviationAction: PlayerAction | undefined;
    let deviationName: string | undefined;
    let deviationThreshold: number | undefined;

    // Check for deviations if enabled
    if (settings.showDeviations) {
      const { total, isSoft } = calculateHand(hand.cards);
      const pairVal = isPair(hand.cards) ? getPairValue(hand.cards) : null;
      const dealerUp = strategyResult.dealerUp;

      const deviationResult = checkDeviation(
        total,
        isSoft,
        isPair(hand.cards) && canSplit(hand),
        pairVal,
        dealerUp,
        tc,
        allowSurrender
      );

      if (deviationResult.hasDeviation && deviationResult.deviation) {
        // A deviation exists for this hand/dealer combo
        deviationName = deviationResult.deviation.name;
        deviationThreshold = deviationResult.deviation.tcThreshold;
        deviationAction = deviationResult.deviation.deviationAction;

        if (deviationResult.shouldDeviate) {
          // TC meets threshold - deviation applies
          deviationApplies = true;
          correctAction = deviationResult.deviation.deviationAction;
          reason = deviationResult.reason;
        }
        // If TC doesn't meet threshold, basic strategy applies (deviationApplies stays false)
      }
    }

    const isCorrect = action === correctAction;

    // Determine result type based on taxonomy
    let resultType: DecisionResultType;
    if (deviationApplies) {
      // A deviation was applicable at this TC
      if (action === correctAction) {
        resultType = 'correct_deviation';
      } else if (action === basicAction) {
        resultType = 'missed_deviation';
      } else {
        resultType = 'incorrect_basic';
      }
    } else {
      // No deviation applies (either no deviation exists, or TC doesn't meet threshold)
      if (action === correctAction) {
        resultType = 'correct_basic';
      } else if (deviationAction && action === deviationAction) {
        // User tried to deviate when they shouldn't have
        resultType = 'wrong_deviation';
      } else {
        resultType = 'incorrect_basic';
      }
    }

    const decision: LastDecision = {
      userAction: action,
      basicAction,
      deviationAction,
      correctAction,
      isCorrect,
      resultType,
      deviationApplies,
      deviationName,
      deviationThreshold,
      reason,
      handKey: strategyResult.handKey,
      handType: strategyResult.handType,
      total: strategyResult.total,
      isSoft: strategyResult.isSoft,
      dealerUp: strategyResult.dealerUp,
      trueCount: tc,
      timestamp: Date.now(),
    };

    // Block if correction mode is modal and decision was incorrect
    const shouldBlock = !isCorrect && settings.correctionMode === 'modal';

    return { decision, shouldBlock };
  }, [ruleSet, allowSurrender, settings.correctionMode, settings.showDeviations, applyTcEstimation]);

  // Update stats after a decision
  const updateStatsForDecision = useCallback((decision: LastDecision) => {
    setStats(prev => {
      const newStats = { ...prev };

      // Update overall accuracy
      if (decision.isCorrect) {
        newStats.correctDecisions++;
      } else {
        newStats.incorrectDecisions++;
      }

      // Update accuracy by correct action type
      const actionKey = `${decision.correctAction}Accuracy` as keyof TrainingStats;
      const actionStat = prev[actionKey] as { correct: number; total: number } | undefined;
      if (actionStat) {
        (newStats[actionKey] as { correct: number; total: number }) = {
          correct: actionStat.correct + (decision.isCorrect ? 1 : 0),
          total: actionStat.total + 1,
        };
      }

      // Update accuracy by hand type
      const handTypeKey = `${decision.handType}Accuracy` as keyof TrainingStats;
      const handTypeStat = prev[handTypeKey] as { correct: number; total: number } | undefined;
      if (handTypeStat) {
        (newStats[handTypeKey] as { correct: number; total: number }) = {
          correct: handTypeStat.correct + (decision.isCorrect ? 1 : 0),
          total: handTypeStat.total + 1,
        };
      }

      // Update per-hand stats for weak spot tracking
      const handKey = decision.handKey;
      const existing = prev.handStats[handKey] || { correct: 0, total: 0, mistakes: {} };
      const newHandStat = {
        correct: existing.correct + (decision.isCorrect ? 1 : 0),
        total: existing.total + 1,
        mistakes: { ...existing.mistakes },
      };
      if (!decision.isCorrect) {
        const mistakeKey = decision.userAction;
        newHandStat.mistakes[mistakeKey] = (newHandStat.mistakes[mistakeKey] || 0) + 1;
      }
      newStats.handStats = { ...newStats.handStats, [handKey]: newHandStat };

      return newStats;
    });
  }, []);

  // Handle "Take it back" from correction modal - restore pre-action state
  const handleTakeBack = useCallback(() => {
    setShowCorrectionModal(false);
    // Restore state is automatic since we blocked the action
    // Just clear the decision so user can try again
    setLastDecision(null);
  }, []);

  // Handle insurance decision
  const handleTakeInsurance = useCallback(() => {
    setShowInsurancePrompt(false);
    setInsuranceDecisionMade(true);

    // Validate insurance decision against deviations
    if (settings.correctionMode !== 'off') {
      const rawTc = calculateTrueCount(gameState.runningCount, gameState.shoe.length / 52);
      const tc = applyTcEstimation(rawTc);
      const shouldTake = shouldTakeInsurance(tc);
      const isCorrect = shouldTake; // Taking insurance is correct at TC +3 or higher

      // Determine result type for insurance
      let resultType: DecisionResultType;
      if (shouldTake) {
        resultType = 'correct_deviation'; // Taking insurance at high count is a deviation play
      } else {
        resultType = 'wrong_deviation'; // Took insurance when TC didn't support it
      }

      const decision: LastDecision = {
        userAction: 'insurance',
        basicAction: 'hit', // Basic strategy is to decline insurance
        deviationAction: 'insurance',
        correctAction: shouldTake ? 'insurance' : 'hit',
        isCorrect,
        resultType,
        deviationApplies: shouldTake,
        deviationName: 'Insurance',
        deviationThreshold: 3,
        reason: shouldTake
          ? `Correct! Take insurance at TC ${tc.toFixed(1)} (threshold: +3)`
          : `Insurance is -EV at TC ${tc.toFixed(1)}. Only take at TC +3 or higher.`,
        handKey: 'insurance-vA',
        handType: 'hard',
        total: 0,
        isSoft: false,
        dealerUp: 11,
        trueCount: tc,
        timestamp: Date.now(),
      };

      updateStatsForDecision(decision);
      setLastDecision(decision);
    }

    // Continue to player action phase
    setGameState(prev => ({ ...prev, phase: 'player-action' as GamePhase }));
  }, [gameState.runningCount, gameState.shoe.length, settings.correctionMode, updateStatsForDecision, applyTcEstimation]);

  const handleDeclineInsurance = useCallback(() => {
    setShowInsurancePrompt(false);
    setInsuranceDecisionMade(true);

    // Validate insurance decision against deviations
    if (settings.correctionMode !== 'off') {
      const rawTc = calculateTrueCount(gameState.runningCount, gameState.shoe.length / 52);
      const tc = applyTcEstimation(rawTc);
      const shouldTake = shouldTakeInsurance(tc);
      const isCorrect = !shouldTake; // Declining is correct when TC < +3

      // Determine result type for declining insurance
      let resultType: DecisionResultType;
      if (!shouldTake) {
        resultType = 'correct_basic'; // Correct to decline when TC is low
      } else {
        resultType = 'missed_deviation'; // Should have taken insurance at high count
      }

      const decision: LastDecision = {
        userAction: 'hit', // 'hit' represents declining insurance
        basicAction: 'hit',
        deviationAction: 'insurance',
        correctAction: shouldTake ? 'insurance' : 'hit',
        isCorrect,
        resultType,
        deviationApplies: shouldTake,
        deviationName: 'Insurance',
        deviationThreshold: 3,
        reason: !shouldTake
          ? `Correct! Decline insurance at TC ${tc.toFixed(1)} (below +3 threshold)`
          : `Should take insurance at TC ${tc.toFixed(1)} (+3 or higher)`,
        handKey: 'insurance-vA',
        handType: 'hard',
        total: 0,
        isSoft: false,
        dealerUp: 11,
        trueCount: tc,
        timestamp: Date.now(),
      };

      updateStatsForDecision(decision);
      setLastDecision(decision);
    }

    // Continue to player action phase
    setGameState(prev => ({ ...prev, phase: 'player-action' as GamePhase }));
  }, [gameState.runningCount, gameState.shoe.length, settings.correctionMode, updateStatsForDecision, applyTcEstimation]);

  // Handle "Continue anyway" from correction modal - execute the incorrect action
  const handleContinueAnyway = useCallback(() => {
    setShowCorrectionModal(false);

    // Execute the action that was blocked
    if (lastDecision) {
      const action = lastDecision.userAction;

      // Re-run the action logic without validation blocking
      // (stats already tracked when modal was shown)
      if (action === 'split') {
        // Trigger split animation
        const originIdx = gameState.activeHandIndex;
        setActionLocked(true);
        setShowBadges(false);
        setSplitOriginHandIndex(originIdx);
        setIsSplitting(true);
        setGameState((prev) => {
          if (prev.phase !== 'player-action') return prev;
          return splitSeparate(prev);
        });
        // (split animation continuation handled by existing timer logic)
        const phase1Id = window.setTimeout(() => {
          setIsSplitting(false);
          setSplitDealingPhase(3);
          setGameState((prev) => {
            const rightIdx = Math.min(originIdx + 1, prev.playerHands.length - 1);
            return { ...prev, activeHandIndex: rightIdx };
          });
          const phaseCenterId = window.setTimeout(() => {
            setSplitDealingPhase(1);
            setGameState((prev) => {
              const rightIdx = Math.min(originIdx + 1, prev.playerHands.length - 1);
              return dealToHand(prev, rightIdx);
            });
            const phase2Id = window.setTimeout(() => {
              setSplitDealingPhase(0);
              setShowBadges(true);
              setActionLocked(false);
              setSplitOriginHandIndex(null);
              setGameState((prev) => {
                const next = clearSplitDealFlags(prev);
                const rightIdx = next.activeHandIndex;
                const right = next.playerHands[rightIdx];
                return right?.isComplete ? advanceGame(next) : next;
              });
            }, timingRef.current.cardDealAnim + 40);
            timersRef.current.push(phase2Id);
          }, timingRef.current.playerCenterSlide + timingRef.current.centerBuffer);
          timersRef.current.push(phaseCenterId);
        }, SPLIT_SEPARATE_MS);
        timersRef.current.push(phase1Id);
      } else {
        // Execute non-split action
        const needsCardAnimation = action === 'hit' || action === 'double';

        setGameState((prev) => {
          if (prev.phase !== 'player-action') return prev;
          let newState = prev;
          switch (action) {
            case 'hit': newState = hit(newState); break;
            case 'stand': newState = stand(newState); break;
            case 'double': newState = double(newState); break;
            case 'surrender': newState = surrender(newState); break;
          }
          if (!needsCardAnimation) {
            const hand = newState.playerHands[newState.activeHandIndex];
            if (hand?.isComplete) {
              newState = advanceGame(newState);
            }
          }
          return newState;
        });

        if (needsCardAnimation) {
          setActionLocked(true);
          setShowBadges(false);
          const id = window.setTimeout(() => {
            setShowBadges(true);
            setGameState((prev) => {
              if (prev.phase !== 'player-action') {
                setActionLocked(false);
                return prev;
              }
              const hand = prev.playerHands[prev.activeHandIndex];
              if (!hand) {
                setActionLocked(false);
                return prev;
              }
              const total = calculateFullHandTotal(hand.cards).total;
              const isBust = total > 21;
              const is21 = total === 21;
              if (isBust || is21) {
                let newState = prev;
                if (!hand.isComplete) {
                  const updatedHand = { ...hand, isComplete: true, isBusted: isBust };
                  const newHands = [...newState.playerHands];
                  newHands[newState.activeHandIndex] = updatedHand;
                  newState = { ...newState, playerHands: newHands };
                }
                const delayId = window.setTimeout(() => {
                  setActionLocked(false);
                  setGameState((current) => {
                    if (current.phase !== 'player-action') return current;
                    return advanceGame(current);
                  });
                }, 800);
                timersRef.current.push(delayId);
                return newState;
              }
              if (hand.isComplete) {
                setActionLocked(false);
                return advanceGame(clearSplitDealFlags(prev));
              }
              setActionLocked(false);
              return clearSplitDealFlags(prev);
            });
          }, timingRef.current.cardDealAnim + 40);
          timersRef.current.push(id);
        }
      }
    }
  }, [lastDecision, gameState.activeHandIndex]);

  // Handle player action - uses functional updates to avoid stale closure issues
  const handleAction = useCallback((action: PlayerAction) => {
    if (actionLocked) {
      // Let the user tap Stand/Surrender while a card is still moving; apply it
      // as soon as the deal animation finishes so the UI never feels "dead".
      if (action === 'stand' || action === 'surrender') {
        queuedActionRef.current = action;
      }
      return;
    }

    queuedActionRef.current = null;

    // Clear previous decision feedback when starting new action
    if (settings.correctionMode !== 'off') {
      setLastDecision(null);
    }

    // Validate decision against basic strategy
    const { decision, shouldBlock } = validateAndTrackDecision(action, gameState);

    // Save pre-action state for potential take-back
    preActionStateRef.current = gameState;

    // Track decision in stats
    if (settings.correctionMode !== 'off') {
      updateStatsForDecision(decision);
      setLastDecision(decision);

      // If modal mode and incorrect, show modal and block action
      if (shouldBlock) {
        setShowCorrectionModal(true);
        return;
      }
    }

    // Split has special multi-phase animation handling
    if (action === 'split') {
      const originIdx = gameState.activeHandIndex;
      setActionLocked(true);
      setShowBadges(false);
      setSplitOriginHandIndex(originIdx);

      // Phase 1: Separate the cards (top card visually moves to right)
      setIsSplitting(true);
      setGameState((prev) => {
        if (prev.phase !== 'player-action') return prev;
        return splitSeparate(prev);
      });

      // After card separation animation:
      // 1) Slide so the right-hand split is centered (no dealing while sliding)
      // 2) Deal the first post-split card to the right hand
      const phase1Id = window.setTimeout(() => {
        setIsSplitting(false);

        // Block auto-deal while we move the camera to the right hand.
        setSplitDealingPhase(3);
        setGameState((prev) => {
          const rightIdx = Math.min(originIdx + 1, prev.playerHands.length - 1);
          return { ...prev, activeHandIndex: rightIdx };
        });

        const phaseCenterId = window.setTimeout(() => {
          setSplitDealingPhase(1);
          setGameState((prev) => {
            const rightIdx = Math.min(originIdx + 1, prev.playerHands.length - 1);
            return dealToHand(prev, rightIdx);
          });

          // After right hand card animation, allow play on the right hand.
          const phase2Id = window.setTimeout(() => {
            setSplitDealingPhase(0);
            setShowBadges(true);
            setActionLocked(false);
            setSplitOriginHandIndex(null);

            setGameState((prev) => {
              const next = clearSplitDealFlags(prev);
              const rightIdx = next.activeHandIndex;
              const right = next.playerHands[rightIdx];
              return right?.isComplete ? advanceGame(next) : next;
            });
          }, timingRef.current.cardDealAnim + 40);
          timersRef.current.push(phase2Id);
        }, timingRef.current.playerCenterSlide + timingRef.current.centerBuffer);
        timersRef.current.push(phaseCenterId);
      }, SPLIT_SEPARATE_MS); // Card separation animation time
      timersRef.current.push(phase1Id);

      return;
    }

    // For actions that deal a card (hit, double), we need to:
    // 1. Apply the action immediately (card starts animating)
    // 2. Hide badges during animation
    // 3. After animation, show badges and check for bust/21
    // 4. If bust/21, wait a moment for user to see badge, then advance
    const needsCardAnimation = action === 'hit' || action === 'double';

    // Use functional update to always get fresh state
    setGameState((prev) => {
      if (prev.phase !== 'player-action') return prev;

      let newState = prev;

      switch (action) {
        case 'hit':
          newState = hit(newState);
          break;
        case 'stand':
          newState = stand(newState);
          break;
        case 'double':
          newState = double(newState);
          break;
        case 'surrender':
          newState = surrender(newState);
          break;
      }

      // For card-dealing actions, DON'T advance game yet - let the animation play
      // and the delayed callback handle the advancement
      if (needsCardAnimation) {
        // Just apply the action, don't check for bust/21/advance yet
        return newState;
      }

      // For stand/surrender, advance immediately
      const hand = newState.playerHands[newState.activeHandIndex];
      if (hand?.isComplete) {
        newState = advanceGame(newState);
      }

      return newState;
    });


    // Prevent spam-clicking while the dealt card is still moving.
    if (needsCardAnimation) {
      setActionLocked(true);
      setShowBadges(false); // Hide badges during card animation

      const id = window.setTimeout(() => {
        setShowBadges(true); // Show badges after card animation

        // Check if hand is bust or 21, handle delayed advancement
        setGameState((prev) => {
          if (prev.phase !== 'player-action') {
            setActionLocked(false);
            return prev;
          }

          const hand = prev.playerHands[prev.activeHandIndex];
          if (!hand) {
            setActionLocked(false);
            return prev;
          }

          const total = calculateFullHandTotal(hand.cards).total;
          const isBust = total > 21;
          const is21 = total === 21;

          // If bust or 21, wait a moment for user to see the badge, then advance
          if (isBust || is21) {
            // Mark hand complete if needed
            let newState = prev;
            if (!hand.isComplete) {
              const updatedHand = { ...hand, isComplete: true, isBusted: isBust };
              const newHands = [...newState.playerHands];
              newHands[newState.activeHandIndex] = updatedHand;
              newState = { ...newState, playerHands: newHands };
            }

            // Delay advancement so user can see BUST/21 badge
            const delayId = window.setTimeout(() => {
              setActionLocked(false);
              setGameState((current) => {
                if (current.phase !== 'player-action') return current;
                return advanceGame(current);
              });
            }, 800); // 800ms delay to see badge
            timersRef.current.push(delayId);

            return newState;
          }

          // Double always ends the hand (even if not bust/21). Advance after the card lands.
          if (hand.isComplete) {
            setActionLocked(false);
            return advanceGame(clearSplitDealFlags(prev));
          }

          // Hand is still in play, unlock actions
          setActionLocked(false);
          setGameState((prevState) => clearSplitDealFlags(prevState));

          // Check for any queued actions
          const queued = queuedActionRef.current;
          if (queued) {
            queuedActionRef.current = null;
            let next = prev;
            if (queued === 'stand') next = stand(next);
            if (queued === 'surrender') next = surrender(next);

            const h = next.playerHands[next.activeHandIndex];
            if (h?.isComplete) {
              next = advanceGame(next);
            }
            return next;
          }

          return prev;
        });
      }, timingRef.current.cardDealAnim + 40);
      timersRef.current.push(id);
    }
  }, [actionLocked, gameState, validateAndTrackDecision, updateStatsForDecision, settings.correctionMode]);

  // When switching to a split hand that still needs its first post-split card,
  // deal it before allowing play. Wait for centering animation first.
  useEffect(() => {
    if (gameState.phase !== 'player-action') return;
    const active = gameState.playerHands[gameState.activeHandIndex];
    if (!active?.needsSplitCard) return;
    // Don't interfere with the initial split animation / right-hand deal.
    if (isSplitting || splitDealingPhase !== 0) return;

    setActionLocked(true);
    setShowBadges(false);

    // Wait for the centering animation before dealing
    const centerDelay = window.setTimeout(() => {
      setSplitDealingPhase(2);
      setGameState((prev) => dealToHand(prev, prev.activeHandIndex));

      const id = window.setTimeout(() => {
        setSplitDealingPhase(0);
        setShowBadges(true);
        setActionLocked(false);
        setGameState((prev) => {
          let next = clearSplitDealFlags(prev);
          const hand = next.playerHands[next.activeHandIndex];
          if (hand?.isComplete) {
            next = advanceGame(next);
          }
          return next;
        });
      }, timingRef.current.cardDealAnim + 40);

      timersRef.current.push(id);
    }, timingRef.current.playerCenterSlide + timingRef.current.centerBuffer);

    timersRef.current.push(centerDelay);
  }, [gameState.phase, gameState.activeHandIndex, isSplitting, splitDealingPhase]);

  // Auto-play dealer when it's dealer's turn
  useEffect(() => {
    if (gameState.phase === 'dealer-turn') {
      clearTimers();
      let cancelled = false;

      // Flip animation for the hole card. We reveal the card in state halfway through
      // so there is no "flip then swap" feeling.
      setIsDealerStacked(false);
      setIsRevealingHoleCard(true);

      const midId = window.setTimeout(() => {
        if (cancelled) return;
        setGameState((prev) => revealDealerHoleCard(prev));
      }, HOLE_CARD_REVEAL_TIME / 2);
      timersRef.current.push(midId);

      const endId = window.setTimeout(() => {
        if (cancelled) return;
        setIsRevealingHoleCard(false);
        setIsDealerStacked(true);

        const run = async () => {
          // Wait for the "stack slide" to finish before any new dealer cards appear.
          await new Promise((r) => window.setTimeout(r, DEALER_STACK_TRANSITION_MS + 20));
          if (cancelled) return;

          // Play out dealer hand one card at a time (no vertical motion; no overlap).
          let current = revealDealerHoleCard(gameState);
          setGameState(current);

          // Blackjack resolution: if either side has a natural, we only reveal the hole card and pay.
          const dealerHasBJ =
            current.dealerHand.length === 2 && calculateFullHandTotal(current.dealerHand).total === 21;
          if (dealerHasBJ) {
            const resolved = resolveRound(current, blackjackPayout);
            setGameState({ ...resolved, phase: 'payout' });
            return;
          }

          // If no player hand needs a dealer comparison (all are busted/surrendered/blackjack),
          // the dealer should not draw any additional cards. Reveal hole card, then resolve.
          const needsDealerPlay = current.playerHands.some(
            (h) => !h.isBusted && !h.isSurrendered && !h.isBlackjack
          );
          if (!needsDealerPlay) {
            const resolved = resolveRound(current, blackjackPayout);
            setGameState({ ...resolved, phase: 'payout' });
            return;
          }

          while (!cancelled) {
            const { total, isSoft } = calculateFullHandTotal(current.dealerHand);
            const shouldHit = total < 17 || (total === 17 && isSoft && hitSoft17);
            if (!shouldHit) break;

            const draw = drawCard(current.shoe);
            if (!draw) break;

            const nextDealerHand = [...current.dealerHand, draw.card];
            const nextRunning = current.runningCount + getCountValue(draw.card);
            const nextDealerTotal = calculateFullHandTotal(nextDealerHand).total;

            current = {
              ...current,
              shoe: draw.remainingShoe,
              dealerHand: nextDealerHand,
              dealerTotal: nextDealerTotal,
              runningCount: nextRunning,
              cardsDealt: current.cardsDealt + 1,
            };
            setGameState(current);

            // Wait until this new dealer card finishes its deal animation.
            await new Promise((r) => window.setTimeout(r, timingRef.current.dealerDrawInterval));
          }

          if (cancelled) return;

          // Resolve payouts and show outcome.
          const finalDealerTotal = current.dealerTotal ?? calculateFullHandTotal(current.dealerHand).total;

          const resolved = resolveRound({ ...current, dealerTotal: finalDealerTotal }, blackjackPayout);
          setGameState({ ...resolved, phase: 'payout' });
        };

        run();
      }, HOLE_CARD_REVEAL_TIME);
      timersRef.current.push(endId);

      return () => {
        cancelled = true;
      };
    }
  }, [gameState.phase, hitSoft17, blackjackPayout]);

  // Track hands played when entering payout phase
  const prevPhaseRef = useRef<GamePhase>('idle');
  useEffect(() => {
    if (prevPhaseRef.current !== 'payout' && gameState.phase === 'payout') {
      setStats(prev => ({ ...prev, handsPlayed: prev.handsPlayed + 1 }));
    }
    prevPhaseRef.current = gameState.phase;
  }, [gameState.phase]);

  // Auto-dismiss feedback banner after 1.5 seconds
  useEffect(() => {
    if (!lastDecision) return;
    const dismissTimer = window.setTimeout(() => {
      setLastDecision(null);
    }, 1500);
    return () => window.clearTimeout(dismissTimer);
  }, [lastDecision]);

  // Auto-advance after payout display with card removal animation
  useEffect(() => {
    if (gameState.phase === 'payout') {
      clearTimers();
      let cancelled = false;

      const t1 = window.setTimeout(() => {
        if (cancelled) return;
        setIsRemovingCards(true);

        const t2 = window.setTimeout(() => {
          if (cancelled) return;
          setIsRemovingCards(false);
          setIsDealerStacked(false);
          startNewHand();
        }, CARD_REMOVE_ANIM_MS);
        timersRef.current.push(t2);
      }, settings.autoAdvanceDelay);

      timersRef.current.push(t1);
      return () => {
        cancelled = true;
      };
    }
  }, [gameState.phase, settings.autoAdvanceDelay]);

  return (
    <div
      className="training-page"
      style={{
        '--card-scale': CARD_SCALE_VALUES[settings.cardScale ?? 'medium'],
        '--deal-anim-ms': getTimingConstants(settings.dealingSpeed ?? 'medium').cardDealAnim,
        '--player-slide-ms': getTimingConstants(settings.dealingSpeed ?? 'medium').playerCenterSlide,
      } as React.CSSProperties}
    >
      {/* Header */}
      <header className="training-header">
        <button className="back-button" onClick={onBack}>
          <span aria-hidden="true">{'\u2190'}</span> Back to Simulator
        </button>
        <h1 className="training-title">Training Mode</h1>
        <div className="header-buttons">
          <button
            className="stats-button"
            onClick={() => setShowStats(true)}
            title="View Statistics"
          >
            <span aria-hidden="true">{'\u{1F4CA}'}</span>
          </button>
          <button
            className="settings-button"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <span aria-hidden="true">{'\u2699'}</span>
          </button>
        </div>
      </header>

      {/* Info bar */}
      <div className="training-info-bar">
        <div className="info-item">
          <span className="info-label">Bankroll</span>
          <span className="info-value">{gameState.bankroll.toFixed(0)}u</span>
        </div>
        <div className="info-item">
          <span className="info-label">Hand</span>
          <span className="info-value">#{gameState.roundNumber}</span>
        </div>
        {settings.showCount && (
          <>
            <div className="info-item">
              <span className="info-label">RC</span>
              <span className="info-value">{gameState.runningCount}</span>
            </div>
            <div className="info-item">
              <span className="info-label">TC</span>
              <span className="info-value">{trueCount.toFixed(1)}</span>
            </div>
          </>
        )}
        <div className="info-item">
          <span className="info-label">Decks</span>
          <span className="info-value">{decksRemaining.toFixed(1)}</span>
        </div>
      </div>

      {/* Main game area */}
      <main className="training-main">
        <Table
          roundNumber={gameState.roundNumber}
          dealerHand={gameState.dealerHand}
          playerHands={gameState.playerHands}
          activeHandIndex={gameState.activeHandIndex}
          phase={gameState.phase}
          showHandTotals={settings.showHandTotals}
          cardsRemaining={gameState.shoe.length}
          totalCards={totalCards}
          cardsDiscarded={totalCards - gameState.shoe.length}
          visibleCardCount={visibleCardCount}
          isRevealingHoleCard={isRevealingHoleCard}
          isRemovingCards={isRemovingCards}
          isDealerStacked={isDealerStacked}
          showBadges={showBadges}
          isSplitting={isSplitting}
          splitDealingPhase={splitDealingPhase}
          splitOriginHandIndex={splitOriginHandIndex}
          cardScale={settings.cardScale ?? 'medium'}
        />
      </main>

      {/* Action buttons */}
      <div className="training-actions">
        <div className="training-actions-inner">
          {/* Feedback banner overlay - positioned above buttons */}
          {settings.correctionMode === 'inline' && (
            <FeedbackPanel
              lastDecision={lastDecision}
              visible={
                !!lastDecision &&
                gameState.phase === 'player-action' &&
                (!settings.onlyShowMistakes || !lastDecision.isCorrect)
              }
              compact={true}
            />
          )}

          {/* Only show the Deal button for the initial hand (later hands auto-deal). */}
          {gameState.phase === 'idle' && (
            <button className="deal-button" onClick={startNewHand}>
              {needsReshuffle ? 'Shuffle & Deal' : 'Deal'}
            </button>
          )}

          <ActionButtons
            onAction={handleAction}
            canHit={canHitAction}
            canStand={canStandAction}
            canDouble={canDoubleAction}
            canSplit={canSplitAction}
            canSurrender={canSurrenderAction}
            handsToPlay={settings.handsToPlay ?? 1}
            onCycleHandsToPlay={cycleHandsToPlay}
            // If a split hand is waiting for its first post-split card, lock input immediately
            // (effects run after paint, so this prevents a 1-frame window of invalid actions).
            disabled={gameState.phase !== 'player-action' || !!currentHand?.needsSplitCard}
            disabledActions={actionLocked ? ['hit', 'double', 'split'] : []}
            showKeyboardHints={settings.showHints}
          />
        </div>
      </div>

      {/* Stats bar */}
      <div className="training-stats-bar">
        <div className="stat-item">
          <span className="stat-value">{stats.handsPlayed}</span>
          <span className="stat-label">Hands</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">
            {stats.correctDecisions + stats.incorrectDecisions > 0
              ? ((stats.correctDecisions / (stats.correctDecisions + stats.incorrectDecisions)) * 100).toFixed(1)
              : '--'}%
          </span>
          <span className="stat-label">Accuracy</span>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={e => e.stopPropagation()}>
            <h2>Settings</h2>

            <div className="settings-section">
              <div className="settings-section-title">Scenario (from Simulator)</div>
              <div className="settings-readonly">
                <div className="settings-ro-row">
                  <span>Rules</span>
                  <span>{hitSoft17 ? 'H17' : 'S17'} · {doubleAfterSplit ? 'DAS' : 'No DAS'} · {doubleAnyTwo ? 'DA2' : 'D 9-11'} · {allowSurrender ? 'Surrender' : 'No Surrender'}</span>
                </div>
                <div className="settings-ro-row">
                  <span>Decks</span>
                  <span>{numDecks}</span>
                </div>
                <div className="settings-ro-row">
                  <span>Penetration</span>
                  <span>{Math.round(penetration * 100)}%</span>
                </div>
                <div className="settings-ro-row">
                  <span>BJ Payout</span>
                  <span>{blackjackPayout.toFixed(2)}</span>
                </div>
                <div className="settings-ro-row">
                  <span>Splits</span>
                  <span>Max {maxSplits} · {resplitAces ? 'RSA' : 'No RSA'} · {hitSplitAces ? 'Hit split Aces' : '1 card on split Aces'}</span>
                </div>
                <div className="settings-ro-row">
                  <span>TC Estimation</span>
                  <span>{tcEstimationMethod === 'perfect' ? 'Perfect' : tcEstimationMethod === 'halfDeck' ? 'Half-deck' : 'Floor (full-deck)'}</span>
                </div>
                <div className="settings-ro-row">
                  <span>Deviations</span>
                  <span>{settings.showDeviations ? 'I18 + Fab4 (On)' : 'I18 + Fab4 (Off)'}</span>
                </div>
              </div>
              <div className="settings-hint">Change rules in Simulator mode.</div>
            </div>

            <label className="setting-row">
              <span>Show Count</span>
              <input
                type="checkbox"
                checked={settings.showCount}
                onChange={e => setSettings(s => ({ ...s, showCount: e.target.checked }))}
              />
            </label>

            <label className="setting-row">
              <span>Show Hand Totals</span>
              <input
                type="checkbox"
                checked={settings.showHandTotals}
                onChange={e => setSettings(s => ({ ...s, showHandTotals: e.target.checked }))}
              />
            </label>

            <label className="setting-row">
              <span>Show Keyboard Hints</span>
              <input
                type="checkbox"
                checked={settings.showHints}
                onChange={e => setSettings(s => ({ ...s, showHints: e.target.checked }))}
              />
            </label>

            <label className="setting-row">
              <span>Use Deviations (I18/Fab4)</span>
              <input
                type="checkbox"
                checked={settings.showDeviations}
                onChange={e => setSettings(s => ({ ...s, showDeviations: e.target.checked }))}
              />
            </label>

            <label className="setting-row">
              <span>Default Bet</span>
              <input
                type="number"
                min={1}
                max={100}
                value={settings.defaultBet}
                onChange={e => setSettings(s => ({ ...s, defaultBet: parseInt(e.target.value) || 1 }))}
              />
            </label>

            <label className="setting-row">
              <span>Auto-Advance Delay (ms)</span>
              <input
                type="number"
                min={500}
                max={5000}
                step={100}
                value={settings.autoAdvanceDelay}
                onChange={e => setSettings(s => ({ ...s, autoAdvanceDelay: parseInt(e.target.value) || 2000 }))}
              />
            </label>

            <label className="setting-row">
              <span>Decision Feedback</span>
              <select
                value={settings.correctionMode}
                onChange={e => setSettings(s => ({ ...s, correctionMode: e.target.value as 'inline' | 'modal' | 'off' }))}
              >
                <option value="inline">Banner</option>
                <option value="modal">Popup (blocks play)</option>
                <option value="off">Off</option>
              </select>
            </label>

            <label className="setting-row">
              <span>Only Show Mistakes</span>
              <input
                type="checkbox"
                checked={settings.onlyShowMistakes}
                onChange={e => setSettings(s => ({ ...s, onlyShowMistakes: e.target.checked }))}
              />
            </label>

            <label className="setting-row">
              <span>Card Size</span>
              <select
                value={settings.cardScale ?? 'medium'}
                onChange={e => setSettings(s => ({ ...s, cardScale: e.target.value as 'small' | 'medium' | 'large' }))}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>

            <label className="setting-row">
              <span>Dealing Speed</span>
              <select
                value={settings.dealingSpeed ?? 'medium'}
                onChange={e => setSettings(s => ({ ...s, dealingSpeed: e.target.value as 'slow' | 'medium' | 'fast' }))}
              >
                <option value="slow">Slow</option>
                <option value="medium">Medium</option>
                <option value="fast">Fast</option>
              </select>
            </label>

            <button className="close-settings" onClick={() => setShowSettings(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Correction modal for blocking mode */}
      {showCorrectionModal && lastDecision && (
        <CorrectionModal
          lastDecision={lastDecision}
          onContinue={handleContinueAnyway}
          onTakeBack={handleTakeBack}
        />
      )}

      {/* Insurance prompt overlay */}
      {showInsurancePrompt && (
        <div className="insurance-overlay">
          <div className="insurance-prompt">
            <h3>Insurance?</h3>
            <p>Dealer shows an Ace.</p>
            <div className="insurance-buttons">
              <button
                className="insurance-btn insurance-yes"
                onClick={handleTakeInsurance}
              >
                Yes
              </button>
              <button
                className="insurance-btn insurance-no"
                onClick={handleDeclineInsurance}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats panel */}
      {showStats && (
        <StatsPanel
          stats={stats}
          onClose={() => setShowStats(false)}
          onReset={() => {
            const newStats = { ...DEFAULT_TRAINING_STATS, sessionStart: Date.now() };
            setStats(newStats);
            saveStats(newStats);
          }}
        />
      )}
    </div>
  );
};

export default TrainingPage;

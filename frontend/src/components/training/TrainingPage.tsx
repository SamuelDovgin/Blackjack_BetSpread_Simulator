// Training Page Component
// Main training mode page with game table and controls
// Cards deal from shoe (right side) with realistic timing

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Table } from './Table';
import { ActionButtons } from './ActionButtons';
import type {
  GameState,
  GamePhase,
  PlayerAction,
  TrainingSettings,
  TrainingStats,
} from './types';
import {
  DEFAULT_TRAINING_SETTINGS,
  DEFAULT_TRAINING_STATS,
} from './types';
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

// Animation timing constants (ms)
const CARD_DEAL_ANIM_MS = 350;
const DEAL_CARD_INTERVAL = 380; // Keep > CARD_DEAL_ANIM_MS so the previous card stops before the next appears
const INITIAL_DEAL_TOTAL_TIME = (DEAL_CARD_INTERVAL * 3) + CARD_DEAL_ANIM_MS + 20; // 4 cards (P,D,P,D)
const HOLE_CARD_REVEAL_TIME = 500; // Time to flip hole card
const DEALER_STACK_TRANSITION_MS = 400; // Matches Card.css stack transition
const CARD_REMOVE_ANIM_MS = 400; // Matches Card.css removal animation

interface TrainingPageProps {
  onBack: () => void;
  // Config from main app
  numDecks?: number;
  penetration?: number;
  hitSoft17?: boolean;
  allowSurrender?: boolean;
  blackjackPayout?: number;
}

export const TrainingPage: React.FC<TrainingPageProps> = ({
  onBack,
  numDecks = 6,
  penetration = 0.75,
  hitSoft17 = true,
  allowSurrender = true,
  blackjackPayout = 1.5,
}) => {
  // Game state
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGameState(numDecks, 1000)
  );

  // Settings (will be persisted to localStorage later)
  const [settings, setSettings] = useState<TrainingSettings>(DEFAULT_TRAINING_SETTINGS);

  // Stats
  const [stats, setStats] = useState<TrainingStats>(DEFAULT_TRAINING_STATS);

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [resultOutcome, setResultOutcome] = useState<'win' | 'lose' | 'push' | 'blackjack' | null>(null);
  const [isRevealingHoleCard, setIsRevealingHoleCard] = useState(false);
  const [isRemovingCards, setIsRemovingCards] = useState(false);
  const [isDealerStacked, setIsDealerStacked] = useState(false);
  const [visibleCardCount, setVisibleCardCount] = useState<number>(999);
  const [actionLocked, setActionLocked] = useState(false);
  const [showBadges, setShowBadges] = useState(true); // Hide badges during card animations
  const [isSplitting, setIsSplitting] = useState(false); // During split card separation animation
  const [splitDealingPhase, setSplitDealingPhase] = useState<number>(0); // 0=none, 1=dealing to right, 2=dealing to left

  const timersRef = useRef<number[]>([]);
  const queuedActionRef = useRef<PlayerAction | null>(null);
  const clearTimers = () => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  // Total cards in full shoe
  const totalCards = numDecks * 52;

  // Calculate derived values
  const decksRemaining = (gameState.shoe.length / 52);
  const trueCount = calculateTrueCount(gameState.runningCount, decksRemaining);

  // Current hand
  const currentHand = gameState.playerHands[gameState.activeHandIndex];
  const dealerUpcard = gameState.dealerHand[0];

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
    setResultOutcome(null);
    setIsSplitting(false);
    setSplitDealingPhase(0);
    setShowBadges(true);

    // Gate visibility so cards appear sequentially (P, D, P, D) with no overlap.
    // Show the first card immediately so there is no "empty table" frame.
    setVisibleCardCount(1);
    for (let i = 2; i <= 4; i++) {
      const id = window.setTimeout(() => setVisibleCardCount(i), (i - 1) * DEAL_CARD_INTERVAL);
      timersRef.current.push(id);
    }

    // Deal cards - this sets phase to 'dealing'
    setGameState((prev) => {
      const reshuffleAt = numDecks * 52 * (1 - penetration);
      const needShuffle = prev.shoe.length < reshuffleAt;
      const base = needShuffle ? createInitialGameState(numDecks, prev.bankroll) : prev;
      return dealInitialCards(base, settings.defaultBet);
    });

    // After the last card finishes moving, transition to player-action or dealer-turn.
    const doneId = window.setTimeout(() => {
      setVisibleCardCount(999);
      setGameState((prev) => {
        const playerHand = prev.playerHands[0];
        const dealerHand = prev.dealerHand;
        const playerHasBJ = playerHand?.isBlackjack;
        const dealerHasBJ = calculateFullHandTotal(dealerHand).total === 21 && dealerHand.length === 2;
        const playerTotal = playerHand ? calculateFullHandTotal(playerHand.cards).total : 0;

        if (playerHasBJ || dealerHasBJ) {
          // Resolve instantly; the payout phase will handle auto-advance + discard animation.
          const revealed = revealDealerHoleCard(prev);
          const resolved = resolveRound(revealed, blackjackPayout);

          if (playerHasBJ && !dealerHasBJ) setResultOutcome('blackjack');
          else if (dealerHasBJ && !playerHasBJ) setResultOutcome('lose');
          else setResultOutcome('push');

          return { ...resolved, phase: 'payout' as GamePhase };
        }

        // Auto-stand on 21 (non-blackjack, e.g., 3+ cards totaling 21)
        if (playerTotal === 21 && playerHand) {
          const updatedHand = { ...playerHand, isComplete: true };
          return { ...prev, playerHands: [updatedHand], phase: 'dealer-turn' as GamePhase };
        }

        return { ...prev, phase: 'player-action' as GamePhase };
      });
    }, INITIAL_DEAL_TOTAL_TIME);
    timersRef.current.push(doneId);
  }, [numDecks, penetration, settings.defaultBet, blackjackPayout]);

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

    // Split has special multi-phase animation handling
    if (action === 'split') {
      setActionLocked(true);
      setShowBadges(false);

      // Phase 1: Separate the cards (top card visually moves to right)
      setIsSplitting(true);
      setGameState((prev) => {
        if (prev.phase !== 'player-action') return prev;
        return splitSeparate(prev);
      });

      // After card separation animation, deal to right hand (index 1) first
      const phase1Id = window.setTimeout(() => {
        setIsSplitting(false);
        setSplitDealingPhase(1);
        setGameState((prev) => dealToHand(prev, 1)); // Deal to right hand (split-off)

        // After right hand card animation, deal to left hand (index 0)
        const phase2Id = window.setTimeout(() => {
          setSplitDealingPhase(2);
          setGameState((prev) => dealToHand(prev, 0)); // Deal to left hand (original)

          // After left hand card animation, complete split
          const phase3Id = window.setTimeout(() => {
            setSplitDealingPhase(0);
            setShowBadges(true);
            setActionLocked(false);

            // Check if aces were split (both hands complete)
            setGameState((prev) => {
              const hand0 = prev.playerHands[0];
              const hand1 = prev.playerHands[1];
              if (hand0?.isComplete && hand1?.isComplete) {
                // Both hands done (aces split), advance to dealer
                return advanceGame(prev);
              }
              // Start with the right-most incomplete hand (play right to left)
              // Find the rightmost (highest index) incomplete hand
              for (let i = prev.playerHands.length - 1; i >= 0; i--) {
                if (!prev.playerHands[i].isComplete) {
                  return { ...prev, activeHandIndex: i };
                }
              }
              return prev;
            });
          }, CARD_DEAL_ANIM_MS + 40);
          timersRef.current.push(phase3Id);
        }, CARD_DEAL_ANIM_MS + 40);
        timersRef.current.push(phase2Id);
      }, 400); // Card separation animation time
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

    // Update stats
    setStats(prev => ({
      ...prev,
      // TODO: Track correct/incorrect based on basic strategy
    }));

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

          // Hand is still in play, unlock actions
          setActionLocked(false);

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
      }, CARD_DEAL_ANIM_MS + 40);
      timersRef.current.push(id);
    }
  }, [actionLocked]);

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

            // Wait until this new card finishes its deal animation.
            await new Promise((r) => window.setTimeout(r, DEAL_CARD_INTERVAL));
          }

          if (cancelled) return;

          // Resolve payouts and show outcome.
          const finalDealerTotal = current.dealerTotal ?? calculateFullHandTotal(current.dealerHand).total;
          const playerHand = current.playerHands[0];
          const playerTotal = playerHand ? calculateFullHandTotal(playerHand.cards).total : 0;

          if (playerHand?.isBusted || playerHand?.isSurrendered) setResultOutcome('lose');
          else if (finalDealerTotal > 21 || playerTotal > finalDealerTotal) setResultOutcome('win');
          else if (playerTotal === finalDealerTotal) setResultOutcome('push');
          else setResultOutcome('lose');

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
          setResultOutcome(null);
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

  // Calculate result for display
  const result = resultOutcome ? {
    playerTotal: currentHand ? calculateFullHandTotal(currentHand.cards).total : 0,
    dealerTotal: gameState.dealerTotal ?? 0,
    outcome: resultOutcome,
  } : null;

  return (
    <div className="training-page">
      {/* Header */}
      <header className="training-header">
        <button className="back-button" onClick={onBack}>
          <span aria-hidden="true">{'\u2190'}</span> Back to Simulator
        </button>
        <h1 className="training-title">Training Mode</h1>
        <button
          className="settings-button"
          onClick={() => setShowSettings(!showSettings)}
        >
          <span aria-hidden="true">{'\u2699'}</span>
        </button>
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
          dealerHand={gameState.dealerHand}
          playerHands={gameState.playerHands}
          activeHandIndex={gameState.activeHandIndex}
          phase={gameState.phase}
          showHandTotals={settings.showHandTotals}
          result={result}
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
        />
      </main>

      {/* Action buttons */}
      <div className="training-actions">
        <div className="training-actions-inner">
          <button
            className="deal-button"
            onClick={startNewHand}
            disabled={gameState.phase !== 'idle'}
          >
            {needsReshuffle ? 'Shuffle & Deal' : 'Deal'}
          </button>

          <ActionButtons
            onAction={handleAction}
            canHit={canHitAction}
            canStand={canStandAction}
            canDouble={canDoubleAction}
            canSplit={canSplitAction}
            canSurrender={canSurrenderAction}
            disabled={gameState.phase !== 'player-action'}
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

            <button className="close-settings" onClick={() => setShowSettings(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingPage;

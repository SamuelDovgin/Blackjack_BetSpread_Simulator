// Training Mode Game Engine
// Handles core blackjack logic for the training mode

import type { Card, Rank, Suit, GameState, HandState, HandResult, PlayerAction } from '../types';

// Card values for blackjack
const CARD_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11,
};

// Hi-Lo count values (default, will be overridden by config)
const HI_LO_VALUES: Record<Rank, number> = {
  '2': 1, '3': 1, '4': 1, '5': 1, '6': 1,
  '7': 0, '8': 0, '9': 0,
  'T': -1, 'J': -1, 'Q': -1, 'K': -1, 'A': -1,
};

// Create a standard deck
export function createDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit, faceUp: true });
    }
  }

  return deck;
}

// Create a shoe with multiple decks
export function createShoe(numDecks: number): Card[] {
  const shoe: Card[] = [];
  for (let i = 0; i < numDecks; i++) {
    shoe.push(...createDeck());
  }
  return shuffleArray(shoe);
}

// Fisher-Yates shuffle
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Calculate hand total and whether it's soft
export function calculateHandTotal(cards: Card[]): { total: number; isSoft: boolean } {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (!card.faceUp) continue; // Skip face-down cards for visible total
    total += CARD_VALUES[card.rank];
    if (card.rank === 'A') aces++;
  }

  // Adjust for aces
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  const isSoft = aces > 0 && total <= 21;
  return { total, isSoft };
}

// Calculate full hand total (including face-down cards)
export function calculateFullHandTotal(cards: Card[]): { total: number; isSoft: boolean } {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += CARD_VALUES[card.rank];
    if (card.rank === 'A') aces++;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  const isSoft = aces > 0 && total <= 21;
  return { total, isSoft };
}

// Check if hand is blackjack
export function isBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const { total } = calculateFullHandTotal(cards);
  return total === 21;
}

// Check if hand is busted
export function isBusted(cards: Card[]): boolean {
  const { total } = calculateFullHandTotal(cards);
  return total > 21;
}

// Check if hand can split
export function canSplit(hand: HandState, maxSplits: number = 3): boolean {
  if (hand.cards.length !== 2) return false;
  if (hand.isDoubled || hand.isSurrendered) return false;
  // For simplicity, checking if ranks match (T/J/Q/K all count as 10s for splitting)
  const rank1 = hand.cards[0].rank;
  const rank2 = hand.cards[1].rank;
  const isTenValue = (r: Rank) => ['T', 'J', 'Q', 'K'].includes(r);
  return rank1 === rank2 || (isTenValue(rank1) && isTenValue(rank2));
}

// Check if hand can double
export function canDouble(hand: HandState, allowDoubleAfterSplit: boolean = true): boolean {
  if (hand.cards.length !== 2) return false;
  if (hand.isDoubled || hand.isSurrendered) return false;
  // Some rules restrict doubling to certain totals, but we'll allow all for now
  return true;
}

// Check if surrender is available
export function canSurrender(hand: HandState, dealerUpcard: Card, allowSurrender: boolean = true): boolean {
  if (!allowSurrender) return false;
  if (hand.cards.length !== 2) return false;
  if (hand.isDoubled || hand.isSurrendered) return false;
  return true;
}

// Get count value for a card
export function getCountValue(card: Card, countingSystem: Record<Rank, number> = HI_LO_VALUES): number {
  return countingSystem[card.rank];
}

// Calculate running count for dealt cards
export function calculateRunningCount(
  dealtCards: Card[],
  countingSystem: Record<Rank, number> = HI_LO_VALUES
): number {
  return dealtCards.reduce((count, card) => {
    if (card.faceUp) {
      return count + getCountValue(card, countingSystem);
    }
    return count;
  }, 0);
}

// Calculate true count
export function calculateTrueCount(runningCount: number, decksRemaining: number): number {
  if (decksRemaining <= 0) return runningCount;
  return runningCount / decksRemaining;
}

// Get dealer upcard rank
export function getDealerUpcard(dealerHand: Card[]): Rank | null {
  const upcard = dealerHand.find(c => c.faceUp);
  return upcard?.rank ?? null;
}

// Draw card from shoe
export function drawCard(shoe: Card[]): { card: Card; remainingShoe: Card[] } | null {
  if (shoe.length === 0) return null;
  const [card, ...remainingShoe] = shoe;
  return { card: { ...card, faceUp: true }, remainingShoe };
}

// Create initial game state
export function createInitialGameState(numDecks: number = 6, startingBankroll: number = 1000): GameState {
  return {
    phase: 'idle',
    shoe: createShoe(numDecks),
    cardsDealt: 0,
    runningCount: 0,
    dealerHand: [],
    dealerTotal: null,
    playerHands: [],
    activeHandIndex: 0,
    currentBet: 0,
    bankroll: startingBankroll,
    insuranceBet: null,
    roundNumber: 0,
    lastAction: null,
    lastActionCorrect: null,
    correctAction: null,
    feedbackMessage: null,
  };
}

// Deal initial cards for a new round
export function dealInitialCards(
  state: GameState,
  bet: number,
  handsToPlay: number = 1
): GameState {
  const nHands = Math.max(1, Math.min(3, Math.floor(handsToPlay)));
  let shoe = [...state.shoe];

  const firstCards: Card[] = [];
  const secondCards: Card[] = [];

  // Deal first card to each player hand (left-to-right)
  for (let i = 0; i < nHands; i++) {
    const draw = drawCard(shoe);
    if (!draw) return state;
    shoe = draw.remainingShoe;
    firstCards.push(draw.card);
  }

  // Dealer hole card (face down)
  const d1 = drawCard(shoe);
  if (!d1) return state;
  shoe = d1.remainingShoe;
  const dealerHoleCard: Card = { ...d1.card, faceUp: false };

  // Deal second card to each player hand (left-to-right)
  for (let i = 0; i < nHands; i++) {
    const draw = drawCard(shoe);
    if (!draw) return state;
    shoe = draw.remainingShoe;
    secondCards.push(draw.card);
  }

  // Dealer upcard (face up)
  const d2 = drawCard(shoe);
  if (!d2) return state;
  shoe = d2.remainingShoe;

  const dealerCards = [dealerHoleCard, d2.card];

  const playerHands: HandState[] = [];
  for (let i = 0; i < nHands; i++) {
    const cards = [firstCards[i], secondCards[i]];
    playerHands.push({
      cards,
      bet,
      isDoubled: false,
      isSurrendered: false,
      isBusted: false,
      isBlackjack: isBlackjack(cards),
      isComplete: false,
    });
  }

  // Update running count (only for face-up cards: all player cards + dealer upcard)
  let newRunningCount = state.runningCount;
  for (const c of firstCards) newRunningCount += getCountValue(c);
  for (const c of secondCards) newRunningCount += getCountValue(c);
  newRunningCount += getCountValue(d2.card);

  return {
    ...state,
    shoe,
    cardsDealt: state.cardsDealt + (2 * nHands) + 2,
    runningCount: newRunningCount,
    dealerHand: dealerCards,
    dealerTotal: null,
    playerHands,
    // During the initial deal, keep the camera on the first seat (leftmost) so each
    // dealt card lands on a centered hand. TrainingPage will pick the correct active
    // hand (rightmost incomplete) once we enter player-action.
    activeHandIndex: 0,
    currentBet: bet,
    bankroll: state.bankroll - (bet * nHands),
    roundNumber: state.roundNumber + 1,
    phase: 'dealing',  // Start with dealing animation, TrainingPage will transition to player-action
    lastAction: null,
    lastActionCorrect: null,
    correctAction: null,
    feedbackMessage: null,
    insuranceBet: null,
  };
}

// Reveal dealer hole card
export function revealDealerHoleCard(state: GameState): GameState {
  const dealerHand = state.dealerHand.map(card => ({ ...card, faceUp: true }));
  const holeCard = state.dealerHand.find(c => !c.faceUp);

  let newRunningCount = state.runningCount;
  if (holeCard) {
    newRunningCount += getCountValue(holeCard);
  }

  const { total } = calculateFullHandTotal(dealerHand);

  return {
    ...state,
    dealerHand,
    dealerTotal: total,
    runningCount: newRunningCount,
  };
}

// Dealer plays out hand
export function playDealerHand(state: GameState, hitSoft17: boolean = true): GameState {
  let newState = revealDealerHoleCard(state);
  let shoe = [...newState.shoe];
  let dealerHand = [...newState.dealerHand];
  let runningCount = newState.runningCount;

  while (true) {
    const { total, isSoft } = calculateFullHandTotal(dealerHand);

    // Dealer stands on 17+ (or soft 17 if S17 rules)
    if (total > 17) break;
    if (total === 17 && (!isSoft || !hitSoft17)) break;

    // Draw card
    const result = drawCard(shoe);
    if (!result) break;

    shoe = result.remainingShoe;
    dealerHand.push(result.card);
    runningCount += getCountValue(result.card);
  }

  const { total: dealerTotal } = calculateFullHandTotal(dealerHand);

  return {
    ...newState,
    shoe,
    dealerHand,
    dealerTotal,
    runningCount,
    cardsDealt: newState.cardsDealt + (dealerHand.length - newState.dealerHand.length),
  };
}

// Hit action
export function hit(state: GameState): GameState {
  const handIndex = state.activeHandIndex;
  const hand = state.playerHands[handIndex];
  if (!hand || hand.isComplete) return state;

  const result = drawCard(state.shoe);
  if (!result) return state;

  const newCards = [...hand.cards, result.card];
  const busted = isBusted(newCards);

  const newHand: HandState = {
    ...hand,
    cards: newCards,
    isBusted: busted,
    isComplete: busted,
  };

  const newHands = [...state.playerHands];
  newHands[handIndex] = newHand;

  return {
    ...state,
    shoe: result.remainingShoe,
    cardsDealt: state.cardsDealt + 1,
    runningCount: state.runningCount + getCountValue(result.card),
    playerHands: newHands,
    lastAction: 'hit',
  };
}

// Stand action
export function stand(state: GameState): GameState {
  const handIndex = state.activeHandIndex;
  const hand = state.playerHands[handIndex];
  if (!hand || hand.isComplete) return state;

  const newHand: HandState = {
    ...hand,
    isComplete: true,
  };

  const newHands = [...state.playerHands];
  newHands[handIndex] = newHand;

  return {
    ...state,
    playerHands: newHands,
    lastAction: 'stand',
  };
}

// Double action
export function double(state: GameState): GameState {
  const handIndex = state.activeHandIndex;
  const hand = state.playerHands[handIndex];
  if (!hand || hand.isComplete || !canDouble(hand)) return state;

  const result = drawCard(state.shoe);
  if (!result) return state;

  const newCards = [...hand.cards, result.card];
  const busted = isBusted(newCards);

  const newHand: HandState = {
    ...hand,
    cards: newCards,
    bet: hand.bet * 2,
    isDoubled: true,
    isBusted: busted,
    isComplete: true,
  };

  const newHands = [...state.playerHands];
  newHands[handIndex] = newHand;

  return {
    ...state,
    shoe: result.remainingShoe,
    cardsDealt: state.cardsDealt + 1,
    runningCount: state.runningCount + getCountValue(result.card),
    playerHands: newHands,
    bankroll: state.bankroll - hand.bet, // Deduct additional bet
    lastAction: 'double',
  };
}

// Split action - Phase 1: Separate cards without dealing new ones (for animation)
export function splitSeparate(state: GameState): GameState {
  const handIndex = state.activeHandIndex;
  const hand = state.playerHands[handIndex];
  if (!hand || hand.isComplete || !canSplit(hand)) return state;

  const isSplitAces = hand.cards[0]?.rank === 'A' && hand.cards[1]?.rank === 'A';

  // Create two new hands with just one card each (no new cards dealt yet)
  const hand1: HandState = {
    // Keep the visually "top" card (second card in our stacked layout) on the left.
    // This makes the remaining base card feel natural when the other card slides away.
    cards: [hand.cards[1]],
    bet: hand.bet,
    isDoubled: false,
    isSurrendered: false,
    isBusted: false,
    isBlackjack: false,
    isComplete: false,
    isSplitHand: true,
    needsSplitCard: true,
    splitCardJustDealt: false,
    isSplitAces,
  };

  const hand2: HandState = {
    // Move the other card to the new right-hand position.
    cards: [hand.cards[0]],
    bet: hand.bet,
    isDoubled: false,
    isSurrendered: false,
    isBusted: false,
    isBlackjack: false,
    isComplete: false,
    isSplitHand: true,
    needsSplitCard: true,
    splitCardJustDealt: false,
    isSplitAces,
  };

  const newHands = [...state.playerHands];
  newHands.splice(handIndex, 1, hand1, hand2);

  return {
    ...state,
    playerHands: newHands,
    bankroll: state.bankroll - hand.bet, // Deduct additional bet for split
    lastAction: 'split',
  };
}

// Split action - Phase 2: Deal card to a specific hand
export function dealToHand(state: GameState, handIndex: number): GameState {
  const hand = state.playerHands[handIndex];
  if (!hand) return state;

  const result = drawCard(state.shoe);
  if (!result) return state;

  const newCards = [...hand.cards, result.card];
  const isAceSplit = hand.isSplitAces || hand.cards[0]?.rank === 'A';

  const newHand: HandState = {
    ...hand,
    cards: newCards,
    isComplete: isAceSplit, // Aces split only get one card
    needsSplitCard: false,
    splitCardJustDealt: true,
  };

  const newHands = [...state.playerHands];
  newHands[handIndex] = newHand;

  return {
    ...state,
    shoe: result.remainingShoe,
    cardsDealt: state.cardsDealt + 1,
    runningCount: state.runningCount + getCountValue(result.card),
    playerHands: newHands,
  };
}

// Split action - Immediate split (legacy helper; deals the right hand immediately, left waits)
export function split(state: GameState): GameState {
  const handIndex = state.activeHandIndex;
  const hand = state.playerHands[handIndex];
  if (!hand || hand.isComplete || !canSplit(hand)) return state;

  const isSplitAces = hand.cards[0].rank === 'A' && hand.cards[1].rank === 'A';

  // Draw one card immediately for the RIGHT-hand split (player will act on it first)
  let shoe = [...state.shoe];
  const drawRight = drawCard(shoe);
  if (!drawRight) return state;
  shoe = drawRight.remainingShoe;

  // Left hand waits for its first post-split card until it becomes active.
  const leftHand: HandState = {
    // Keep the visually top card on the left (consistent with splitSeparate).
    cards: [hand.cards[1]],
    bet: hand.bet,
    isDoubled: false,
    isSurrendered: false,
    isBusted: false,
    isBlackjack: false,
    isComplete: false,
    isSplitHand: true,
    needsSplitCard: true,
    splitCardJustDealt: false,
    isSplitAces,
  };

  const rightHandCards = [hand.cards[0], drawRight.card];
  const rightHand: HandState = {
    cards: rightHandCards,
    bet: hand.bet,
    isDoubled: false,
    isSurrendered: false,
    isBusted: isBusted(rightHandCards),
    isBlackjack: false,
    isComplete: isSplitAces, // Split aces get one card then stand
    isSplitHand: true,
    needsSplitCard: false,
    splitCardJustDealt: true,
    isSplitAces,
  };

  const newHands = [...state.playerHands];
  newHands.splice(handIndex, 1, leftHand, rightHand);

  return {
    ...state,
    shoe,
    cardsDealt: state.cardsDealt + 1,
    runningCount: state.runningCount + getCountValue(drawRight.card),
    playerHands: newHands,
    activeHandIndex: handIndex + 1, // Play the right hand first
    bankroll: state.bankroll - hand.bet, // Deduct additional bet for split
    lastAction: 'split',
  };
}

// Deal the first post-split card to a hand that is waiting for it.
export function dealSplitHandCard(state: GameState, handIndex: number): GameState {
  const hand = state.playerHands[handIndex];
  if (!hand || !hand.needsSplitCard) return state;

  const result = drawCard(state.shoe);
  if (!result) return state;

  const newCards = [...hand.cards, result.card];
  const busted = isBusted(newCards);

  const newHand: HandState = {
    ...hand,
    cards: newCards,
    isBusted: busted,
    needsSplitCard: false,
    splitCardJustDealt: true,
    isComplete: hand.isSplitAces ? true : false,
  };

  const newHands = [...state.playerHands];
  newHands[handIndex] = newHand;

  return {
    ...state,
    shoe: result.remainingShoe,
    cardsDealt: state.cardsDealt + 1,
    runningCount: state.runningCount + getCountValue(result.card),
    playerHands: newHands,
  };
}

// Surrender action
export function surrender(state: GameState): GameState {
  const handIndex = state.activeHandIndex;
  const hand = state.playerHands[handIndex];
  if (!hand || hand.isComplete) return state;

  const newHand: HandState = {
    ...hand,
    isSurrendered: true,
    isComplete: true,
  };

  const newHands = [...state.playerHands];
  newHands[handIndex] = newHand;

  return {
    ...state,
    playerHands: newHands,
    bankroll: state.bankroll + (hand.bet * 0.5), // Return half the bet
    lastAction: 'surrender',
  };
}

// Calculate payout for a hand
export function calculatePayout(
  playerHand: HandState,
  dealerTotal: number,
  blackjackPayout: number = 1.5
): number {
  if (playerHand.isSurrendered) {
    return 0; // Already handled in surrender action
  }

  if (playerHand.isBusted) {
    return 0; // Lost
  }

  const { total: playerTotal } = calculateFullHandTotal(playerHand.cards);

  if (playerHand.isBlackjack) {
    if (dealerTotal === 21) {
      return playerHand.bet; // Push
    }
    return playerHand.bet + (playerHand.bet * blackjackPayout); // Blackjack pays 3:2
  }

  if (dealerTotal > 21) {
    return playerHand.bet * 2; // Dealer busts, player wins
  }

  if (playerTotal > dealerTotal) {
    return playerHand.bet * 2; // Player wins
  }

  if (playerTotal === dealerTotal) {
    return playerHand.bet; // Push
  }

  return 0; // Player loses
}

// Determine hand result for display
export function determineHandResult(
  playerHand: HandState,
  dealerTotal: number
): HandResult {
  if (playerHand.isSurrendered) {
    return 'lose';
  }

  if (playerHand.isBusted) {
    return 'lose';
  }

  const { total: playerTotal } = calculateFullHandTotal(playerHand.cards);

  if (playerHand.isBlackjack) {
    if (dealerTotal === 21) {
      return 'push';
    }
    return 'blackjack';
  }

  if (dealerTotal > 21) {
    return 'win';
  }

  if (playerTotal > dealerTotal) {
    return 'win';
  }

  if (playerTotal === dealerTotal) {
    return 'push';
  }

  return 'lose';
}

// Move to next hand or dealer turn
export function advanceGame(state: GameState): GameState {
  // Check if current hand is complete
  const currentHand = state.playerHands[state.activeHandIndex];
  if (!currentHand?.isComplete) {
    return state;
  }

  // Training-mode rule: always play split hands from right-to-left.
  // That means: whenever a hand completes, jump to the *rightmost* incomplete hand.
  for (let i = state.playerHands.length - 1; i >= 0; i--) {
    if (!state.playerHands[i].isComplete) {
      return {
        ...state,
        activeHandIndex: i,
      };
    }
  }

  // All player hands complete, move to dealer turn
  return {
    ...state,
    phase: 'dealer-turn',
  };
}

// Resolve round and calculate payouts
export function resolveRound(state: GameState, blackjackPayout: number = 1.5): GameState {
  const dealerTotal = state.dealerTotal ?? 0;
  let totalPayout = 0;

  // Calculate payouts and set result on each hand
  const resolvedHands = state.playerHands.map(hand => {
    totalPayout += calculatePayout(hand, dealerTotal, blackjackPayout);
    return {
      ...hand,
      result: determineHandResult(hand, dealerTotal),
    };
  });

  return {
    ...state,
    playerHands: resolvedHands,
    bankroll: state.bankroll + totalPayout,
    phase: 'payout',
  };
}

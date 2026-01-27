// Training Mode Game Engine
// Handles core blackjack logic for the training mode

import type { Card, Rank, Suit, GameState, HandState, PlayerAction } from '../types';

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
  bet: number
): GameState {
  let shoe = [...state.shoe];
  const dealtCards: Card[] = [];

  // Deal player first card
  const p1 = drawCard(shoe);
  if (!p1) return state;
  shoe = p1.remainingShoe;
  dealtCards.push(p1.card);

  // Deal dealer first card (face up)
  const d1 = drawCard(shoe);
  if (!d1) return state;
  shoe = d1.remainingShoe;
  dealtCards.push(d1.card);

  // Deal player second card
  const p2 = drawCard(shoe);
  if (!p2) return state;
  shoe = p2.remainingShoe;
  dealtCards.push(p2.card);

  // Deal dealer second card (face down)
  const d2 = drawCard(shoe);
  if (!d2) return state;
  shoe = d2.remainingShoe;
  const dealerHoleCard: Card = { ...d2.card, faceUp: false };

  const playerCards = [p1.card, p2.card];
  const dealerCards = [d1.card, dealerHoleCard];

  const playerHand: HandState = {
    cards: playerCards,
    bet,
    isDoubled: false,
    isSurrendered: false,
    isBusted: false,
    isBlackjack: isBlackjack(playerCards),
    isComplete: false,
  };

  // Update running count (only for face-up cards)
  const newRunningCount = state.runningCount +
    getCountValue(p1.card) +
    getCountValue(d1.card) +
    getCountValue(p2.card);

  return {
    ...state,
    shoe,
    cardsDealt: state.cardsDealt + 4,
    runningCount: newRunningCount,
    dealerHand: dealerCards,
    dealerTotal: null,
    playerHands: [playerHand],
    activeHandIndex: 0,
    currentBet: bet,
    bankroll: state.bankroll - bet,
    roundNumber: state.roundNumber + 1,
    phase: 'player-action',
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

// Split action
export function split(state: GameState): GameState {
  const handIndex = state.activeHandIndex;
  const hand = state.playerHands[handIndex];
  if (!hand || hand.isComplete || !canSplit(hand)) return state;

  // Draw two new cards
  let shoe = [...state.shoe];
  const draw1 = drawCard(shoe);
  if (!draw1) return state;
  shoe = draw1.remainingShoe;

  const draw2 = drawCard(shoe);
  if (!draw2) return state;
  shoe = draw2.remainingShoe;

  // Create two new hands
  const hand1: HandState = {
    cards: [hand.cards[0], draw1.card],
    bet: hand.bet,
    isDoubled: false,
    isSurrendered: false,
    isBusted: false,
    isBlackjack: false, // Split hands can't be blackjack
    isComplete: false,
  };

  const hand2: HandState = {
    cards: [hand.cards[1], draw2.card],
    bet: hand.bet,
    isDoubled: false,
    isSurrendered: false,
    isBusted: false,
    isBlackjack: false,
    isComplete: false,
  };

  // Check for aces split (usually only one card)
  if (hand.cards[0].rank === 'A') {
    hand1.isComplete = true;
    hand2.isComplete = true;
  }

  const newHands = [...state.playerHands];
  newHands.splice(handIndex, 1, hand1, hand2);

  return {
    ...state,
    shoe,
    cardsDealt: state.cardsDealt + 2,
    runningCount: state.runningCount + getCountValue(draw1.card) + getCountValue(draw2.card),
    playerHands: newHands,
    bankroll: state.bankroll - hand.bet, // Deduct additional bet for split
    lastAction: 'split',
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

// Move to next hand or dealer turn
export function advanceGame(state: GameState): GameState {
  // Check if current hand is complete
  const currentHand = state.playerHands[state.activeHandIndex];
  if (!currentHand?.isComplete) {
    return state;
  }

  // Check for more player hands
  const nextIncomplete = state.playerHands.findIndex(
    (h, i) => i > state.activeHandIndex && !h.isComplete
  );

  if (nextIncomplete !== -1) {
    return {
      ...state,
      activeHandIndex: nextIncomplete,
    };
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

  for (const hand of state.playerHands) {
    totalPayout += calculatePayout(hand, dealerTotal, blackjackPayout);
  }

  return {
    ...state,
    bankroll: state.bankroll + totalPayout,
    phase: 'payout',
  };
}

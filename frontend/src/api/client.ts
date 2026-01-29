import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001/api";

export const api = axios.create({
  baseURL,
});

export interface Rules {
  decks: number;
  hit_soft_17: boolean;
  double_after_split: boolean;
  double_any_two: boolean;
  surrender: boolean;
  resplit_aces: boolean;
  max_splits: number;
  hit_split_aces: boolean;
  blackjack_payout: number;
  dealer_peeks: boolean;
  penetration: number;
}

export interface BetRampEntry {
  tc_floor: number;
  units: number;
}

export interface BetRamp {
  steps: BetRampEntry[];
  wong_out_below?: number | null;
  wong_out_policy?: string;
}

export interface Deviation {
  hand_key: string;
  tc_floor: number;
  action: string;
}

export interface CountingSystem {
  name: string;
  tags: Record<string, number>;
  true_count_divisor: string;
}

export interface SimulationRequest {
  rules: Rules;
  counting_system: CountingSystem;
  deviations: Deviation[];
  bet_ramp: BetRamp;
  bankroll?: number | null;
  unit_size: number;
  hands: number;
  seed: number;
  processes?: number;
  use_multiprocessing?: boolean;
  debug_log?: boolean;
  debug_log_hands?: number;
  deck_estimation_step?: number;
  deck_estimation_rounding?: string;
  use_estimated_tc_for_bet?: boolean;
  use_estimated_tc_for_deviations?: boolean;
  hands_per_hour?: number;
}

export interface RoRResult {
  simple_ror: number;
  adjusted_ror: number;
  trip_ror?: number | null;
  trip_hours?: number | null;
  required_bankroll_5pct?: number | null;
  required_bankroll_1pct?: number | null;
  n0_hands: number;
}

export interface SimulationResult {
  ev_per_100: number;
  stdev_per_100: number;
  variance_per_hand: number;
  di: number;
  score: number;
  n0_hands: number;
  ror?: number | null;
  ror_detail?: RoRResult | null;
  avg_initial_bet?: number | null;
  avg_initial_bet_units?: number | null;
  tc_histogram: Record<string, number>;
  tc_histogram_est?: Record<string, number>;
  tc_table?: Array<{
    tc: number;
    n: number;
    n_iba?: number;
    n_zero?: number;
    freq: number;
    ev_pct: number;
    ev_se_pct: number;
    variance: number;
  }>;
  meta?: Record<string, string>;
  hours_played?: number | null;
  rounds_played?: number | null;
  debug_hands?: Array<Record<string, string>>;
}

export type DefaultLibraries = {
  rules: Rules;
  count: CountingSystem;
  deviations: Deviation[];
  bet_ramp: BetRamp;
};

/** Client-side defaults matching backend/app/data/presets.py (Midwest 6D H17 DAS). */
export const CLIENT_DEFAULT_RULES: Rules = {
  decks: 6,
  hit_soft_17: true,
  double_after_split: true,
  double_any_two: true,
  surrender: false,
  resplit_aces: true,
  max_splits: 3,
  hit_split_aces: false,
  blackjack_payout: 1.5,
  dealer_peeks: true,
  penetration: 0.75,
};

export const CLIENT_DEFAULT_COUNT: CountingSystem = {
  name: "Hi-Lo",
  tags: { "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, "T": -1, "J": -1, "Q": -1, "K": -1, "A": -1 },
  true_count_divisor: "remaining_decks",
};

export const CLIENT_DEFAULT_DEVIATIONS: Deviation[] = [
  { hand_key: "16v10", tc_floor: 0, action: "S" },
  { hand_key: "15v10", tc_floor: 4, action: "S" },
  { hand_key: "10v10", tc_floor: 4, action: "D" },
  { hand_key: "12v3", tc_floor: 2, action: "S" },
  { hand_key: "12v2", tc_floor: 3, action: "S" },
  { hand_key: "12v4", tc_floor: 0, action: "S" },
  { hand_key: "12v5", tc_floor: -2, action: "S" },
  { hand_key: "12v6", tc_floor: -1, action: "S" },
  { hand_key: "9v2", tc_floor: 1, action: "D" },
  { hand_key: "9v7", tc_floor: 3, action: "D" },
  { hand_key: "10vA", tc_floor: 4, action: "D" },
  { hand_key: "11vA", tc_floor: 1, action: "D" },
  { hand_key: "16v9", tc_floor: 5, action: "S" },
  { hand_key: "13v2", tc_floor: -1, action: "S" },
  { hand_key: "13v3", tc_floor: -2, action: "S" },
  { hand_key: "15v9", tc_floor: 5, action: "S" },
  { hand_key: "insurance", tc_floor: 3, action: "I" },
  // Fab 4 surrender
  { hand_key: "15v10_surrender", tc_floor: 0, action: "R" },
  { hand_key: "15v9_surrender", tc_floor: 2, action: "R" },
  { hand_key: "15vA_surrender", tc_floor: 1, action: "R" },
  { hand_key: "14v10_surrender", tc_floor: 3, action: "R" },
];

export const CLIENT_DEFAULTS: DefaultLibraries = {
  rules: CLIENT_DEFAULT_RULES,
  count: CLIENT_DEFAULT_COUNT,
  deviations: CLIENT_DEFAULT_DEVIATIONS,
  bet_ramp: {
    steps: [
      { tc_floor: -1, units: 1 },
      { tc_floor: 0, units: 2 },
      { tc_floor: 1, units: 4 },
      { tc_floor: 2, units: 6 },
      { tc_floor: 3, units: 8 },
      { tc_floor: 4, units: 10 },
      { tc_floor: 5, units: 12 },
    ],
    wong_out_below: -1,
    wong_out_policy: "anytime",
  },
};

export async function fetchDefaults(): Promise<DefaultLibraries> {
  const { data } = await api.get("/libraries/defaults");
  return data;
}

export async function startSimulation(payload: SimulationRequest): Promise<{ id: string }> {
  const { data } = await api.post("/simulations", payload);
  return data;
}

export async function getSimulation(id: string): Promise<SimulationResult> {
  const { data } = await api.get(`/simulations/${id}`);
  return data;
}

export interface SimulationStatus {
  status: string;
  progress: number;
  hands_done: number;
  hands_total: number;
  ev_per_100_est?: number | null;
  stdev_per_100_est?: number | null;
  avg_initial_bet_est?: number | null;
}

export async function getSimulationStatus(id: string): Promise<SimulationStatus> {
  const { data } = await api.get(`/simulations/${id}/status`);
  return data;
}

export async function stopSimulation(id: string): Promise<{ stopped: boolean }> {
  const { data } = await api.post(`/simulations/${id}/stop`);
  return data;
}

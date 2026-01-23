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
  debug_log?: boolean;
  debug_log_hands?: number;
  deck_estimation_step?: number;
  deck_estimation_rounding?: string;
  use_estimated_tc_for_bet?: boolean;
  use_estimated_tc_for_deviations?: boolean;
  hands_per_hour?: number;
}

export interface SimulationResult {
  ev_per_100: number;
  stdev_per_100: number;
  variance_per_hand: number;
  di: number;
  score: number;
  n0_hands: number;
  ror?: number | null;
  avg_initial_bet?: number | null;
  avg_initial_bet_units?: number | null;
  tc_histogram: Record<string, number>;
  tc_histogram_est?: Record<string, number>;
  meta?: Record<string, string>;
  hours_played?: number | null;
  debug_hands?: Array<Record<string, string>>;
}

export type DefaultLibraries = {
  rules: Rules;
  count: CountingSystem;
  deviations: Deviation[];
  bet_ramp: BetRamp;
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

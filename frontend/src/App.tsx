import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { TrainingPage } from "./components/training";
import {
  BetRamp,
  BetRampEntry,
  Deviation,
  DefaultLibraries,
  Rules,
  SimulationResult,
  SimulationStatus,
  CLIENT_DEFAULTS,
  fetchDefaults,
  getSimulation,
  getSimulationStatus,
  startSimulation,
  stopSimulation,
} from "./api/client";

type UiStatus = "idle" | "running" | "done" | "error" | "stopped";
type PresetType = "rules" | "ramp" | "deviations" | "scenario";
type AppPage = "simulator" | "training";

type Preset = {
  id: string;
  type: PresetType;
  name: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  payload: any;
};

const PRESET_KEY = "bj_presets_v1";

const emptyRampEntry = (): BetRampEntry => ({ tc_floor: 0, units: 1 });
const emptyDeviation = (): Deviation => ({ hand_key: "16v10", tc_floor: 0, action: "S" });

// Stale-result detection should only consider settings that affect the simulation outputs (EV/SD/etc).
// Display/calculator-only knobs (unit_size, bankroll, hands/hour, debug logging) are intentionally ignored.
const serializeForStaleCheck = (config: any, randomizeSeedEachRun: boolean): string => {
  const sanitizedSettings = {
    ...config.settings,
    seed: randomizeSeedEachRun ? 0 : config.settings.seed,
    unit_size: 0,
    bankroll: null,
    hands_per_hour: 0,
    debug_log: false,
    debug_log_hands: 0,
  };
  return JSON.stringify({ ...config, settings: sanitizedSettings });
};

const HelpIcon = ({ text }: { text: string }) => (
  <span className="help-icon" title={text} aria-label={text}>
    ?
  </span>
);

const actionOptions = ["H", "S", "D", "P", "R", "I"];
const tcModes = [
  { label: "Perfect", value: 0 },
  { label: "Half-deck", value: 0.5 },
  { label: "Full-deck", value: 1.0 },
];
const tcRounding = ["nearest", "floor", "ceil"];
const handPresets = [50_000, 200_000, 2_000_000];
const precisionPresets = {
  fast: { label: "Fast (0.50u)", abs: 0.5 },
  balanced: { label: "Balanced (0.25u)", abs: 0.25 },
  strict: { label: "Strict (0.10u)", abs: 0.1 },
} as const;

const builtInRampPresets: Preset[] = [
  {
    id: "builtin:bjinfo-1-8",
    type: "ramp",
    name: "BJInfo 1-8 Ramp",
    tags: ["library", "1-8"],
    created_at: "builtin",
    updated_at: "builtin",
    payload: {
      bet_input_mode: "units",
      bet_ramp: {
        wong_out_below: -2,
        wong_out_policy: "anytime",
        steps: [
          { tc_floor: -1, units: 1 },
          { tc_floor: 2, units: 2 },
          { tc_floor: 3, units: 4 },
          { tc_floor: 4, units: 6 },
          { tc_floor: 5, units: 8 },
        ],
      },
    },
  },
  {
    id: "builtin:bjinfo-1-12",
    type: "ramp",
    name: "BJInfo 1-12 Ramp",
    tags: ["library", "1-12"],
    created_at: "builtin",
    updated_at: "builtin",
    payload: {
      bet_input_mode: "units",
      bet_ramp: {
        wong_out_below: -2,
        wong_out_policy: "anytime",
        steps: [
          { tc_floor: -1, units: 1 },
          { tc_floor: 2, units: 2 },
          { tc_floor: 3, units: 4 },
          { tc_floor: 4, units: 8 },
          { tc_floor: 5, units: 10 },
          { tc_floor: 6, units: 12 },
        ],
      },
    },
  },
  {
    id: "builtin:shoe-1-12-wong",
    type: "ramp",
    name: "Shoe 1-12 + Wong-out",
    tags: ["library", "wong-out"],
    created_at: "builtin",
    updated_at: "builtin",
    payload: {
      bet_input_mode: "units",
      bet_ramp: {
        wong_out_below: -2,
        wong_out_policy: "after_loss_only",
        steps: [
          { tc_floor: -1, units: 1 },
          { tc_floor: 2, units: 2 },
          { tc_floor: 3, units: 4 },
          { tc_floor: 4, units: 8 },
          { tc_floor: 5, units: 10 },
          { tc_floor: 6, units: 12 },
        ],
      },
    },
  },
  {
    id: "builtin:single-1-4",
    type: "ramp",
    name: "Single-deck Starter 1-4",
    tags: ["library", "single-deck"],
    created_at: "builtin",
    updated_at: "builtin",
    payload: {
      bet_input_mode: "units",
      bet_ramp: {
        wong_out_below: -2,
        wong_out_policy: "anytime",
        steps: [
          { tc_floor: -1, units: 1 },
          { tc_floor: 2, units: 2 },
          { tc_floor: 3, units: 4 },
        ],
      },
    },
  },
  {
    id: "builtin:aggressive-1-15",
    type: "ramp",
    name: "Aggressive Shoe 1-15 Cap",
    tags: ["library", "aggressive"],
    created_at: "builtin",
    updated_at: "builtin",
    payload: {
      bet_input_mode: "units",
      bet_ramp: {
        wong_out_below: -2,
        wong_out_policy: "anytime",
        steps: [
          { tc_floor: -1, units: 1 },
          { tc_floor: 2, units: 2 },
          { tc_floor: 3, units: 4 },
          { tc_floor: 4, units: 8 },
          { tc_floor: 5, units: 12 },
          { tc_floor: 6, units: 15 },
        ],
      },
    },
  },
];

const cardValue = (card: string) => {
  if (card === "A") return 11;
  if (["T", "J", "Q", "K"].includes(card)) return 10;
  return Number(card);
};

const handValue = (cards: string[]) => {
  let total = cards.reduce((sum, c) => sum + cardValue(c), 0);
  let aces = cards.filter((c) => c === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  const soft = aces > 0 && total <= 21;
  return { total, soft };
};

const upcardKey = (card: string) => (["T", "J", "Q", "K"].includes(card) ? "T" : card);

const basicStrategyAction = (cards: string[], dealerUp: string, rules: Rules) => {
  const { total, soft } = handValue(cards);
  const up = upcardKey(dealerUp);

  if (rules.surrender) {
    if (total === 16 && ["9", "T", "A"].includes(up)) return "R";
    if (total === 15 && up === "T") return "R";
  }

  if (!soft) {
    if (total >= 17) return "S";
    if (total >= 13 && total <= 16) return ["2", "3", "4", "5", "6"].includes(up) ? "S" : "H";
    if (total === 12) return ["4", "5", "6"].includes(up) ? "S" : "H";
    if (total === 11) {
      if (up === "A" && !rules.hit_soft_17) return "H";
      return "DH";
    }
    if (total === 10) return !["T", "A"].includes(up) ? "DH" : "H";
    if (total === 9) {
      if (up === "2" && rules.hit_soft_17) return "DH";
      return ["3", "4", "5", "6"].includes(up) ? "DH" : "H";
    }
    return "H";
  }

  if (total >= 19) return "S";
  if (total === 18) {
    if (up === "2") return rules.hit_soft_17 ? "DS" : "S";
    if (["3", "4", "5", "6"].includes(up)) return "DS";
    if (["7", "8"].includes(up)) return "S";
    return "H";
  }
  if (total === 17) return ["3", "4", "5", "6"].includes(up) ? "DH" : "H";
  if (total === 15 || total === 16) return ["4", "5", "6"].includes(up) ? "DH" : "H";
  if (total === 13 || total === 14) return ["5", "6"].includes(up) ? "DH" : "H";
  return "H";
};

const pairStrategyAction = (rank: string, dealerUp: string, rules: Rules) => {
  const up = upcardKey(dealerUp);
  if (rank === "A") return "P";
  if (["T", "J", "Q", "K"].includes(rank)) return "S";
  if (rank === "9") return ["2", "3", "4", "5", "6", "8", "9"].includes(up) ? "P" : "S";
  if (rank === "8") return "P";
  if (rank === "7") return ["2", "3", "4", "5", "6", "7"].includes(up) ? "P" : "H";
  if (rank === "6") {
    if (rules.double_after_split) return ["2", "3", "4", "5", "6"].includes(up) ? "P" : "H";
    return ["3", "4", "5", "6"].includes(up) ? "P" : "H";
  }
  if (rank === "5") return ["2", "3", "4", "5", "6", "7", "8", "9"].includes(up) ? "D" : "H";
  if (rank === "4") return rules.double_after_split && ["5", "6"].includes(up) ? "P" : "H";
  if (rank === "3" || rank === "2") {
    if (rules.double_after_split) return ["2", "3", "4", "5", "6", "7"].includes(up) ? "P" : "H";
    return ["4", "5", "6", "7"].includes(up) ? "P" : "H";
  }
  return "H";
};

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    return raw ? (JSON.parse(raw) as Preset[]) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

function App() {
  const backendDisabled =
    import.meta.env.VITE_DISABLE_BACKEND === "1" || import.meta.env.VITE_DISABLE_BACKEND === "true";
  const [currentPage, setCurrentPage] = useState<AppPage>(() =>
    import.meta.env.VITE_DEFAULT_PAGE === "training" ? "training" : "simulator"
  );
  const [defaults, setDefaults] = useState<DefaultLibraries | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [betRamp, setBetRamp] = useState<BetRamp | null>(null);
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [hands, setHands] = useState<number>(2_000_000);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000_000));
  const [randomizeSeedEachRun, setRandomizeSeedEachRun] = useState<boolean>(true);
  const [useMultiprocessing, setUseMultiprocessing] = useState<boolean>(true);
  const [unitSize, setUnitSize] = useState<number>(10);
  const [bankroll, setBankroll] = useState<number | null>(null);
  const [handsPerHour, setHandsPerHour] = useState<number>(75);
  const [debugLog, setDebugLog] = useState<boolean>(false);
  const [debugLogHands, setDebugLogHands] = useState<number>(20);
  const [simId, setSimId] = useState<string | null>(null);
  const [status, setStatus] = useState<UiStatus>("idle");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [progress, setProgress] = useState<SimulationStatus | null>(null);
  const [useCashBets, setUseCashBets] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("New Scenario");
  const [lastRunConfig, setLastRunConfig] = useState<string | null>(null);
  const [lastSavedConfig, setLastSavedConfig] = useState<string | null>(null);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [showLoadPreset, setShowLoadPreset] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetType, setPresetType] = useState<PresetType>("scenario");
  const [presetName, setPresetName] = useState<string>("New Scenario");
  const [presetTags, setPresetTags] = useState<string>("");
  const [searchPresets, setSearchPresets] = useState("");
  const [tcEstStep, setTcEstStep] = useState<number>(1.0);
  const [tcEstRounding, setTcEstRounding] = useState<string>("floor");
  const [useEstForBet, setUseEstForBet] = useState<boolean>(true);
  const [useEstForDev, setUseEstForDev] = useState<boolean>(true);
  const [devSearch, setDevSearch] = useState<string>("");
  const [devFilter, setDevFilter] = useState<string>("all");
  const [showUnits, setShowUnits] = useState<boolean>(true);
  const [rulesPreset, setRulesPreset] = useState<string>("default");
  const [cutDecks, setCutDecks] = useState<number | null>(null);
  const [pathCount, setPathCount] = useState<number>(10);
  const [tripHours, setTripHours] = useState<number>(4);
  const [tripHandsPerHour, setTripHandsPerHour] = useState<number>(75);
  const [tripSteps, setTripSteps] = useState<number>(120);
  const [bandMode, setBandMode] = useState<"sigma" | "percentile">("sigma");
  const [sigmaK, setSigmaK] = useState<number>(1);
  const [startBankrollUnits, setStartBankrollUnits] = useState<number | null>(null);
  const [stopLossUnits, setStopLossUnits] = useState<number | null>(null);
  const [winGoalUnits, setWinGoalUnits] = useState<number | null>(null);
  const [showConfidence, setShowConfidence] = useState<boolean>(true);
  const [precisionPreset, setPrecisionPreset] = useState<keyof typeof precisionPresets>("balanced");
  const [precisionAbsolute, setPrecisionAbsolute] = useState<number>(precisionPresets.balanced.abs);
  const [precisionMinHands, setPrecisionMinHands] = useState<number>(1_000_000);
  const [autoPrecisionActive, setAutoPrecisionActive] = useState<boolean>(false);
  const [rampPresetId, setRampPresetId] = useState<string>("builtin:bjinfo-1-8");
  const [deviationPresetId, setDeviationPresetId] = useState<string>("");
  const [rorMode, setRorMode] = useState<"simple" | "trip">("simple");
  const [rorTripMode, setRorTripMode] = useState<"hands" | "hours">("hands");
  const [rorTripValue, setRorTripValue] = useState<number>(2_000_000);
  const [optMaxUnits, setOptMaxUnits] = useState<number>(12);
  const [optKellyFraction, setOptKellyFraction] = useState<number>(1);
  const [optBetIncrement, setOptBetIncrement] = useState<number>(1);
  const [optSimplify, setOptSimplify] = useState<boolean>(true);
  const [negativeEdgePolicy, setNegativeEdgePolicy] = useState<"sit_out" | "min_bet" | "hide">("sit_out");
  const [showEdgeBars, setShowEdgeBars] = useState<boolean>(false);
  const [showExactLine, setShowExactLine] = useState<boolean>(false);
  const [customHandsInput, setCustomHandsInput] = useState<string>("");
  const [isAppending, setIsAppending] = useState<boolean>(false);
  const [appendBase, setAppendBase] = useState<SimulationResult | null>(null);

  // Refs to track current append state for polling (avoids stale closure)
  const isAppendingRef = useRef(isAppending);
  const appendBaseRef = useRef(appendBase);
  useEffect(() => { isAppendingRef.current = isAppending; }, [isAppending]);
  useEffect(() => { appendBaseRef.current = appendBase; }, [appendBase]);
  const [hoverPoint, setHoverPoint] = useState<{ index: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    const applyDefaults = (data: DefaultLibraries) => {
      setDefaults(data);
      setRules(data.rules);
      // Apply BJInfo 1-8 as default ramp instead of backend default
      const defaultRamp = builtInRampPresets.find((p) => p.id === "builtin:bjinfo-1-8");
      if (defaultRamp?.payload?.bet_ramp) {
        setBetRamp({ wong_out_policy: "anytime", ...defaultRamp.payload.bet_ramp });
      } else {
        setBetRamp(data.bet_ramp);
      }
      setDeviations(data.deviations);
    };

    if (backendDisabled) {
      applyDefaults(CLIENT_DEFAULTS);
      return;
    }
    fetchDefaults()
      .then(applyDefaults)
      .catch((err) => setError(`Failed to load defaults: ${err.message}`));
  }, [backendDisabled]);

  useEffect(() => {
    setCustomHandsInput(hands.toString());
  }, [hands]);

  useEffect(() => {
    const preset = precisionPresets[precisionPreset];
    setPrecisionAbsolute(preset.abs);
  }, [precisionPreset]);

  useEffect(() => {
    if (tcEstStep === 0) {
      setUseEstForBet(false);
      setUseEstForDev(false);
    }
  }, [tcEstStep]);

  useEffect(() => {
    if (!simId) return;
    setStatus("running");

    // IMPORTANT: avoid overlapping async polls (setInterval + await can overlap).
    // Overlaps can cause a finished append-combine to be overwritten by a later poll,
    // making it look like previously simulated hands "disappeared".
    let cancelled = false;
    let errorCount = 0;
    const maxErrors = 5;
    let resultFetchErrors = 0;
    const maxResultFetchErrors = 8;
    let timeoutId: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const stat = await getSimulationStatus(simId);
        if (cancelled) return;
        errorCount = 0; // Reset on success
        setProgress(stat);

        const finish = async (finalStatus: "done" | "stopped") => {
          try {
            const data = await getSimulation(simId);
            if (cancelled) return;
            // Use refs to get current append state (avoids stale closure)
            if (isAppendingRef.current && appendBaseRef.current) {
              setResult(combineResults(appendBaseRef.current, data));
              setIsAppending(false);
              setAppendBase(null);
            } else {
              setResult(data);
            }
            resultFetchErrors = 0;
          } catch {
            resultFetchErrors += 1;
            // If we can't fetch the full result yet, treat as transient and retry.
            // Do NOT mark the run "done" without a result, otherwise the UI shows n/a.
            if (finalStatus === "done" && resultFetchErrors < maxResultFetchErrors) {
              timeoutId = window.setTimeout(poll, 750);
              return;
            }
            if (finalStatus === "done" && resultFetchErrors >= maxResultFetchErrors) {
              setError("Simulation finished, but fetching final results failed. Try reloading the page or re-running.");
              setStatus("error");
              return;
            }
            // If stopped, a full result may not exist; keep any partial result.
          }
          if (cancelled) return;
          setIsAppending(false);
          setAppendBase(null);
          setStatus(finalStatus);
        };

        if (stat.status === "done" || stat.progress >= 1) {
          await finish("done");
          return;
        }

        if (stat.status === "stopped") {
          await finish("stopped");
          return;
        }
      } catch (err: unknown) {
        if (cancelled) return;
        errorCount++;
        const is404 =
          err &&
          typeof err === "object" &&
          "response" in err &&
          (err as { response?: { status?: number } }).response?.status === 404;

        if (is404 || errorCount >= maxErrors) {
          setStatus("stopped");
          setSimId(null);
          return;
        }
        // Otherwise keep polling on transient errors.
      }

      if (cancelled) return;
      timeoutId = window.setTimeout(poll, 750);
    };

    poll();
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [simId]);

  const updateRule = <K extends keyof Rules>(key: K, value: Rules[K]) => {
    if (!rules) return;
    setRules({ ...rules, [key]: value });
  };

  const updateRampEntry = (index: number, key: keyof BetRampEntry, value: number) => {
    if (!betRamp) return;
    const steps = [...betRamp.steps];
    steps[index] = { ...steps[index], [key]: value };
    setBetRamp({ ...betRamp, steps });
  };

  const addRampEntry = () => {
    if (!betRamp) return;
    setBetRamp({ ...betRamp, steps: [...betRamp.steps, emptyRampEntry()] });
  };

  const removeRampEntry = (index: number) => {
    if (!betRamp) return;
    setBetRamp({ ...betRamp, steps: betRamp.steps.filter((_, i) => i !== index) });
  };

  const addDeviation = () => setDeviations(normalizeDeviations([...deviations, emptyDeviation()]));
  const normalizeDeviations = (list: Deviation[]) => {
    const seen = new Set<string>();
    const unique: Deviation[] = [];
    for (const dev of list) {
      const key = `${dev.hand_key}|${dev.tc_floor}|${dev.action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(dev);
    }
    return unique;
  };
  const updateDeviation = (index: number, key: keyof Deviation, value: string | number) => {
    const next = [...deviations];
    next[index] = { ...next[index], [key]: value } as Deviation;
    setDeviations(normalizeDeviations(next));
  };
  const removeDeviation = (index: number) => setDeviations(deviations.filter((_, i) => i !== index));
  const loadPresetDeviations = () => defaults && setDeviations(normalizeDeviations(defaults.deviations));

  const conflictCount = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const dev of deviations) {
      const key = `${dev.hand_key}|${dev.tc_floor}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)?.add(dev.action);
    }
    let conflicts = 0;
    for (const actions of map.values()) {
      if (actions.size > 1) conflicts += 1;
    }
    return conflicts;
  }, [deviations]);

  const normalizePenetration = (value: number) => {
    if (value > 1 && value <= 100) return value / 100;
    return value;
  };

  const parseHandsInput = (value: string) => {
    const cleaned = value.replace(/,/g, "").trim();
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  };

  const parseRoundsFromResult = (res: SimulationResult | null) => {
    if (!res) return 0;
    // Prefer direct rounds_played field, fall back to meta
    if (res.rounds_played && res.rounds_played > 0) return res.rounds_played;
    const raw = res.meta?.rounds_played ?? res.meta?.hands_played ?? "";
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const updatePenetrationFromCut = (decksCut: number) => {
    if (!rules) return;
    const totalDecks = Math.max(1, rules.decks);
    const cut = Math.min(Math.max(decksCut, 0), totalDecks - 0.1);
    const pen = 1 - cut / totalDecks;
    updateRule("penetration", Number(pen.toFixed(4)));
  };

  const randomizeSeed = () => setSeed(Math.floor(Math.random() * 1_000_000_000));

  const applyRulesPreset = (preset: string) => {
    if (!defaults) return;
    if (preset === "default") {
      setRules(defaults.rules);
    } else if (preset === "s17") {
      setRules({ ...defaults.rules, hit_soft_17: false });
    }
  };

  const rampPresets = useMemo(() => presets.filter((p) => p.type === "ramp"), [presets]);
  const deviationPresets = useMemo(() => presets.filter((p) => p.type === "deviations"), [presets]);
  const allRampPresets = useMemo(() => [...builtInRampPresets, ...rampPresets], [rampPresets]);

  const applyRampPreset = (id: string) => {
    const preset = allRampPresets.find((p) => p.id === id);
    if (preset) {
      if (preset.payload?.bet_ramp) {
        setBetRamp({ wong_out_policy: "anytime", ...preset.payload.bet_ramp });
        setUseCashBets(preset.payload.bet_input_mode === "cash");
      } else {
        setBetRamp({ wong_out_policy: "anytime", ...preset.payload });
      }
      setRampPresetId(id);
    }
  };

  const applyDeviationPreset = (id: string) => {
    const preset = deviationPresets.find((p) => p.id === id);
    if (preset) {
      setDeviations(normalizeDeviations(preset.payload));
      setDeviationPresetId(id);
    }
  };

  const scenarioConfig = useMemo(() => {
    if (!defaults || !rules || !betRamp) return null;
    const filteredDevs = rules.surrender
      ? deviations
      : deviations.filter((dev) => !dev.hand_key.includes("surrender"));
    const effectiveUseEstForBet = tcEstStep === 0 ? false : useEstForBet;
    const effectiveUseEstForDev = tcEstStep === 0 ? false : useEstForDev;
    return {
      name: scenarioName,
      rules,
      bet_ramp: betRamp,
      deviations: filteredDevs,
      counting_system: defaults.count,
      settings: {
        hands,
        seed,
        unit_size: unitSize,
        bankroll,
        hands_per_hour: handsPerHour,
        debug_log: debugLog,
        debug_log_hands: debugLogHands,
        deck_estimation_step: tcEstStep,
        deck_estimation_rounding: tcEstRounding,
        use_estimated_tc_for_bet: effectiveUseEstForBet,
        use_estimated_tc_for_deviations: effectiveUseEstForDev,
      },
    };
  }, [
    defaults,
    rules,
    betRamp,
    deviations,
    scenarioName,
    hands,
    seed,
    unitSize,
    bankroll,
    handsPerHour,
    debugLog,
    debugLogHands,
    tcEstStep,
    tcEstRounding,
    useEstForBet,
    useEstForDev,
  ]);

  const scenarioJson = useMemo(() => (scenarioConfig ? JSON.stringify(scenarioConfig) : ""), [scenarioConfig]);
  const scenarioCompareJson = useMemo(() => {
    if (!scenarioConfig) return "";
    return serializeForStaleCheck(scenarioConfig, randomizeSeedEachRun);
  }, [scenarioConfig, randomizeSeedEachRun]);
  const isStale = lastRunConfig !== null && lastRunConfig !== scenarioCompareJson;
  const isDirty = lastSavedConfig !== null ? lastSavedConfig !== scenarioJson : scenarioConfig !== null;

  const handleRun = async () => {
    if (!scenarioConfig) return;
    setError(null);
    setResult(null);
    setAppendBase(null);
    setIsAppending(false);
    try {
      const runSeed = randomizeSeedEachRun ? Math.floor(Math.random() * 1_000_000_000) : seed;
      if (randomizeSeedEachRun) setSeed(runSeed);
      const runConfig = {
        ...scenarioConfig,
        settings: { ...scenarioConfig.settings, seed: runSeed },
      };
      const runConfigJson = serializeForStaleCheck(runConfig, randomizeSeedEachRun);
      const payload = {
        rules: runConfig.rules,
        counting_system: runConfig.counting_system,
        deviations: runConfig.deviations,
        bet_ramp: { wong_out_policy: "anytime", ...runConfig.bet_ramp },
        unit_size: runConfig.settings.unit_size,
        bankroll: runConfig.settings.bankroll,
        hands: runConfig.settings.hands,
        seed: runConfig.settings.seed,
        debug_log: runConfig.settings.debug_log,
        debug_log_hands: runConfig.settings.debug_log_hands,
        deck_estimation_step: runConfig.settings.deck_estimation_step,
        deck_estimation_rounding: runConfig.settings.deck_estimation_rounding,
        use_estimated_tc_for_bet: runConfig.settings.use_estimated_tc_for_bet,
        use_estimated_tc_for_deviations: runConfig.settings.use_estimated_tc_for_deviations,
        hands_per_hour: runConfig.settings.hands_per_hour,
        use_multiprocessing: useMultiprocessing,
      };
      const { id } = await startSimulation(payload);
      setSimId(id);
      setStatus("running");
      setProgress({ status: "running", progress: 0, hands_done: 0, hands_total: hands });
      setLastRunConfig(runConfigJson);
    } catch (err: any) {
      setError(err.message ?? "Failed to start simulation");
      setStatus("error");
    }
  };

  const handleRunWithHands = async (handsCount: number) => {
    if (!scenarioConfig) return;
    setError(null);
    setResult(null);
    setAppendBase(null);
    setIsAppending(false);
    try {
      const runSeed = randomizeSeedEachRun ? Math.floor(Math.random() * 1_000_000_000) : seed;
      if (randomizeSeedEachRun) setSeed(runSeed);
      const runConfig = {
        ...scenarioConfig,
        settings: { ...scenarioConfig.settings, seed: runSeed, hands: handsCount },
      };
      const runConfigJson = serializeForStaleCheck(runConfig, randomizeSeedEachRun);
      const payload = {
        rules: runConfig.rules,
        counting_system: runConfig.counting_system,
        deviations: runConfig.deviations,
        bet_ramp: { wong_out_policy: "anytime", ...runConfig.bet_ramp },
        unit_size: runConfig.settings.unit_size,
        bankroll: runConfig.settings.bankroll,
        hands: handsCount,
        seed: runConfig.settings.seed,
        debug_log: runConfig.settings.debug_log,
        debug_log_hands: runConfig.settings.debug_log_hands,
        deck_estimation_step: runConfig.settings.deck_estimation_step,
        deck_estimation_rounding: runConfig.settings.deck_estimation_rounding,
        use_estimated_tc_for_bet: runConfig.settings.use_estimated_tc_for_bet,
        use_estimated_tc_for_deviations: runConfig.settings.use_estimated_tc_for_deviations,
        hands_per_hour: runConfig.settings.hands_per_hour,
        use_multiprocessing: useMultiprocessing,
      };
      const { id } = await startSimulation(payload);
      setSimId(id);
      setStatus("running");
      setProgress({ status: "running", progress: 0, hands_done: 0, hands_total: handsCount });
      setLastRunConfig(runConfigJson);
    } catch (err: any) {
      setError(err.message ?? "Failed to start simulation");
      setStatus("error");
    }
  };

  const combineResults = (base: SimulationResult, next: SimulationResult): SimulationResult => {
    const n1 = parseRoundsFromResult(base);
    const n2 = parseRoundsFromResult(next);
    const totalN = n1 + n2;

    const mean1 = base.ev_per_100 / 100;
    const mean2 = next.ev_per_100 / 100;
    const var1 = base.variance_per_hand;
    const var2 = next.variance_per_hand;
    const sum1 = mean1 * n1;
    const sum2 = mean2 * n2;
    const sumSq1 = (var1 + mean1 * mean1) * n1;
    const sumSq2 = (var2 + mean2 * mean2) * n2;

    const sumTotal = sum1 + sum2;
    const sumSqTotal = sumSq1 + sumSq2;
    const meanTotal = totalN > 0 ? sumTotal / totalN : 0;
    const varianceTotal = totalN > 0 ? Math.max(sumSqTotal / totalN - meanTotal * meanTotal, 0) : 0;
    const stdevTotal = Math.sqrt(varianceTotal);

    const avgBet1 = base.avg_initial_bet ?? null;
    const avgBet2 = next.avg_initial_bet ?? null;
    const betSum1 = avgBet1 !== null ? avgBet1 * n1 : null;
    const betSum2 = avgBet2 !== null ? avgBet2 * n2 : null;
    const betSumTotal = betSum1 !== null && betSum2 !== null ? betSum1 + betSum2 : null;
    const avgInitialBet = betSumTotal !== null && totalN > 0 ? betSumTotal / totalN : null;

    const mergeCounts = (a: Record<string, number> | Record<number, number> = {}, b: Record<string, number> | Record<number, number> = {}) => {
      const out: Record<number, number> = {};
      const add = (key: string, val: number) => {
        const numKey = Number(key);
        out[numKey] = (out[numKey] ?? 0) + val;
      };
      Object.entries(a).forEach(([k, v]) => add(k, v));
      Object.entries(b).forEach(([k, v]) => add(k, v));
      return out;
    };

    const combineTcTable = () => {
      const map = new Map<number, { n: number; sumX: number; sumX2: number }>();
      const addEntry = (entry: { tc: number; n: number; ev_pct: number; variance: number }) => {
        const mean = entry.ev_pct / 100;
        const sumX = mean * entry.n;
        const sumX2 = (entry.variance + mean * mean) * entry.n;
        const current = map.get(entry.tc) ?? { n: 0, sumX: 0, sumX2: 0 };
        current.n += entry.n;
        current.sumX += sumX;
        current.sumX2 += sumX2;
        map.set(entry.tc, current);
      };
      (base.tc_table ?? []).forEach(addEntry);
      (next.tc_table ?? []).forEach(addEntry);
      const combined: SimulationResult["tc_table"] = [];
      map.forEach((value, tc) => {
        if (value.n <= 0) return;
        const mean = value.sumX / value.n;
        const variance = Math.max(value.sumX2 / value.n - mean * mean, 0);
        const se = Math.sqrt(variance / value.n);
        combined.push({
          tc,
          n: value.n,
          freq: totalN > 0 ? value.n / totalN : 0,
          ev_pct: mean * 100,
          ev_se_pct: se * 100,
          variance,
        });
      });
      combined.sort((a, b) => a.tc - b.tc);
      return combined;
    };

    const bankrollUnits = bankroll !== null && unitSize > 0 ? bankroll / unitSize : null;
    const ror = bankrollUnits !== null
      ? meanTotal <= 0
        ? 1.0
        : varianceTotal > 0
          ? Math.exp((-2 * meanTotal * bankrollUnits) / varianceTotal)
          : 0.0
      : null;

    return {
      ev_per_100: meanTotal * 100,
      stdev_per_100: stdevTotal * 10,
      variance_per_hand: varianceTotal,
      di: stdevTotal > 0 ? meanTotal / stdevTotal : 0,
      score: varianceTotal > 0 ? (100 * meanTotal * meanTotal) / varianceTotal : 0,
      n0_hands: meanTotal !== 0 ? varianceTotal / (meanTotal * meanTotal) : 0,
      ror,
      avg_initial_bet: avgInitialBet,
      avg_initial_bet_units: avgInitialBet,
      tc_histogram: mergeCounts(base.tc_histogram ?? {}, next.tc_histogram ?? {}),
      tc_histogram_est: mergeCounts(base.tc_histogram_est ?? {}, next.tc_histogram_est ?? {}),
      tc_table: combineTcTable(),
      meta: {
        rounds_played: totalN.toString(),
        note: "combined samples",
      },
      hours_played: handsPerHour > 0 ? totalN / handsPerHour : null,
      debug_hands: base.debug_hands ?? next.debug_hands ?? undefined,
    };
  };

  const handleAppendHands = async (addHands: number) => {
    if (!scenarioConfig || !result || addHands <= 0) return;
    setError(null);
    setIsAppending(true);
    setAppendBase(result);
    try {
      const runSeed = randomizeSeedEachRun ? Math.floor(Math.random() * 1_000_000_000) : seed;
      if (randomizeSeedEachRun) setSeed(runSeed);
      const runConfig = { ...scenarioConfig, settings: { ...scenarioConfig.settings, seed: runSeed } };
      const runConfigJson = serializeForStaleCheck(runConfig, randomizeSeedEachRun);
      const payload = {
        rules: scenarioConfig.rules,
        counting_system: scenarioConfig.counting_system,
        deviations: scenarioConfig.deviations,
        bet_ramp: { wong_out_policy: "anytime", ...scenarioConfig.bet_ramp },
        unit_size: scenarioConfig.settings.unit_size,
        bankroll: scenarioConfig.settings.bankroll,
        hands: addHands,
        seed: runSeed,
        debug_log: scenarioConfig.settings.debug_log,
        debug_log_hands: scenarioConfig.settings.debug_log_hands,
        deck_estimation_step: scenarioConfig.settings.deck_estimation_step,
        deck_estimation_rounding: scenarioConfig.settings.deck_estimation_rounding,
        use_estimated_tc_for_bet: scenarioConfig.settings.use_estimated_tc_for_bet,
        use_estimated_tc_for_deviations: scenarioConfig.settings.use_estimated_tc_for_deviations,
        hands_per_hour: scenarioConfig.settings.hands_per_hour,
        use_multiprocessing: useMultiprocessing,
      };
      const { id } = await startSimulation(payload);
      setSimId(id);
      setStatus("running");
      setProgress({ status: "running", progress: 0, hands_done: 0, hands_total: addHands });
      setLastRunConfig(runConfigJson);
    } catch (err: any) {
      setError(err.message ?? "Failed to append simulation");
      setStatus("error");
      setIsAppending(false);
      setAppendBase(null);
    }
  };

  const handleContinueToPrecision = () => {
    if (status === "running") return;
    setError(null);
    setAutoPrecisionActive(true);
    if (!result) {
      const startHands = Math.max(hands, precisionMinHands);
      setHands(startHands);
      setCustomHandsInput(startHands.toString());
      handleRunWithHands(startHands);
      return;
    }
    if (!precisionEstimate) {
      setError("Unable to estimate precision. Run more hands first.");
      setAutoPrecisionActive(false);
      return;
    }
    const currentTotal = roundsForCi;
    const addToMin = Math.max(precisionMinHands - currentTotal, 0);
    const addToTarget = precisionEstimate.additional;
    const addHands = currentTotal < precisionMinHands ? addToMin : addToTarget;
    if (addHands <= 0) {
      setError("Already within the selected precision target.");
      setAutoPrecisionActive(false);
      return;
    }
    handleAppendHands(addHands);
  };

  const handleStop = async () => {
    // First, tell the backend to stop the simulation
    if (simId) {
      try {
        await stopSimulation(simId);
      } catch {
        // Backend may already be stopped or unavailable - continue with local cleanup
      }
    }

    // If we have progress data, create a partial result to preserve what we've computed.
    // Note: backend reports EV/SD in *units* (unit_size is display-only).
    if (progress && progress.hands_done > 0 && progress.ev_per_100_est != null && progress.stdev_per_100_est != null) {
      const ev = progress.ev_per_100_est;
      const stdev = progress.stdev_per_100_est;
      const mean = ev / 100;
      const variance = Math.pow(stdev / 10, 2);
      const avgBet = progress.avg_initial_bet_est ?? result?.avg_initial_bet ?? 0;

      // Create partial result from progress
      const partialResult: SimulationResult = {
        rounds_played: progress.hands_done,
        ev_per_100: ev,
        stdev_per_100: stdev,
        variance_per_hand: variance,
        avg_initial_bet: avgBet,
        di: variance > 0 ? mean / Math.sqrt(variance) : 0,
        score: variance > 0 ? 100 * (mean * mean) / variance : 0,
        n0_hands: mean !== 0 ? variance / (mean * mean) : 0,
        hours_played: handsPerHour > 0 ? progress.hands_done / handsPerHour : 0,
        tc_histogram: result?.tc_histogram ?? {},
        tc_histogram_est: result?.tc_histogram_est ?? {},
        tc_table: result?.tc_table ?? [],
        debug_hands: [],
        ror: null,
        ror_detail: null,
      };

      // If appending, merge with previous result
      if (isAppending && appendBase) {
        const baseRounds = parseRoundsFromResult(appendBase);
        const totalRounds = baseRounds + progress.hands_done;
        const n1 = baseRounds;
        const n2 = progress.hands_done;
        const mean1 = appendBase.ev_per_100 / 100;
        const var1 = appendBase.variance_per_hand;
        const mean2 = mean;
        const var2 = variance;

        const meanTotal = (n1 * mean1 + n2 * mean2) / totalRounds;
        const varTotal = ((n1 - 1) * var1 + (n2 - 1) * var2 + n1 * Math.pow(mean1 - meanTotal, 2) + n2 * Math.pow(mean2 - meanTotal, 2)) / (totalRounds - 1);
        const stdevTotal = Math.sqrt(varTotal);

        partialResult.rounds_played = totalRounds;
        partialResult.ev_per_100 = meanTotal * 100;
        partialResult.stdev_per_100 = stdevTotal * 10;
        partialResult.variance_per_hand = varTotal;
        partialResult.di = stdevTotal > 0 ? meanTotal / stdevTotal : 0;
        partialResult.score = varTotal > 0 ? 100 * (meanTotal * meanTotal) / varTotal : 0;
        partialResult.n0_hands = meanTotal !== 0 ? varTotal / (meanTotal * meanTotal) : 0;
        partialResult.hours_played = handsPerHour > 0 ? totalRounds / handsPerHour : 0;
      }

      setResult(partialResult);
      setIsAppending(false);
      setAppendBase(null);
    }

    setSimId(null);
    setStatus("stopped");
    setAutoPrecisionActive(false);
  };

  const statusLabel = () => {
    if (status === "running" && progress) {
      const total = progressHandsTotal;
      const done = progressHandsDone;
      const frac = total > 0 ? done / total : progress.progress;
      const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
      if ((progress.status === "done" || progress.progress >= 1 || pct >= 100) && !result) return "Finalizing results…";
      return `Running ${pct}%`;
    }
    if (status === "done") return "Complete";
    if (status === "error") return "Error";
    if (status === "stopped") return "Stopped";
    return "Idle";
  };

  const handleSavePreset = () => {
    if (!scenarioConfig) return;
    const now = new Date().toISOString();
    const payload =
      presetType === "rules"
        ? scenarioConfig.rules
        : presetType === "ramp"
          ? { bet_ramp: scenarioConfig.bet_ramp, bet_input_mode: useCashBets ? "cash" : "units" }
          : presetType === "deviations"
            ? scenarioConfig.deviations
            : scenarioConfig;
    const preset: Preset = {
      id: crypto.randomUUID(),
      type: presetType,
      name: presetName || `${presetType} preset`,
      tags: presetTags.split(",").map((t) => t.trim()).filter(Boolean),
      created_at: now,
      updated_at: now,
      payload,
    };
    const next = [preset, ...presets];
    updatePresetList(next);
    if (presetType === "scenario") {
      setLastSavedConfig(scenarioJson);
      setScenarioName(preset.name);
    }
    setShowSavePreset(false);
  };

  const handleLoadPreset = (preset: Preset) => {
    if (!defaults) return;
    if (preset.type === "rules") {
      setRules({ ...defaults.rules, ...preset.payload });
    } else if (preset.type === "ramp") {
      setBetRamp(preset.payload);
    } else if (preset.type === "deviations") {
      setDeviations(preset.payload);
    } else if (preset.type === "scenario") {
      const payload = preset.payload;
      setScenarioName(payload.name ?? "Scenario");
      setRules({ ...defaults.rules, ...payload.rules });
      setBetRamp(payload.bet_ramp ?? defaults.bet_ramp);
      setDeviations(payload.deviations ?? defaults.deviations);
      if (payload.settings) {
        setHands(payload.settings.hands ?? hands);
        setSeed(payload.settings.seed ?? seed);
        setUnitSize(payload.settings.unit_size ?? unitSize);
        setBankroll(payload.settings.bankroll ?? null);
        setHandsPerHour(payload.settings.hands_per_hour ?? handsPerHour);
        setDebugLog(payload.settings.debug_log ?? false);
        setDebugLogHands(payload.settings.debug_log_hands ?? 20);
        setTcEstStep(payload.settings.deck_estimation_step ?? 0);
        setTcEstRounding(payload.settings.deck_estimation_rounding ?? "nearest");
        setUseEstForBet(payload.settings.use_estimated_tc_for_bet ?? true);
        setUseEstForDev(payload.settings.use_estimated_tc_for_deviations ?? true);
      }
      setLastSavedConfig(JSON.stringify(payload));
    }
    setShowLoadPreset(false);
  };

  const handleExport = () => {
    if (!scenarioConfig) return;
    const blob = new Blob([JSON.stringify(scenarioConfig, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${scenarioName.replace(/\s+/g, "_").toLowerCase() || "scenario"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportRamp = () => {
    if (!betRamp) return;
    const payload = { bet_ramp: betRamp, bet_input_mode: useCashBets ? "cash" : "units" };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bet_ramp.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDeviations = () => {
    const blob = new Blob([JSON.stringify(deviations, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "deviations.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const updatePresetList = (next: Preset[]) => {
    setPresets(next);
    savePresets(next);
  };

  const duplicatePreset = (preset: Preset) => {
    const now = new Date().toISOString();
    const copy: Preset = {
      ...preset,
      id: crypto.randomUUID(),
      name: `${preset.name} Copy`,
      created_at: now,
      updated_at: now,
    };
    updatePresetList([copy, ...presets]);
  };

  const renamePreset = (preset: Preset) => {
    const name = prompt("Rename preset", preset.name);
    if (!name) return;
    const next = presets.map((p) => (p.id === preset.id ? { ...p, name, updated_at: new Date().toISOString() } : p));
    updatePresetList(next);
  };

  const deletePreset = (preset: Preset) => {
    if (!confirm(`Delete preset "${preset.name}"?`)) return;
    const next = presets.filter((p) => p.id !== preset.id);
    updatePresetList(next);
  };

  const importPresetFromFile = (type: PresetType) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const payload = JSON.parse(text);
      const now = new Date().toISOString();
      const preset: Preset = {
        id: crypto.randomUUID(),
        type,
        name: `Imported ${type} preset`,
        tags: ["imported"],
        created_at: now,
        updated_at: now,
        payload,
      };
      updatePresetList([preset, ...presets]);
    };
    input.click();
  };

  const filteredPresets = presets.filter((p) => {
    const q = searchPresets.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.tags.join(" ").toLowerCase().includes(q);
  });

  const filteredDeviations = deviations.filter((dev) => {
    const q = devSearch.trim().toLowerCase();
    if (q && !`${dev.hand_key} ${dev.action}`.toLowerCase().includes(q)) return false;
    if (devFilter === "hard" && dev.hand_key.includes("s")) return false;
    if (devFilter === "soft" && !dev.hand_key.includes("s")) return false;
    if (devFilter === "pairs" && dev.hand_key.length < 2) return false;
    if (devFilter === "surrender" && !dev.hand_key.includes("surrender")) return false;
    if (devFilter === "insurance" && dev.hand_key !== "insurance") return false;
    return true;
  });

  const renderHistogram = (hist: Record<string, number>, label: string) => {
    const entries = Object.entries(hist).sort((a, b) => Number(a[0]) - Number(b[0]));
    if (!entries.length) return null;
    const max = Math.max(...entries.map((e) => e[1]));
    return (
      <div className="card chart-card">
        <div className="card-title">{label}</div>
        <div className="histogram">
          {entries.map(([tc, count]) => (
            <div
              key={tc}
              className="bar"
              style={{ height: `${(count / max) * 100}%` }}
              title={`TC ${tc}: ${count.toLocaleString()}`}
            />
          ))}
        </div>
      </div>
    );
  };

  const rampStats = useMemo(() => {
    if (!betRamp || betRamp.steps.length === 0) return null;
    const units = betRamp.steps.map((s) => s.units);
    const min = Math.min(...units);
    const max = Math.max(...units);
    const spread = min > 0 ? max / min : null;
    return { min, max, spread };
  }, [betRamp]);

  const dealerUpcards = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "A"];
  const pairRows = ["A", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const softRows = ["A,9", "A,8", "A,7", "A,6", "A,5", "A,4", "A,3", "A,2"];
  const hardRows = [17, 16, 15, 14, 13, 12, 11, 10, 9, 8];

  const pairCell = (rank: string, up: string) => {
    if (!rules) return "-";
    const withDas = pairStrategyAction(rank, up, { ...rules, double_after_split: true });
    const withoutDas = pairStrategyAction(rank, up, { ...rules, double_after_split: false });
    if (withDas !== withoutDas) return "Y/N";
    return withDas === "P" ? "Y" : "N";
  };

  const softCell = (row: string, up: string) => {
    if (!rules) return "-";
    const cards = row.split(",").map((c) => c.trim());
    const action = basicStrategyAction(cards, up, rules);
    return action === "DH" ? "D" : action === "DS" ? "Ds" : action;
  };

  const hardCell = (total: number, up: string) => {
    if (!rules) return "-";
    const cards =
      total === 17
        ? ["10", "7"]
        : total === 16
          ? ["10", "6"]
          : total === 15
            ? ["10", "5"]
            : total === 14
              ? ["10", "4"]
              : total === 13
                ? ["10", "3"]
                : total === 12
                  ? ["10", "2"]
                  : total === 11
                    ? ["6", "5"]
                    : total === 10
                      ? ["6", "4"]
                      : total === 9
                        ? ["5", "4"]
                        : ["5", "3"];
    const action = basicStrategyAction(cards, up, rules);
    return action === "DH" ? "D" : action === "DS" ? "Ds" : action;
  };

  const surrenderCell = (total: number, up: string) => {
    if (!rules || !rules.surrender) return "-";
    const cards = total === 16 ? ["10", "6"] : ["10", "5"];
    const action = basicStrategyAction(cards, up, rules);
    return action === "R" ? "SUR" : "-";
  };

  const pairClass = (value: string) => {
    if (value === "Y") return "cell-split";
    if (value === "Y/N") return "cell-split-conditional";
    if (value === "N") return "cell-nosplit";
    return "";
  };

  const actionClass = (value: string) => {
    if (value === "D") return "cell-double";
    if (value === "Ds") return "cell-double-stand";
    if (value === "S") return "cell-stand";
    if (value === "SUR" || value === "R") return "cell-surrender";
    return "cell-hit";
  };

  const formatHours = (hours?: number | null) => {
    if (hours === null || hours === undefined) return "n/a";
    const days = hours / 24;
    const sessions = hours / 4;
    return `${hours.toFixed(2)} hrs (${days.toFixed(0)} days, ${sessions.toFixed(0)} x 4h)`;
  };

  const formatRor = (ror?: number | null) => {
    if (ror === null || ror === undefined) return "n/a";
    return `${(ror * 100).toFixed(3)}%`;
  };

  const erf = (x: number) => {
    const sign = x < 0 ? -1 : 1;
    const abs = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * abs);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-abs * abs);
    return sign * y;
  };

  const normalCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const formatNumber = (value: number | null, decimals = 2) => (value === null || Number.isNaN(value) ? "n/a" : value.toFixed(decimals));
  const formatPercent = (value: number | null, decimals = 1) => (value === null || Number.isNaN(value) ? "n/a" : `${value.toFixed(decimals)}%`);
  const formatRange = (low: number | null, high: number | null, decimals = 2, suffix = "", prefix = "") => {
    if (low === null || high === null || Number.isNaN(low) || Number.isNaN(high)) return "n/a";
    return `${prefix}${low.toFixed(decimals)}${suffix} – ${prefix}${high.toFixed(decimals)}${suffix}`;
  };

  const appendLiveMetrics = useMemo(() => {
    if (!isAppending || !appendBase || !progress) return null;
    if (!progress.hands_done || progress.hands_done <= 0) return null;
    if (progress.ev_per_100_est === null || progress.ev_per_100_est === undefined) return null;
    if (progress.stdev_per_100_est === null || progress.stdev_per_100_est === undefined) return null;
    const n1 = parseRoundsFromResult(appendBase);
    const n2 = progress.hands_done;
    const totalN = n1 + n2;
    if (totalN <= 0) return null;
    const mean1 = appendBase.ev_per_100 / 100;
    const var1 = appendBase.variance_per_hand;
    const mean2 = progress.ev_per_100_est / 100;
    const var2 = Math.pow(progress.stdev_per_100_est / 10, 2);
    const sum1 = mean1 * n1;
    const sum2 = mean2 * n2;
    const sumSq1 = (var1 + mean1 * mean1) * n1;
    const sumSq2 = (var2 + mean2 * mean2) * n2;
    const meanTotal = (sum1 + sum2) / totalN;
    const varianceTotal = Math.max((sumSq1 + sumSq2) / totalN - meanTotal * meanTotal, 0);
    const stdevTotal = Math.sqrt(varianceTotal);
    const avgBet1 = appendBase.avg_initial_bet ?? null;
    const avgBet2 = progress.avg_initial_bet_est ?? null;
    const betSum1 = avgBet1 !== null ? avgBet1 * n1 : null;
    const betSum2 = avgBet2 !== null ? avgBet2 * n2 : null;
    const betSumTotal = betSum1 !== null && betSum2 !== null ? betSum1 + betSum2 : null;
    const avgInitialBet = betSumTotal !== null ? betSumTotal / totalN : null;
    return {
      ev_per_100: meanTotal * 100,
      stdev_per_100: stdevTotal * 10,
      avg_initial_bet: avgInitialBet,
    };
  }, [isAppending, appendBase, progress]);

  const liveMetrics = useMemo(() => {
    if (status !== "running") return null;
    if (appendLiveMetrics) return appendLiveMetrics;
    if (!progress) return null;
    return {
      ev_per_100: progress.ev_per_100_est ?? null,
      stdev_per_100: progress.stdev_per_100_est ?? null,
      avg_initial_bet: progress.avg_initial_bet_est ?? null,
    };
  }, [status, progress, appendLiveMetrics]);

  const progressHandsDone = useMemo(() => {
    if (!progress) return 0;
    if (isAppending && appendBase) {
      return parseRoundsFromResult(appendBase) + (progress.hands_done ?? 0);
    }
    return progress.hands_done ?? 0;
  }, [progress, isAppending, appendBase]);

  const progressHandsTotal = useMemo(() => {
    if (!progress) return 0;
    if (isAppending && appendBase) {
      return parseRoundsFromResult(appendBase) + (progress.hands_total ?? 0);
    }
    return progress.hands_total ?? 0;
  }, [progress, isAppending, appendBase]);

  // Unit-first API: backend returns EV/SD in table units. Dollars are derived in the UI via unit size.
  const evPer100Units = liveMetrics?.ev_per_100 ?? result?.ev_per_100 ?? null;
  const stdevPer100Units = liveMetrics?.stdev_per_100 ?? result?.stdev_per_100 ?? null;
  const avgInitialBetUnits = liveMetrics?.avg_initial_bet ?? result?.avg_initial_bet ?? null;
  const displayUnitSize = unitSize;
  const evPerRoundUnits = evPer100Units !== null ? evPer100Units / 100 : null;
  const winRateUnits = evPerRoundUnits !== null ? evPerRoundUnits * handsPerHour : null;
  const winRateDollars = winRateUnits !== null ? winRateUnits * displayUnitSize : null;
  const evPer100DisplayDollars = evPer100Units !== null ? evPer100Units * displayUnitSize : null;
  const stdevPer100DisplayDollars = stdevPer100Units !== null ? stdevPer100Units * displayUnitSize : null;
  const avgInitialBetDisplayDollars = avgInitialBetUnits !== null ? avgInitialBetUnits * displayUnitSize : null;
  const evPerRoundDisplayDollars = evPerRoundUnits !== null ? evPerRoundUnits * displayUnitSize : null;
  const winLossPct =
    avgInitialBetUnits !== null && evPerRoundUnits !== null ? (evPerRoundUnits / avgInitialBetUnits) * 100 : null;
  const cScore = result?.di ? result.di * result.di : null;
  const riskBankrollUnits = bankroll !== null && displayUnitSize > 0 ? bankroll / displayUnitSize : null;

  const tripHands = useMemo(() => {
    if (!rorTripValue || Number.isNaN(rorTripValue)) return 0;
    if (rorTripMode === "hours") return Math.max(0, rorTripValue * Math.max(handsPerHour, 0));
    return Math.max(0, rorTripValue);
  }, [rorTripMode, rorTripValue, handsPerHour]);

  const roundsForCi = useMemo(() => {
    if (status === "running" && progressHandsDone > 0) return progressHandsDone;
    return result ? parseRoundsFromResult(result) : 0;
  }, [status, progressHandsDone, result]);

  const ciMetrics = useMemo(() => {
    if (evPer100Units === null || stdevPer100Units === null) return null;
    if (!roundsForCi || roundsForCi <= 1) return null;
    const mean = evPer100Units / 100;
    const sd = stdevPer100Units / 10;
    if (sd <= 0) return null;
    const z = 1.96;
    const seMean = sd / Math.sqrt(roundsForCi);
    const meanLow = mean - z * seMean;
    const meanHigh = mean + z * seMean;

    const seSd = sd / Math.sqrt(2 * roundsForCi);
    const sdLow = Math.max(sd - z * seSd, 0);
    const sdHigh = sd + z * seSd;
    const varianceLow = sdLow * sdLow;
    const varianceHigh = sdHigh * sdHigh;

    const meanAbsLow = Math.min(Math.abs(meanLow), Math.abs(meanHigh));
    const meanAbsHigh = Math.max(Math.abs(meanLow), Math.abs(meanHigh));

    let diLow: number | null = null;
    let diHigh: number | null = null;
    if (sdLow > 0) {
      diLow = meanLow / sdHigh;
      diHigh = meanHigh / sdLow;
    }

    let scoreLow: number | null = null;
    let scoreHigh: number | null = null;
    if (varianceLow > 0 && varianceHigh > 0) {
      scoreLow = (100 * meanAbsLow * meanAbsLow) / varianceHigh;
      scoreHigh = (100 * meanAbsHigh * meanAbsHigh) / varianceLow;
    }

    let n0Low: number | null = null;
    let n0High: number | null = null;
    if (!(meanLow <= 0 && meanHigh >= 0) && meanAbsLow > 0) {
      n0Low = varianceLow / (meanAbsHigh * meanAbsHigh);
      n0High = varianceHigh / (meanAbsLow * meanAbsLow);
    }

    let winLossLow: number | null = null;
    let winLossHigh: number | null = null;
    if (avgInitialBetUnits !== null && avgInitialBetUnits > 0) {
      winLossLow = (meanLow / avgInitialBetUnits) * 100;
      winLossHigh = (meanHigh / avgInitialBetUnits) * 100;
    }

    let rorLow: number | null = null;
    let rorHigh: number | null = null;
    if (bankroll && bankroll > 0) {
      const meanLowDollars = meanLow * displayUnitSize;
      const meanHighDollars = meanHigh * displayUnitSize;
      const varianceLowDollars = varianceLow * displayUnitSize * displayUnitSize;
      const varianceHighDollars = varianceHigh * displayUnitSize * displayUnitSize;
      const rorAt = (m: number, v: number) => {
        if (m <= 0 || v <= 0) return 1;
        return clamp01(Math.exp((-2 * m * bankroll) / v));
      };
      rorLow = rorAt(meanHighDollars, varianceLowDollars);
      rorHigh = rorAt(meanLowDollars, varianceHighDollars);
    }

    const rorTripAt = (m: number, s: number, hands: number) => {
      if (hands <= 0 || !bankroll || s <= 0) return null;
      const denom = s * Math.sqrt(hands);
      const z1 = (-bankroll - m * hands) / denom;
      const z2 = (-bankroll + m * hands) / denom;
      const term1 = normalCdf(z1);
      const term2 = Math.exp((-2 * m * bankroll) / (s * s)) * normalCdf(z2);
      return clamp01(term1 + term2);
    };

    let rorTripLow: number | null = null;
    let rorTripHigh: number | null = null;
    if (bankroll && tripHands > 0) {
      rorTripLow = rorTripAt(meanHigh * displayUnitSize, sdLow * displayUnitSize, tripHands);
      rorTripHigh = rorTripAt(meanLow * displayUnitSize, sdHigh * displayUnitSize, tripHands);
    }

    return {
      meanLow,
      meanHigh,
      sdLow,
      sdHigh,
      ev100: { low: meanLow * 100, high: meanHigh * 100 },
      evRound: { low: meanLow, high: meanHigh },
      sd100: { low: sdLow * 10, high: sdHigh * 10 },
      winRateUnits: { low: meanLow * handsPerHour, high: meanHigh * handsPerHour },
      winRateDollars: { low: meanLow * handsPerHour * displayUnitSize, high: meanHigh * handsPerHour * displayUnitSize },
      winLossPct: { low: winLossLow, high: winLossHigh },
      di: { low: diLow, high: diHigh },
      score: { low: scoreLow, high: scoreHigh },
      n0: { low: n0Low, high: n0High },
      ror: { low: rorLow, high: rorHigh },
      rorTrip: { low: rorTripLow, high: rorTripHigh },
    };
  }, [evPer100Units, stdevPer100Units, roundsForCi, handsPerHour, avgInitialBetUnits, bankroll, displayUnitSize, tripHands]);

  const precisionEstimate = useMemo(() => {
    if (!ciMetrics?.ev100 || evPer100Units === null) return null;
    if (!roundsForCi || roundsForCi <= 0) return null;
    const halfWidthUnits = Math.abs(ciMetrics.ev100.high - ciMetrics.ev100.low) / 2;
    const targetHalfUnits = precisionAbsolute;
    if (targetHalfUnits <= 0) return null;
    const factor = Math.pow(halfWidthUnits / targetHalfUnits, 2);
    const targetTotal = Math.max(Math.ceil(roundsForCi * factor), precisionMinHands);
    const additional = Math.max(0, targetTotal - roundsForCi);
    return {
      current: roundsForCi,
      halfWidthUnits,
      targetHalfUnits,
      targetTotal,
      additional,
    };
  }, [ciMetrics, evPer100Units, roundsForCi, precisionAbsolute, precisionMinHands]);

  const ciWarning = useMemo(() => {
    if (!precisionEstimate || !ciMetrics || evPer100Units === null) return null;

    const halfWidth = precisionEstimate.halfWidthUnits;
    const evAbs = Math.abs(evPer100Units);

    if (evAbs === 0) {
      return {
        level: "high",
        message: "EV is near zero - CI cannot be meaningfully compared",
        badge: "Uncertain",
      };
    }

    const relativeWidth = (halfWidth / evAbs) * 100;

    if (relativeWidth > 100) {
      return {
        level: "high",
        message: `CI is ${relativeWidth.toFixed(0)}% of estimate - results very uncertain. Run many more hands.`,
        badge: "Very Wide CI",
      };
    } else if (relativeWidth > 50) {
      return {
        level: "medium",
        message: `CI is ${relativeWidth.toFixed(0)}% of estimate - run more hands for better confidence.`,
        badge: "Wide CI",
      };
    } else if (relativeWidth > 20) {
      return {
        level: "low",
        message: `CI is ${relativeWidth.toFixed(0)}% of estimate - reasonable precision.`,
        badge: "Moderate CI",
      };
    } else {
      return {
        level: "good",
        message: `CI is ${relativeWidth.toFixed(0)}% of estimate - high confidence!`,
        badge: "Good",
      };
    }
  }, [precisionEstimate, ciMetrics, evPer100Units]);

  useEffect(() => {
    if (!autoPrecisionActive) return;
    if (status === "running") return;
    if (!result) return;
    if (!precisionEstimate) {
      setAutoPrecisionActive(false);
      return;
    }
    const currentTotal = roundsForCi;
    const addToMin = Math.max(precisionMinHands - currentTotal, 0);
    const addToTarget = precisionEstimate.additional;
    const addHands = currentTotal < precisionMinHands ? addToMin : addToTarget;
    if (addHands <= 0) {
      setAutoPrecisionActive(false);
      return;
    }
    handleAppendHands(addHands);
  }, [autoPrecisionActive, status, result, precisionEstimate, roundsForCi, precisionMinHands]);

  const riskInputs = useMemo(() => {
    if (evPer100DisplayDollars === null || stdevPer100DisplayDollars === null) return null;
    const meanPerHand = evPer100DisplayDollars / 100;
    const stdevPerHand = stdevPer100DisplayDollars / 10;
    if (stdevPerHand <= 0) return null;
    return {
      meanPerHand,
      stdevPerHand,
      variancePerHand: stdevPerHand * stdevPerHand,
      bankroll: bankroll ?? null,
    };
  }, [evPer100DisplayDollars, stdevPer100DisplayDollars, bankroll]);

  const rorSimple = useMemo(() => {
    if (!riskInputs) return null;
    const { meanPerHand, variancePerHand, bankroll } = riskInputs;
    if (bankroll === null) return null;
    if (meanPerHand <= 0) return 1;
    if (variancePerHand <= 0) return 0;
    return clamp01(Math.exp((-2 * meanPerHand * bankroll) / variancePerHand));
  }, [riskInputs]);

  const rorTrip = useMemo(() => {
    if (!riskInputs) return null;
    if (!tripHands || tripHands <= 0) return null;
    const { meanPerHand, stdevPerHand, bankroll } = riskInputs;
    if (bankroll === null) return null;
    const sigma = stdevPerHand;
    if (sigma <= 0) return null;
    const sqrtT = Math.sqrt(tripHands);
    const denom = sigma * sqrtT;
    const z1 = (-bankroll - meanPerHand * tripHands) / denom;
    const z2 = (-bankroll + meanPerHand * tripHands) / denom;
    const term1 = normalCdf(z1);
    const term2 = Math.exp((-2 * meanPerHand * bankroll) / (sigma * sigma)) * normalCdf(z2);
    return clamp01(term1 + term2);
  }, [riskInputs, tripHands]);

  const primaryRor = rorSimple ?? result?.ror ?? null;

  // Live computed metrics (update during simulation)
  const liveN0 = useMemo(() => {
    if (evPer100Units === null || stdevPer100Units === null) return null;
    const mean = evPer100Units / 100;
    const variance = Math.pow(stdevPer100Units / 10, 2);
    if (mean === 0) return null;
    return variance / (mean * mean);
  }, [evPer100Units, stdevPer100Units]);

  const liveScore = useMemo(() => {
    if (evPer100Units === null || stdevPer100Units === null) return null;
    const variance = Math.pow(stdevPer100Units / 10, 2);
    if (variance === 0) return null;
    return 100 * Math.pow(evPer100Units / 100, 2) / variance;
  }, [evPer100Units, stdevPer100Units]);

  const liveHoursPlayed = useMemo(() => {
    const rounds = progressHandsDone > 0 ? progressHandsDone : (result ? parseRoundsFromResult(result) : 0);
    if (!rounds || handsPerHour <= 0) return null;
    return rounds / handsPerHour;
  }, [progressHandsDone, result, handsPerHour]);

  const liveRorDetail = useMemo(() => {
    if (!riskInputs) return null;
    const { meanPerHand, stdevPerHand, variancePerHand, bankroll: br } = riskInputs;

    // Lifetime/Trip RoR require an actual bankroll value. When bankroll is not set,
    // we still show derived values like "Bankroll for 5% RoR" and N0.
    let adjustedRor: number | null = null;
    if (br !== null) {
      if (variancePerHand > 0) {
        adjustedRor = meanPerHand <= 0 ? 1 : clamp01(Math.exp((-2 * meanPerHand * br) / variancePerHand));
      }
    }

    // Trip RoR
    const tripHrs = tripHours ?? 4;
    const tripHandsCalc = tripHrs * handsPerHour;
    let tripRor: number | null = null;
    if (br !== null && tripHandsCalc > 0 && stdevPerHand > 0) {
      const sqrtT = Math.sqrt(tripHandsCalc);
      const denom = stdevPerHand * sqrtT;
      const z1 = (-br - meanPerHand * tripHandsCalc) / denom;
      const z2 = (-br + meanPerHand * tripHandsCalc) / denom;
      tripRor = clamp01(normalCdf(z1) + Math.exp((-2 * meanPerHand * br) / (stdevPerHand * stdevPerHand)) * normalCdf(z2));
    }

    // Required bankrolls
    const calcBankrollForRor = (targetRor: number): number => {
      if (targetRor <= 0 || targetRor >= 1) return 0;
      return (-Math.log(targetRor) * variancePerHand) / (2 * meanPerHand);
    };
    const reqBankroll5pct = meanPerHand > 0 && variancePerHand > 0 ? calcBankrollForRor(0.05) : null;
    const reqBankroll1pct = meanPerHand > 0 && variancePerHand > 0 ? calcBankrollForRor(0.01) : null;

    // N0
    const n0 = meanPerHand !== 0 && variancePerHand > 0 ? variancePerHand / (meanPerHand * meanPerHand) : Infinity;

    return {
      adjusted_ror: adjustedRor,
      trip_ror: tripRor,
      trip_hours: tripHrs,
      required_bankroll_5pct: reqBankroll5pct,
      required_bankroll_1pct: reqBankroll1pct,
      n0_hands: n0,
    };
  }, [riskInputs, tripHours, handsPerHour]);

  // Use live values when available, fall back to result
  const displayN0 = liveN0 ?? result?.n0_hands ?? null;
  const displayScore = liveScore ?? result?.score ?? null;
  const displayHoursPlayed = liveHoursPlayed ?? result?.hours_played ?? null;
  const displayRorDetail = liveRorDetail ?? result?.ror_detail ?? null;
  // Use progressHandsDone during running, otherwise use result's total
  const displayRounds = (status === "running" && progressHandsDone > 0)
    ? progressHandsDone
    : (result ? parseRoundsFromResult(result) : null);

  const tcSummary = useMemo(() => {
    const table = result?.tc_table;
    if (!table || table.length === 0) return null;
    const buckets = [
      { label: "<=-2", test: (tc: number) => tc <= -2, tc_value: -2 },
      { label: "-1", test: (tc: number) => tc === -1, tc_value: -1 },
      { label: "0", test: (tc: number) => tc === 0, tc_value: 0 },
      { label: "1", test: (tc: number) => tc === 1, tc_value: 1 },
      { label: "2", test: (tc: number) => tc === 2, tc_value: 2 },
      { label: "3", test: (tc: number) => tc === 3, tc_value: 3 },
      { label: "4", test: (tc: number) => tc === 4, tc_value: 4 },
      { label: "5", test: (tc: number) => tc === 5, tc_value: 5 },
      { label: "6", test: (tc: number) => tc === 6, tc_value: 6 },
      { label: "7", test: (tc: number) => tc === 7, tc_value: 7 },
      { label: "8", test: (tc: number) => tc === 8, tc_value: 8 },
      { label: "9", test: (tc: number) => tc === 9, tc_value: 9 },
      { label: "10", test: (tc: number) => tc === 10, tc_value: 10 },
      { label: "11", test: (tc: number) => tc === 11, tc_value: 11 },
      { label: ">=12", test: (tc: number) => tc >= 12, tc_value: 12 },
    ];

    const entries = table.map((entry) => {
      const nIba = entry.n_iba ?? entry.n;
      const nTotal = entry.n;
      const nZero = entry.n_zero ?? Math.max(nTotal - nIba, 0);
      const mean = nIba > 0 ? entry.ev_pct / 100 : 0;
      const variance = nIba > 0 ? entry.variance : 0;
      const sumX = mean * nIba;
      const sumX2 = (variance + mean * mean) * nIba;
      return { ...entry, n_iba: nIba, n_total: nTotal, n_zero: nZero, sumX, sumX2 };
    });

    const total = entries.reduce((sum, entry) => sum + entry.n_total, 0);
    if (total === 0) return null;

    const bankrollUnits = riskBankrollUnits ?? null;
    const maxUnits = Math.max(0, optMaxUnits);
    const increment = optBetIncrement > 0 ? optBetIncrement : 1;
    const kelly = Math.max(0, optKellyFraction);
    const minUnits = betRamp?.steps?.length ? Math.min(...betRamp.steps.map((step) => step.units)) : 1;

    const rows = buckets.map((bucket) => {
      const bucketEntries = entries.filter((entry) => bucket.test(entry.tc));
      const n_total = bucketEntries.reduce((sum, entry) => sum + entry.n_total, 0);
      const n_iba = bucketEntries.reduce((sum, entry) => sum + entry.n_iba, 0);
      const n_zero = bucketEntries.reduce((sum, entry) => sum + entry.n_zero, 0);
      const sumX = bucketEntries.reduce((sum, entry) => sum + entry.sumX, 0);
      const sumX2 = bucketEntries.reduce((sum, entry) => sum + entry.sumX2, 0);
      const edgeKnown = n_iba > 0;
      const mean = edgeKnown ? sumX / n_iba : 0;
      const variance = edgeKnown ? Math.max(sumX2 / n_iba - mean * mean, 0) : 0;
      const se = edgeKnown ? Math.sqrt(variance / n_iba) : 0;
      let optExact: number | null = null;
      let optChips: number | null = null;
      const applyPolicy = () => {
        if (negativeEdgePolicy === "hide") {
          optExact = null;
          optChips = null;
          return;
        }
        if (negativeEdgePolicy === "min_bet") {
          optExact = minUnits;
          optChips = minUnits;
          return;
        }
        optExact = 0;
        optChips = 0;
      };

      if (bankrollUnits !== null && edgeKnown && variance > 0 && mean > 0) {
        optExact = (bankrollUnits * kelly * mean) / variance;
        optExact = Math.max(0, Math.min(optExact, maxUnits));
        if (optExact > 0 && optExact < minUnits) optExact = minUnits;
        optChips = Math.round(optExact / increment) * increment;
        optChips = Math.max(0, Math.min(optChips, maxUnits));
        if (optChips > 0 && optChips < minUnits) optChips = minUnits;
      } else {
        applyPolicy();
      }
      return {
        label: bucket.label,
        tc_value: bucket.tc_value,
        n_total,
        n_iba,
        n_zero,
        freq: n_total / total,
        ev_pct: mean * 100,
        ev_se_pct: se * 100,
        variance,
        opt_exact: optExact,
        opt_chips: optChips,
        edge_known: edgeKnown,
      };
    });

    if (optSimplify) {
      let prev = 0;
      rows.forEach((row) => {
        if (row.opt_chips === null) return;
        if (row.opt_chips < prev) row.opt_chips = prev;
        prev = row.opt_chips;
      });
    }

    return { rows, total };
  }, [result, riskBankrollUnits, optMaxUnits, optBetIncrement, optKellyFraction, optSimplify, betRamp, negativeEdgePolicy]);

  const optimalChart = useMemo(() => {
    if (!tcSummary || !betRamp) return null;
    const rows = tcSummary.rows;
    if (rows.length === 0) return null;
    const steps = betRamp.steps.slice().sort((a, b) => a.tc_floor - b.tc_floor);
    const rampUnitsForTc = (tc: number) => {
      const wongOut = betRamp.wong_out_below ?? null;
      if (wongOut !== null && tc < wongOut) return 0;
      let units = steps[0]?.units ?? 0;
      for (const step of steps) {
        if (tc >= step.tc_floor) units = step.units;
        else break;
      }
      return units;
    };

    const data = rows.map((row) => ({
      ...row,
      ramp_units: rampUnitsForTc(row.tc_value),
    }));

    const width = 720;
    const height = 180;
    const margin = { top: 16, right: 16, bottom: 28, left: 40 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const bucketWidth = plotWidth / data.length;

    const maxUnits = Math.max(
      ...data.map((row) => Math.max(row.ramp_units ?? 0, row.opt_chips ?? 0, row.opt_exact ?? 0)),
      1
    );
    const yMax = maxUnits * 1.15;
    const yMin = 0;

    const scaleXCenter = (index: number) => margin.left + bucketWidth * (index + 0.5);
    const scaleXLeft = (index: number) => margin.left + bucketWidth * index;
    const scaleY = (value: number) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

    const buildStepPath = (values: number[]) => {
      if (!values.length) return "";
      let d = `M${scaleXLeft(0)},${scaleY(values[0])}`;
      values.forEach((value, idx) => {
        const right = scaleXLeft(idx) + bucketWidth;
        d += ` H${right}`;
        if (idx < values.length - 1) {
          d += ` V${scaleY(values[idx + 1])}`;
        }
      });
      return d;
    };

    const rampPath = buildStepPath(data.map((row) => row.ramp_units ?? 0));
    const chipsPath = buildStepPath(data.map((row) => row.opt_chips ?? 0));
    const exactPath = data.map((row, idx) => `${idx === 0 ? "M" : "L"}${scaleXCenter(idx)},${scaleY(row.opt_exact ?? 0)}`).join(" ");

    const maxAbsEdge = Math.max(...data.map((row) => Math.abs(row.ev_pct ?? 0)), 0.1);

    return {
      width,
      height,
      margin,
      plotWidth,
      plotHeight,
      bucketWidth,
      data,
      rampPath,
      chipsPath,
      exactPath,
      scaleXCenter,
      scaleXLeft,
      scaleY,
      yMax,
      maxAbsEdge,
      showExactLine,
    };
  }, [tcSummary, betRamp, showExactLine]);

  const sessionChart = useMemo(() => {
    if (evPer100Units === null || stdevPer100Units === null) return null;
    if (!tripHours || !tripHandsPerHour) return null;

    const steps = Math.max(20, Math.min(tripSteps, 400));
    const hours = Math.max(0.5, Math.min(tripHours, 72));
    const hph = Math.max(30, Math.min(tripHandsPerHour, 300));
    const totalHands = hours * hph;
    const stepHands = totalHands / steps;
    const meanPerHandUnits = evPer100Units / 100;
    const stdevPerHandUnits = stdevPer100Units / 10;
    const meanPerHand = showUnits ? meanPerHandUnits : meanPerHandUnits * displayUnitSize;
    const stdevPerHand = showUnits ? stdevPerHandUnits : stdevPerHandUnits * displayUnitSize;
    const base = startBankrollUnits !== null ? startBankrollUnits * (showUnits ? 1 : displayUnitSize) : 0;

    const mulberry32 = (seedValue: number) => {
      let t = seedValue;
      return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), t | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };

    const randn = (rng: () => number) => {
      let u = 0;
      let v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    const mean: number[] = [];
    const sd: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    const lowerInner: number[] = [];
    const upperInner: number[] = [];

    const zScores = {
      p5: -1.64485,
      p25: -0.67449,
      p50: 0,
      p75: 0.67449,
      p95: 1.64485,
    };

    for (let i = 0; i <= steps; i += 1) {
      const handsAtStep = i * stepHands;
      const meanValue = base + handsAtStep * meanPerHand;
      const sdValue = Math.sqrt(Math.max(handsAtStep, 0)) * stdevPerHand;
      mean.push(meanValue);
      sd.push(sdValue);
      if (bandMode === "sigma") {
        const band = sigmaK * sdValue;
        lower.push(meanValue - band);
        upper.push(meanValue + band);
      } else {
        lower.push(meanValue + zScores.p5 * sdValue);
        upper.push(meanValue + zScores.p95 * sdValue);
        lowerInner.push(meanValue + zScores.p25 * sdValue);
        upperInner.push(meanValue + zScores.p75 * sdValue);
      }
    }

    const lines: number[][] = [];
    for (let s = 0; s < Math.max(1, Math.min(pathCount, 50)); s += 1) {
      const rng = mulberry32(seed + s * 9973);
      const values: number[] = [];
      let cumulative = 0;
      for (let i = 0; i <= steps; i += 1) {
        if (i > 0) {
          const increment = stepHands * meanPerHand + randn(rng) * stdevPerHand * Math.sqrt(stepHands);
          cumulative += increment;
        }
        values.push(base + cumulative);
      }
      lines.push(values);
    }

    return {
      steps,
      hours,
      hph,
      totalHands,
      mean,
      lower,
      upper,
      lowerInner,
      upperInner,
      lines,
      base,
    };
  }, [
    evPer100Units,
    stdevPer100Units,
    tripHours,
    tripHandsPerHour,
    tripSteps,
    pathCount,
    sigmaK,
    bandMode,
    showUnits,
    displayUnitSize,
    seed,
    startBankrollUnits,
  ]);

  const sessionSvg = useMemo(() => {
    if (!sessionChart) return null;
    const width = 900;
    const height = 260;
    const margin = { top: 20, right: 20, bottom: 40, left: 52 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const extraLines: number[] = [0];
    if (stopLossUnits !== null) extraLines.push(stopLossUnits * (showUnits ? 1 : displayUnitSize));
    if (winGoalUnits !== null) extraLines.push(winGoalUnits * (showUnits ? 1 : displayUnitSize));

    const allValues = [
      ...sessionChart.mean,
      ...sessionChart.lower,
      ...sessionChart.upper,
      ...sessionChart.lines.flat(),
      ...sessionChart.lowerInner,
      ...sessionChart.upperInner,
      ...extraLines,
    ];
    let minY = Math.min(...allValues);
    let maxY = Math.max(...allValues);
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }
    const span = maxY - minY;
    minY -= span * 0.1;
    maxY += span * 0.1;

    const scaleX = (i: number) => margin.left + (i / sessionChart.steps) * plotWidth;
    const scaleY = (value: number) => margin.top + (1 - (value - minY) / (maxY - minY)) * plotHeight;

    const buildPath = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(v)}`).join(" ");

    const bandPath = (lower: number[], upper: number[]) => {
      const lowerPoints = lower.map((v, i) => `${scaleX(i)},${scaleY(v)}`);
      const upperPoints = upper.map((v, i) => `${scaleX(i)},${scaleY(v)}`).reverse();
      return `M${lowerPoints[0]} L${lowerPoints.slice(1).join(" L")} L${upperPoints.join(" L")} Z`;
    };

    const tickCount = 5;
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const hours = (sessionChart.hours / (tickCount - 1)) * i;
      const x = margin.left + (hours / sessionChart.hours) * plotWidth;
      return { hours, hands: hours * sessionChart.hph, x };
    });

    const yTicks = Array.from({ length: tickCount }, (_, i) => {
      const value = minY + (span / (tickCount - 1)) * i;
      return { value, y: scaleY(value) };
    });

    const zeroY = scaleY(0);

    return {
      width,
      height,
      margin,
      scaleX,
      scaleY,
      minY,
      maxY,
      plotWidth,
      plotHeight,
      xTicks,
      yTicks,
      zeroY,
      meanPath: buildPath(sessionChart.mean),
      bandOuter: bandPath(sessionChart.lower, sessionChart.upper),
      bandInner: sessionChart.lowerInner.length ? bandPath(sessionChart.lowerInner, sessionChart.upperInner) : null,
      linePaths: sessionChart.lines.map(buildPath),
    };
  }, [sessionChart, stopLossUnits, winGoalUnits, showUnits, displayUnitSize]);

  return (
    <div className={`app ${currentPage === "training" ? "app-training" : ""}`}>
      {currentPage === "simulator" && (
      <header className="topbar">
        <div className="scenario">
          <input
            className="scenario-input"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
          />
          {isDirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
        <div className="top-actions">
          <button className="btn primary" onClick={handleRun} disabled={!scenarioConfig || status === "running"}>
            Run
          </button>
          <button className="btn" onClick={handleStop} disabled={status !== "running"}>
            Stop
          </button>
          <div className="hands-controls">
            <div className="hands-presets">
              {handPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`hand-btn ${hands === preset ? "active" : ""}`}
                  aria-pressed={hands === preset}
                  onClick={() => setHands(preset)}
                  disabled={status === "running"}
                >
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>
            <div className="hands-custom">
              <input
                className="hands-input"
                type="text"
                value={customHandsInput}
                onChange={(e) => setCustomHandsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const parsed = parseHandsInput(customHandsInput);
                  if (parsed) setHands(parsed);
                }}
                placeholder="Custom hands (e.g., 500000)"
                disabled={status === "running"}
              />
              <button
                className="btn"
                onClick={() => {
                  const parsed = parseHandsInput(customHandsInput);
                  if (parsed) setHands(parsed);
                }}
                disabled={status === "running"}
              >
                Apply
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  const parsed = parseHandsInput(customHandsInput);
                  if (parsed) handleAppendHands(parsed);
                }}
                disabled={status === "running" || !result}
                title={result ? "Append additional hands to the current results" : "Run a simulation first"}
              >
                + Add
              </button>
              <button
                className={`btn ${autoPrecisionActive ? "primary" : ""}`}
                onClick={handleContinueToPrecision}
                disabled={status === "running"}
                title="Run until target precision is reached (configure in sidebar)"
              >
                {autoPrecisionActive ? "Precision..." : "Precision"}
              </button>
            </div>
          </div>
          <button className="btn" onClick={() => setScenarioName(`${scenarioName} Copy`)}>
            Duplicate
          </button>
          <button className="btn" onClick={() => { setPresetType("scenario"); setPresetName(scenarioName); setShowSavePreset(true); }}>
            Save preset
          </button>
          <button className="btn" onClick={() => setShowLoadPreset(true)}>
            Load preset
          </button>
          <button className="btn" onClick={handleExport}>
            Export JSON
          </button>
          <button
            className="btn training-mode-btn"
            onClick={() => setCurrentPage("training")}
          >
            Training Mode
          </button>
        </div>
        <label className="toggle">
          Show units
          <input type="checkbox" checked={showUnits} onChange={(e) => setShowUnits(e.target.checked)} />
        </label>
        <div className={`status-chip ${status}`}>{statusLabel()}</div>
      </header>
      )}

      {currentPage === "training" ? (
        <TrainingPage
          onBack={() => setCurrentPage("simulator")}
          numDecks={rules?.decks ?? 6}
          penetration={rules?.penetration ?? 0.75}
          hitSoft17={rules?.hit_soft_17 ?? true}
          allowSurrender={rules?.surrender ?? false}
          doubleAfterSplit={rules?.double_after_split ?? true}
          doubleAnyTwo={rules?.double_any_two ?? true}
          resplitAces={rules?.resplit_aces ?? false}
          hitSplitAces={rules?.hit_split_aces ?? false}
          maxSplits={rules?.max_splits ?? 3}
          blackjackPayout={rules?.blackjack_payout ?? 1.5}
          tcEstimationMethod={
            tcEstStep === 0 ? 'perfect' :
            tcEstRounding === 'floor' ? 'floor' :
            (tcEstRounding === 'nearest' && tcEstStep === 0.5) ? 'halfDeck' :
            'floor'
          }
        />
      ) : (
        <>
      {isStale && (
        <div className="banner">
          Results are from a previous configuration. {" "}
          <button className="link" onClick={handleRun}>
            Re-run
          </button>
        </div>
      )}

      {isAppending && (
        <div className="banner">
          Appending additional hands… current results will update when the new batch completes.
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      <div className="layout">
        <aside className="sidebar">
          <div className="card">
            <div className="card-title">Rules</div>
            {!rules ? (
              <div className="muted">Loading rules...</div>
            ) : (
              <div className="form-grid">
                <label>
                  Rules preset
                  <select
                    value={rulesPreset}
                    onChange={(e) => {
                      const preset = e.target.value;
                      setRulesPreset(preset);
                      applyRulesPreset(preset);
                    }}
                  >
                    <option value="default">6D H17 DAS (Midwest)</option>
                    <option value="s17">6D S17 DAS (Midwest)</option>
                  </select>
                </label>
                <label>
                  Decks
                  <input type="number" min={1} max={8} value={rules.decks} onChange={(e) => updateRule("decks", Number(e.target.value))} />
                </label>
                <label>
                  Penetration
                  <div className="penetration-row">
                    <input
                      type="range"
                      min={0.5}
                      max={0.95}
                      step={0.01}
                      value={rules.penetration}
                      onChange={(e) => updateRule("penetration", normalizePenetration(Number(e.target.value)))}
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={rules.penetration}
                      onChange={(e) => updateRule("penetration", normalizePenetration(Number(e.target.value)))}
                    />
                  </div>
                </label>
                <label>
                  Cut decks (optional)
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={rules.decks - 0.1}
                    value={cutDecks ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setCutDecks(val);
                      if (val !== null) updatePenetrationFromCut(val);
                    }}
                  />
                </label>
                <label>
                  H17
                  <input type="checkbox" checked={rules.hit_soft_17} onChange={(e) => updateRule("hit_soft_17", e.target.checked)} />
                </label>
                <label>
                  Dealer peeks
                  <input type="checkbox" checked={rules.dealer_peeks} onChange={(e) => updateRule("dealer_peeks", e.target.checked)} />
                </label>
                <label>
                  BJ payout
                  <input type="number" step="0.1" min={1.1} value={rules.blackjack_payout} onChange={(e) => updateRule("blackjack_payout", Number(e.target.value))} />
                </label>
                <label>
                  Double any two
                  <input type="checkbox" checked={rules.double_any_two} onChange={(e) => updateRule("double_any_two", e.target.checked)} />
                </label>
                <label>
                  Double after split
                  <input type="checkbox" checked={rules.double_after_split} onChange={(e) => updateRule("double_after_split", e.target.checked)} />
                </label>
                <label>
                  Surrender
                  <input type="checkbox" checked={rules.surrender} onChange={(e) => updateRule("surrender", e.target.checked)} />
                </label>
                <label>
                  Resplit aces
                  <input type="checkbox" checked={rules.resplit_aces} onChange={(e) => updateRule("resplit_aces", e.target.checked)} />
                </label>
                <label>
                  Max splits
                  <input type="number" min={0} max={4} value={rules.max_splits} onChange={(e) => updateRule("max_splits", Number(e.target.value))} />
                </label>
                <label>
                  Hit split aces
                  <input type="checkbox" checked={rules.hit_split_aces} onChange={(e) => updateRule("hit_split_aces", e.target.checked)} />
                </label>
              </div>
            )}
            {rules && (
              <details className="strategy-preview">
                <summary className="card-title">Basic Strategy (preview)</summary>
                <div className="strategy-section">
                  <div className="strategy-title">Pair Splitting</div>
                  <table className="strategy-table">
                    <thead>
                      <tr>
                        <th>Pair</th>
                        {dealerUpcards.map((up) => (
                          <th key={up}>{up}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pairRows.map((rank) => (
                        <tr key={rank}>
                          <td>{rank},{rank}</td>
                          {dealerUpcards.map((up) => (
                            <td key={up} className={pairClass(pairCell(rank, up))}>
                              {pairCell(rank, up)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="legend">Y = split, Y/N = split only with DAS, N = do not split</div>
                </div>

                <div className="strategy-section">
                  <div className="strategy-title">Soft Totals</div>
                  <table className="strategy-table">
                    <thead>
                      <tr>
                        <th>Hand</th>
                        {dealerUpcards.map((up) => (
                          <th key={up}>{up}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {softRows.map((row) => (
                        <tr key={row}>
                          <td>{row}</td>
                          {dealerUpcards.map((up) => (
                            <td key={up} className={actionClass(softCell(row, up))}>
                              {softCell(row, up)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="legend">H = hit, S = stand, D = double else hit, Ds = double else stand</div>
                </div>

                <div className="strategy-section">
                  <div className="strategy-title">Hard Totals</div>
                  <table className="strategy-table">
                    <thead>
                      <tr>
                        <th>Total</th>
                        {dealerUpcards.map((up) => (
                          <th key={up}>{up}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hardRows.map((row) => (
                        <tr key={row}>
                          <td>{row}</td>
                          {dealerUpcards.map((up) => (
                            <td key={up} className={actionClass(hardCell(row, up))}>
                              {hardCell(row, up)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="strategy-section">
                  <div className="strategy-title">Late Surrender</div>
                  <table className="strategy-table">
                    <thead>
                      <tr>
                        <th>Total</th>
                        {dealerUpcards.map((up) => (
                          <th key={up}>{up}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[16, 15].map((row) => (
                        <tr key={row}>
                          <td>{row}</td>
                          {dealerUpcards.map((up) => (
                            <td key={up} className={actionClass(surrenderCell(row, up))}>
                              {surrenderCell(row, up)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="legend">SUR = surrender (late surrender)</div>
                </div>
              </details>
            )}
          </div>

          <div className="card">
            <div className="card-title">Counting & TC Estimation</div>
            <div className="form-grid">
              <label>
                Count system
                <input type="text" value="Hi-Lo" disabled />
              </label>
              <label>
                TC mode
                <select value={tcEstStep} onChange={(e) => setTcEstStep(Number(e.target.value))}>
                  {tcModes.map((m) => (
                    <option key={m.label} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rounding
                <select value={tcEstRounding} onChange={(e) => setTcEstRounding(e.target.value)}>
                  {tcRounding.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Use estimated TC for betting
                <input
                  type="checkbox"
                  checked={useEstForBet}
                  onChange={(e) => setUseEstForBet(e.target.checked)}
                  disabled={tcEstStep === 0}
                />
              </label>
              <label>
                Use estimated TC for deviations
                <input
                  type="checkbox"
                  checked={useEstForDev}
                  onChange={(e) => setUseEstForDev(e.target.checked)}
                  disabled={tcEstStep === 0}
                />
              </label>
            </div>
          </div>

          <div className="card">
          <div className="card-title">Bet Ramp</div>
          {!betRamp ? (
            <div className="muted">Loading ramp...</div>
          ) : (
            <>
              <label>
                Ramp preset
                <select
                  value={rampPresetId}
                  onChange={(e) => applyRampPreset(e.target.value)}
                >
                  <option value="">Select preset...</option>
                  <optgroup label="Library">
                    {builtInRampPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="My presets">
                    {rampPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <div className="inline-actions">
                <button
                  className="btn ghost"
                  onClick={() => {
                    setPresetType("ramp");
                    setPresetName("Ramp preset");
                    setShowSavePreset(true);
                  }}
                >
                  Save ramp preset
                </button>
                <button className="btn ghost" onClick={() => importPresetFromFile("ramp")}>
                  Import ramp JSON
                </button>
                <button className="btn ghost" onClick={handleExportRamp}>
                  Export ramp JSON
                </button>
                <button
                  className="btn ghost"
                  disabled={!rampPresetId}
                  onClick={() => {
                    const preset = allRampPresets.find((p) => p.id === rampPresetId);
                    if (preset) duplicatePreset(preset);
                  }}
                >
                  Duplicate
                </button>
                <button
                  className="btn ghost"
                  disabled={!rampPresetId || rampPresetId.startsWith("builtin:")}
                  onClick={() => {
                    const preset = rampPresets.find((p) => p.id === rampPresetId);
                    if (preset) renamePreset(preset);
                  }}
                >
                  Rename
                </button>
                <button
                  className="btn ghost"
                  disabled={!rampPresetId || rampPresetId.startsWith("builtin:")}
                  onClick={() => {
                    const preset = rampPresets.find((p) => p.id === rampPresetId);
                    if (preset) deletePreset(preset);
                  }}
                >
                  Delete
                </button>
              </div>
              <label className="toggle">
                Bet input mode
                <select value={useCashBets ? "cash" : "units"} onChange={(e) => setUseCashBets(e.target.value === "cash")}>
                  <option value="units">Units</option>
                  <option value="cash">Dollars</option>
                  </select>
                </label>
                <label>
                  Wong out below TC
                  <input type="number" value={betRamp.wong_out_below ?? 0} onChange={(e) => setBetRamp({ ...betRamp, wong_out_below: Number(e.target.value) })} />
                </label>
                <label>
                  Wong-out policy
                  <select
                    value={betRamp.wong_out_policy ?? "anytime"}
                    onChange={(e) => setBetRamp({ ...betRamp, wong_out_policy: e.target.value })}
                  >
                    <option value="anytime">Anytime</option>
                    <option value="after_loss_only">After loss only</option>
                    <option value="after_hand_only">After hand only</option>
                  </select>
                </label>
                <div className="ramp-table">
                  <div className="ramp-header">
                    <span>TC</span>
                    <span>{useCashBets ? "Bet ($)" : "Units"}</span>
                    <span></span>
                  </div>
                  {betRamp.steps.map((step, idx) => (
                    <div className="ramp-row" key={`${step.tc_floor}-${idx}`}>
                      <input type="number" value={step.tc_floor} onChange={(e) => updateRampEntry(idx, "tc_floor", Number(e.target.value))} />
                      <input
                        type="number"
                        step="0.5"
                        value={useCashBets ? step.units * unitSize : step.units}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const units = useCashBets ? val / unitSize : val;
                          updateRampEntry(idx, "units", units);
                        }}
                      />
                      <button className="btn ghost" onClick={() => removeRampEntry(idx)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button className="btn ghost" onClick={addRampEntry}>
                    Add step
                  </button>
                </div>
                <div className="ramp-chart">
                  <div className="chart-title">Ramp preview</div>
                  <div className="mini-chart">
                    {Array.from(
                      new Map(
                        betRamp.steps
                          .slice()
                          .sort((a, b) => a.tc_floor - b.tc_floor)
                          .map((step) => [step.tc_floor, step])
                      ).values()
                    ).map((step) => (
                      <div
                        key={step.tc_floor}
                        className="mini-bar"
                        style={{ height: `${Math.min(step.units * 6, 100)}%` }}
                        title={`TC ${step.tc_floor}: ${step.units.toFixed(1)}u`}
                      />
                    ))}
                  </div>
                  {rampStats && (
                    <div className="muted">
                      Min bet: {rampStats.min.toFixed(1)}u | Max bet: {rampStats.max.toFixed(1)}u | Spread:{" "}
                      {rampStats.spread ? rampStats.spread.toFixed(1) + "x" : "n/a"}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">Simulation Settings</div>
            <div className="form-grid">
              <label>
                <span className="label-row">
                  Unit size ($)
                  <HelpIcon text="Base unit size used for bet ramp units and $ conversions." />
                </span>
                <input type="number" value={unitSize} onChange={(e) => setUnitSize(Number(e.target.value))} />
              </label>
              <label>
                <span className="label-row">
                  Bankroll ($)
                  <HelpIcon text="Shared bankroll used for RoR and optimal bet sizing." />
                </span>
                <input type="number" value={bankroll ?? ""} onChange={(e) => setBankroll(e.target.value ? Number(e.target.value) : null)} />
              </label>
              <label>
                <span className="label-row">
                  Hands
                  <HelpIcon text="Total rounds to simulate for this run." />
                </span>
                <input type="number" value={hands} onChange={(e) => setHands(Number(e.target.value))} />
              </label>
              <label>
                <span className="label-row">
                  Hands/hour
                  <HelpIcon text="Used to compute hours played and win rate per hour." />
                </span>
                <input type="number" value={handsPerHour} onChange={(e) => setHandsPerHour(Number(e.target.value))} />
              </label>
              <label>
                <span className="label-row">
                  Seed
                  <HelpIcon text="Random seed for reproducible simulations. Disabled when randomize is on." />
                </span>
                <div className="seed-row">
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    disabled={randomizeSeedEachRun}
                  />
                  <button className="btn ghost" type="button" onClick={randomizeSeed} disabled={randomizeSeedEachRun}>
                    Randomize
                  </button>
                </div>
              </label>
              <label className="toggle">
                <span className="label-row">
                  Randomize seed each run
                  <HelpIcon text="When enabled, each run uses a new random seed for independent samples." />
                </span>
                <input type="checkbox" checked={randomizeSeedEachRun} onChange={(e) => setRandomizeSeedEachRun(e.target.checked)} />
              </label>
              <label className="toggle">
                <span className="label-row">
                  Use multi-processing
                  <HelpIcon text="Use multiple CPU cores for faster simulations. Recommended for 100k+ hands." />
                </span>
                <input type="checkbox" checked={useMultiprocessing} onChange={(e) => setUseMultiprocessing(e.target.checked)} />
              </label>
              <label className="toggle">
                <span className="label-row">
                  Debug log
                  <HelpIcon text="Include the first N hands in the output for troubleshooting." />
                </span>
                <input type="checkbox" checked={debugLog} onChange={(e) => setDebugLog(e.target.checked)} />
              </label>
              {debugLog && (
                <label>
                  <span className="label-row">
                    Debug hands
                    <HelpIcon text="Number of hands to record in the debug log output." />
                  </span>
                  <input type="number" min={1} max={500} value={debugLogHands} onChange={(e) => setDebugLogHands(Number(e.target.value))} />
                </label>
              )}
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "12px" }}>
              <div className="card-title" style={{ margin: 0 }}>Precision Target</div>
              {ciWarning && <div className={`precision-badge status-${ciWarning.level}`}>{ciWarning.badge}</div>}
            </div>

            <div className="form-grid">
              <label>
                <span className="label-row">
                  Preset
                  <HelpIcon text="Choose a stopping target for EV/100 precision. You can override the numbers below." />
                </span>
                <select value={precisionPreset} onChange={(e) => setPrecisionPreset(e.target.value as keyof typeof precisionPresets)}>
                  {Object.entries(precisionPresets).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label-row">
                  Target (u/100)
                  <HelpIcon text="Stop when the 95% CI half-width is below this absolute unit value per 100 rounds." />
                </span>
                <input
                  type="number"
                  min={0.01}
                  step={0.05}
                  value={precisionAbsolute}
                  onChange={(e) => setPrecisionAbsolute(Number(e.target.value))}
                />
              </label>
              <label>
                <span className="label-row">
                  Min hands
                  <HelpIcon text="Minimum total rounds before auto-append targets can finish." />
                </span>
                <input
                  type="number"
                  min={100000}
                  step={100000}
                  value={precisionMinHands}
                  onChange={(e) => setPrecisionMinHands(Number(e.target.value))}
                />
              </label>
            </div>

            {precisionEstimate && (
              <div className="precision-visual">
                <div className="precision-labels">
                  <span>Current: {precisionEstimate.halfWidthUnits.toFixed(3)}u</span>
                  <span>Target: {precisionEstimate.targetHalfUnits.toFixed(3)}u</span>
                </div>
                <div className="precision-progress-bar">
                  <div
                    className="precision-progress-fill"
                    style={{
                      width: `${Math.min(100, (1 - precisionEstimate.additional / precisionEstimate.targetTotal) * 100)}%`,
                    }}
                  />
                </div>
                <div className={`precision-status status-${ciWarning?.level || "unknown"}`}>
                  {precisionEstimate.additional <= 0
                    ? "✅ Within target precision!"
                    : autoPrecisionActive
                    ? `Running... ${precisionEstimate.additional.toLocaleString()} hands remaining`
                    : ciWarning?.message || "Run more hands to reach target"}
                </div>
              </div>
            )}
            {!precisionEstimate && <div className="muted" style={{ textAlign: "center", padding: "8px" }}>Run a simulation to estimate precision.</div>}
          </div>

          <div className="card">
          <div className="card-title">Deviations</div>
          <div className="deviation-toolbar">
            <select value={deviationPresetId} onChange={(e) => applyDeviationPreset(e.target.value)}>
              <option value="">Select deviation preset...</option>
              {deviationPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <input placeholder="Search 16v10, surrender, insurance..." value={devSearch} onChange={(e) => setDevSearch(e.target.value)} />
            <select value={devFilter} onChange={(e) => setDevFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="hard">Hard</option>
              <option value="soft">Soft</option>
              <option value="pairs">Pairs</option>
              <option value="surrender">Surrender</option>
              <option value="insurance">Insurance</option>
            </select>
            <button className="btn ghost" onClick={loadPresetDeviations}>
              Load I18+Fab4
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setPresetType("deviations");
                setPresetName("Deviation preset");
                setShowSavePreset(true);
              }}
            >
              Save deviations preset
            </button>
            <button className="btn ghost" onClick={() => importPresetFromFile("deviations")}>
              Import deviations JSON
            </button>
            <button className="btn ghost" onClick={handleExportDeviations}>
              Export deviations JSON
            </button>
            <button
              className="btn ghost"
              disabled={!deviationPresetId}
              onClick={() => {
                const preset = deviationPresets.find((p) => p.id === deviationPresetId);
                if (preset) duplicatePreset(preset);
              }}
            >
              Duplicate
            </button>
            <button
              className="btn ghost"
              disabled={!deviationPresetId}
              onClick={() => {
                const preset = deviationPresets.find((p) => p.id === deviationPresetId);
                if (preset) renamePreset(preset);
              }}
            >
              Rename
            </button>
            <button
              className="btn ghost"
              disabled={!deviationPresetId}
              onClick={() => {
                const preset = deviationPresets.find((p) => p.id === deviationPresetId);
                if (preset) deletePreset(preset);
              }}
            >
              Delete
            </button>
          </div>
          {conflictCount > 0 && (
            <div className="banner error">
              {conflictCount} deviation conflicts detected (same hand/index with different actions). Last edit wins.
            </div>
          )}
            <div className="deviation-table">
              <div className="deviation-header">
                <span>Hand</span>
                <span>{"TC >="}</span>
                <span>Action</span>
                <span></span>
              </div>
              {filteredDeviations.map((dev, idx) => {
                const disabled = !rules?.surrender && dev.hand_key.includes("surrender");
                return (
                  <div key={`${dev.hand_key}-${idx}`} className={`deviation-row ${disabled ? "disabled" : ""}`}>
                    <input type="text" value={dev.hand_key} onChange={(e) => updateDeviation(idx, "hand_key", e.target.value)} />
                    <input type="number" value={dev.tc_floor} onChange={(e) => updateDeviation(idx, "tc_floor", Number(e.target.value))} />
                    <select value={dev.action} onChange={(e) => updateDeviation(idx, "action", e.target.value)}>
                      {actionOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <button className="btn ghost" onClick={() => removeDeviation(idx)}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            <button className="btn ghost" onClick={addDeviation}>
              Add deviation
            </button>
          </div>
        </aside>

        <main className="results">
          <div className="card status-card">
            <div className="status-row">
              <div>
                <div className="card-title">Run Status</div>
                <div className="muted">{statusLabel()}</div>
              </div>
              {progress && (
                <div className="progress">
                  <div
                    className="progress-bar"
                    style={{
                      width: `${Math.min(
                        (progressHandsTotal > 0 ? (progressHandsDone / progressHandsTotal) * 100 : progress.progress * 100),
                        100
                      )}%`,
                    }}
                  />
                  <div className="progress-label">
                    {progressHandsDone.toLocaleString()} / {progressHandsTotal.toLocaleString()} rounds
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card metrics">
            <div className="card-title">Primary Metrics</div>
            {!result && !progress?.ev_per_100_est ? (
              <div className="muted">Run a simulation to see results.</div>
            ) : (
              <>
                <div className="metric-grid">
                  <div className="metric">
                    <div className="label">EV / 100 rounds</div>
                    <div className="value">
                      {evPer100Units === null
                        ? "n/a"
                        : showUnits
                          ? evPer100Units.toFixed(2) + " u"
                          : evPer100DisplayDollars !== null
                            ? "$" + evPer100DisplayDollars.toFixed(2)
                            : "n/a"}
                    </div>
                    <div className="sub">
                      EV/round:{" "}
                      {evPer100Units === null
                        ? "n/a"
                        : showUnits
                          ? (evPer100Units / 100).toFixed(4) + " u"
                          : evPerRoundDisplayDollars !== null
                            ? "$" + evPerRoundDisplayDollars.toFixed(4)
                            : "n/a"}
                      {showConfidence && ciMetrics?.evRound
                        ? ` • 95% CI: ${showUnits
                          ? formatRange(ciMetrics.evRound.low, ciMetrics.evRound.high, 4, " u")
                          : formatRange(
                              ciMetrics.evRound.low * displayUnitSize,
                              ciMetrics.evRound.high * displayUnitSize,
                              4,
                              "",
                              "$"
                            )}`
                        : ""}
                    </div>
                    {showConfidence && (
                      <div className="sub muted">
                        95% CI (EV/100):{" "}
                        {ciMetrics?.ev100
                          ? showUnits
                            ? formatRange(ciMetrics.ev100.low, ciMetrics.ev100.high, 2, " u")
                            : formatRange(
                                ciMetrics.ev100.low * displayUnitSize,
                                ciMetrics.ev100.high * displayUnitSize,
                                2,
                                "",
                                "$"
                              )
                          : "n/a"}
                      </div>
                    )}
                  </div>
                  <div className="metric">
                    <div className="label">SD / 100 rounds</div>
                    <div className="value">
                      {stdevPer100Units === null
                        ? "n/a"
                        : showUnits
                          ? stdevPer100Units.toFixed(2) + " u"
                          : stdevPer100DisplayDollars !== null
                            ? "$" + stdevPer100DisplayDollars.toFixed(2)
                            : "n/a"}
                    </div>
                    {showConfidence && (
                      <div className="sub muted">
                        95% CI:{" "}
                        {ciMetrics?.sd100
                          ? showUnits
                            ? formatRange(ciMetrics.sd100.low, ciMetrics.sd100.high, 2, " u")
                            : formatRange(
                                ciMetrics.sd100.low * displayUnitSize,
                                ciMetrics.sd100.high * displayUnitSize,
                                2,
                                "",
                                "$"
                              )
                          : "n/a"}
                      </div>
                    )}
                  </div>
                  <div className="metric">
                    <div className="label" title="Rounds until EV equals 1 SD.">N0 (rounds)</div>
                    <div className="value">{displayN0 !== null ? displayN0.toFixed(0) : "n/a"}</div>
                    {showConfidence && (
                      <div className="sub muted">
                        95% CI: {ciMetrics?.n0 ? formatRange(ciMetrics.n0.low, ciMetrics.n0.high, 0) : "n/a"}
                      </div>
                    )}
                  </div>
                  <div className="metric">
                    <div className="label" title="Score proxy = 100 * (EV^2 / variance)">
                      Score (EV/Var proxy)
                    </div>
                    <div className="value">{displayScore !== null ? displayScore.toFixed(4) : "n/a"}</div>
                    {showConfidence && (
                      <div className="sub muted">
                        95% CI: {ciMetrics?.score ? formatRange(ciMetrics.score.low, ciMetrics.score.high, 4) : "n/a"}
                      </div>
                    )}
                  </div>
                  <div className="metric">
                    <div className="label">Equivalent table time</div>
                    <div className="value">{displayHoursPlayed !== null ? formatHours(displayHoursPlayed) : "n/a"}</div>
                  </div>
                  <div className="metric">
                    <div className="label">RoR</div>
                    <div
                      className="value"
                      title={primaryRor === null ? "Requires bankroll and EV/SD from a run." : "Uses the latest EV/SD and bankroll settings."}
                    >
                      {formatRor(primaryRor)}
                    </div>
                    {showConfidence && (
                      <div className="sub muted">
                        95% CI:{" "}
                        {ciMetrics?.ror && ciMetrics.ror.low != null && ciMetrics.ror.high != null
                          ? formatRange(ciMetrics.ror.low * 100, ciMetrics.ror.high * 100, 3, "%")
                          : "n/a"}
                      </div>
                    )}
                  </div>
                  <div className="metric">
                    <div className="label" title="Total rounds simulated (updates live during simulation)">Rounds Simulated</div>
                    <div className="value">{displayRounds !== null ? displayRounds.toLocaleString() : "n/a"}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Bet Average (units)</div>
                    <div className="value">{avgInitialBetUnits !== null ? avgInitialBetUnits.toFixed(2) + " u" : "n/a"}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Win rate (units/hour)</div>
                    <div className="value">{winRateUnits !== null ? winRateUnits.toFixed(2) + " u/hr" : "n/a"}</div>
                    {showConfidence && (
                      <div className="sub muted">
                        95% CI: {ciMetrics?.winRateUnits ? formatRange(ciMetrics.winRateUnits.low, ciMetrics.winRateUnits.high, 2, " u/hr") : "n/a"}
                      </div>
                    )}
                  </div>
                  <div className="metric">
                    <div className="label">Win rate ($/hour)</div>
                    <div className="value">{winRateDollars !== null ? "$" + winRateDollars.toFixed(2) : "n/a"}</div>
                    {showConfidence && (
                      <div className="sub muted">
                        95% CI: {ciMetrics?.winRateDollars ? formatRange(ciMetrics.winRateDollars.low, ciMetrics.winRateDollars.high, 2, "", "$") : "n/a"}
                      </div>
                    )}
                  </div>
                  <div className="metric">
                    <div className="label">DI</div>
                    <div className="value">{result ? result.di.toFixed(5) : "n/a"}</div>
                    {showConfidence && (
                      <div className="sub muted">
                        95% CI: {ciMetrics?.di ? formatRange(ciMetrics.di.low, ciMetrics.di.high, 5) : "n/a"}
                      </div>
                    )}
                  </div>
                </div>
                <div className="toggle-row">
                  <label className="toggle">
                    Show confidence intervals
                    <input type="checkbox" checked={showConfidence} onChange={(e) => setShowConfidence(e.target.checked)} />
                  </label>
                </div>
                {status === "running" && progressHandsDone ? (
                  <div className="muted">
                    Showing estimated metrics from {progressHandsDone.toLocaleString()} rounds
                    {isAppending ? " (including previous run)" : ""}.
                  </div>
                ) : null}
              </>
            )}
          </div>

          {displayRorDetail && (
            <div className="card">
              <div className="card-title">Risk of Ruin Analysis</div>
              <div className="ror-detail-content">
                <div className="ror-detail-grid">
                  <div className="ror-metric">
                    <div className="label">Lifetime RoR</div>
                    <div className="ror-value">
                      {displayRorDetail.adjusted_ror === null || displayRorDetail.adjusted_ror === undefined
                        ? "n/a"
                        : `${(displayRorDetail.adjusted_ror * 100).toFixed(3)}%`}
                    </div>
                    <div className="ror-hint">Probability of losing entire bankroll</div>
                  </div>

                  <div className="ror-metric">
                    <div className="label">Trip RoR ({displayRorDetail.trip_hours ?? 4}h)</div>
                    <div className="ror-value">
                      {displayRorDetail.trip_ror === null || displayRorDetail.trip_ror === undefined
                        ? "n/a"
                        : `${(displayRorDetail.trip_ror * 100).toFixed(3)}%`}
                    </div>
                    <div className="ror-hint">Risk of losing bankroll in one trip</div>
                  </div>

                  <div className="ror-metric">
                    <div className="label">Bankroll for 5% RoR</div>
                    <div className="ror-value">
                      {displayRorDetail.required_bankroll_5pct === null || displayRorDetail.required_bankroll_5pct === undefined
                        ? "n/a"
                        : `$${displayRorDetail.required_bankroll_5pct.toFixed(0)}`}
                    </div>
                    <div className="ror-hint">
                      {displayRorDetail.required_bankroll_5pct === null || displayRorDetail.required_bankroll_5pct === undefined
                        ? "Requires positive EV"
                        : `${(displayRorDetail.required_bankroll_5pct / unitSize).toFixed(0)} units`}
                    </div>
                  </div>

                  <div className="ror-metric">
                    <div className="label">Bankroll for 1% RoR</div>
                    <div className="ror-value">
                      {displayRorDetail.required_bankroll_1pct === null || displayRorDetail.required_bankroll_1pct === undefined
                        ? "n/a"
                        : `$${displayRorDetail.required_bankroll_1pct.toFixed(0)}`}
                    </div>
                    <div className="ror-hint">
                      {displayRorDetail.required_bankroll_1pct === null || displayRorDetail.required_bankroll_1pct === undefined
                        ? "Requires positive EV"
                        : `${(displayRorDetail.required_bankroll_1pct / unitSize).toFixed(0)} units`}
                    </div>
                  </div>

                  <div className="ror-metric">
                    <div className="label">N0 (hands to overcome 1 SD)</div>
                    <div className="ror-value">
                      {Number.isFinite(displayRorDetail.n0_hands) ? displayRorDetail.n0_hands.toFixed(0).toLocaleString() : "n/a"}
                    </div>
                    <div className="ror-hint">
                      {handsPerHour > 0 && Number.isFinite(displayRorDetail.n0_hands)
                        ? `${(displayRorDetail.n0_hands / handsPerHour).toFixed(0)} hours`
                        : "n/a"}
                    </div>
                  </div>
                </div>

                <div className="ror-explanation">
                  <details>
                    <summary>What is Risk of Ruin?</summary>
                    <p>
                      <strong>Risk of Ruin (RoR)</strong> is the probability that you'll lose your entire bankroll before achieving your goals.
                    </p>
                    <ul>
                      <li><strong>Lifetime RoR:</strong> Uses actual profit variance from your bet spread to calculate long-term ruin probability. This accounts for the fact that larger bets at high counts contribute more to variance.</li>
                      <li><strong>Trip RoR:</strong> Risk of losing your entire bankroll during a single trip of specified length. Much higher than lifetime RoR due to short-term variance.</li>
                      <li><strong>Required Bankroll:</strong> How much you need to achieve 5% or 1% risk targets. Industry standard is 5% RoR for professional play.</li>
                      <li><strong>N0:</strong> Number of hands needed for results to converge within 1 standard deviation. Higher N0 means longer path to statistical certainty.</li>
                    </ul>
                  </details>
                </div>
              </div>
            </div>
          )}

          <details className="card">
            <summary className="card-title">Trip Outcomes (simulated)</summary>
            <div className="session-controls">
              <label>
                <span className="label-row">
                  Paths shown
                  <HelpIcon text="Number of simulated sample paths to draw. Higher values show more variability but are purely visual." />
                </span>
                <input type="number" min={1} max={50} value={pathCount} onChange={(e) => setPathCount(Number(e.target.value))} />
              </label>
              <label>
                <span className="label-row">
                  Trip length (hours)
                  <HelpIcon text="Total trip duration. Sets the x-axis and total hands for the session paths." />
                </span>
                <input type="number" min={0.5} max={72} step="0.5" value={tripHours} onChange={(e) => setTripHours(Number(e.target.value))} />
              </label>
              <label>
                <span className="label-row">
                  Hands per hour
                  <HelpIcon text="Pace used to convert trip hours into hands. Affects total hands in the session chart." />
                </span>
                <input type="number" min={30} max={300} value={tripHandsPerHour} onChange={(e) => setTripHandsPerHour(Number(e.target.value))} />
              </label>
              <label>
                <span className="label-row">
                  Steps
                  <HelpIcon text="Number of points in each path. Higher = smoother curves but more computation." />
                </span>
                <input type="number" min={20} max={400} value={tripSteps} onChange={(e) => setTripSteps(Number(e.target.value))} />
              </label>
              <label>
                <span className="label-row">
                  Band mode
                  <HelpIcon text="Sigma uses mean ± K*SD. Percentile uses a normal fan (5/25/50/75/95)." />
                </span>
                <select value={bandMode} onChange={(e) => setBandMode(e.target.value as "sigma" | "percentile")}>
                  <option value="sigma">Sigma</option>
                  <option value="percentile">Percentile</option>
                </select>
              </label>
              {bandMode === "sigma" ? (
                <label>
                  <span className="label-row">
                    Sigma K
                    <HelpIcon text="Width of the sigma band. 1.0 ≈ 68% of outcomes, 2.0 ≈ 95%." />
                  </span>
                  <input type="number" step="0.1" min={0.5} max={3} value={sigmaK} onChange={(e) => setSigmaK(Number(e.target.value))} />
                </label>
              ) : (
                <div className="muted">Fan: 5 / 25 / 50 / 75 / 95</div>
              )}
              <label>
                <span className="label-row">
                  Starting bankroll (units)
                  <HelpIcon text="Optional. If set, paths start from this bankroll level instead of 0 to show drawdowns from a starting stack." />
                </span>
                <input
                  type="number"
                  min={0}
                  value={startBankrollUnits ?? ""}
                  onChange={(e) => setStartBankrollUnits(e.target.value ? Number(e.target.value) : null)}
                />
              </label>
              <label>
                <span className="label-row">
                  Stop-loss (units)
                  <HelpIcon text="Optional horizontal line showing a stop-loss threshold in units." />
                </span>
                <input
                  type="number"
                  min={0}
                  value={stopLossUnits ?? ""}
                  onChange={(e) => setStopLossUnits(e.target.value ? Number(e.target.value) : null)}
                />
              </label>
              <label>
                <span className="label-row">
                  Win goal (units)
                  <HelpIcon text="Optional horizontal line showing a target profit or win goal in units." />
                </span>
                <input
                  type="number"
                  min={0}
                  value={winGoalUnits ?? ""}
                  onChange={(e) => setWinGoalUnits(e.target.value ? Number(e.target.value) : null)}
                />
              </label>
            </div>
            {!sessionSvg || !sessionChart ? (
              <div className="muted">Run a simulation to generate trip paths.</div>
            ) : (
              <div className="chart-wrap">
                <svg
                  viewBox={`0 0 ${sessionSvg.width} ${sessionSvg.height}`}
                  className="session-chart"
                  onMouseLeave={() => setHoverPoint(null)}
                  onMouseMove={(event) => {
                    const target = event.currentTarget;
                    const rect = target.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const plotX = x - sessionSvg.margin.left;
                    if (plotX < 0 || plotX > sessionSvg.plotWidth) {
                      setHoverPoint(null);
                      return;
                    }
                    const ratio = plotX / sessionSvg.plotWidth;
                    const rawIndex = Math.round(ratio * sessionChart.steps);
                    const index = Math.max(0, Math.min(sessionChart.steps, rawIndex));
                    setHoverPoint({ index, x, y });
                  }}
                >
                  <g className="chart-grid">
                    {sessionSvg.xTicks.map((tick) => (
                      <line key={`x-${tick.x}`} x1={tick.x} x2={tick.x} y1={sessionSvg.margin.top} y2={sessionSvg.margin.top + sessionSvg.plotHeight} />
                    ))}
                    {sessionSvg.yTicks.map((tick) => (
                      <line key={`y-${tick.y}`} x1={sessionSvg.margin.left} x2={sessionSvg.margin.left + sessionSvg.plotWidth} y1={tick.y} y2={tick.y} />
                    ))}
                  </g>
                  <g className="chart-axis">
                    <line x1={sessionSvg.margin.left} x2={sessionSvg.margin.left} y1={sessionSvg.margin.top} y2={sessionSvg.margin.top + sessionSvg.plotHeight} />
                    <line
                      x1={sessionSvg.margin.left}
                      x2={sessionSvg.margin.left + sessionSvg.plotWidth}
                      y1={sessionSvg.margin.top + sessionSvg.plotHeight}
                      y2={sessionSvg.margin.top + sessionSvg.plotHeight}
                    />
                  </g>
                  <g className="chart-ticks">
                    {sessionSvg.xTicks.map((tick) => (
                      <text key={`xt-${tick.x}`} x={tick.x} y={sessionSvg.margin.top + sessionSvg.plotHeight + 16} textAnchor="middle">
                        <tspan>{tick.hours.toFixed(1)}h</tspan>
                        <tspan x={tick.x} dy="12">{Math.round(tick.hands).toLocaleString()} hands</tspan>
                      </text>
                    ))}
                    {sessionSvg.yTicks.map((tick) => (
                      <text key={`yt-${tick.y}`} x={sessionSvg.margin.left - 8} y={tick.y + 4} textAnchor="end">
                        {showUnits ? tick.value.toFixed(2) + " u" : "$" + tick.value.toFixed(0)}
                      </text>
                    ))}
                    <text
                      x={sessionSvg.margin.left + sessionSvg.plotWidth / 2}
                      y={sessionSvg.height - 6}
                      textAnchor="middle"
                      className="axis-label"
                    >
                      Trip time (hours)
                    </text>
                    <text
                      x={12}
                      y={sessionSvg.margin.top + sessionSvg.plotHeight / 2}
                      textAnchor="middle"
                      transform={`rotate(-90 12 ${sessionSvg.margin.top + sessionSvg.plotHeight / 2})`}
                      className="axis-label"
                    >
                      {showUnits ? "Profit (u)" : "Profit ($)"}
                    </text>
                  </g>
                  <line className="chart-baseline" x1={sessionSvg.margin.left} x2={sessionSvg.margin.left + sessionSvg.plotWidth} y1={sessionSvg.zeroY} y2={sessionSvg.zeroY} />
                  {stopLossUnits !== null && (
                    <line
                      className="chart-threshold stop"
                      x1={sessionSvg.margin.left}
                      x2={sessionSvg.margin.left + sessionSvg.plotWidth}
                      y1={sessionSvg.scaleY(stopLossUnits * (showUnits ? 1 : displayUnitSize))}
                      y2={sessionSvg.scaleY(stopLossUnits * (showUnits ? 1 : displayUnitSize))}
                    />
                  )}
                  {winGoalUnits !== null && (
                    <line
                      className="chart-threshold goal"
                      x1={sessionSvg.margin.left}
                      x2={sessionSvg.margin.left + sessionSvg.plotWidth}
                      y1={sessionSvg.scaleY(winGoalUnits * (showUnits ? 1 : displayUnitSize))}
                      y2={sessionSvg.scaleY(winGoalUnits * (showUnits ? 1 : displayUnitSize))}
                    />
                  )}
                  <path d={sessionSvg.bandOuter} className="chart-band-outer" />
                  {sessionSvg.bandInner && <path d={sessionSvg.bandInner} className="chart-band-inner" />}
                  <path d={sessionSvg.meanPath} className="chart-mean" />
                  {sessionSvg.linePaths.map((path, idx) => (
                    <path key={idx} d={path} className="chart-path" />
                  ))}
                </svg>
                {hoverPoint && sessionChart && (
                  <div className="chart-tooltip" style={{ left: hoverPoint.x + 12, top: hoverPoint.y + 12 }}>
                    <div className="tooltip-title">
                      {((hoverPoint.index / sessionChart.steps) * sessionChart.hours).toFixed(2)}h •{" "}
                      {Math.round((hoverPoint.index / sessionChart.steps) * sessionChart.totalHands).toLocaleString()} hands
                    </div>
                    <div>
                      Mean:{" "}
                      {showUnits
                        ? sessionChart.mean[hoverPoint.index].toFixed(2) + " u"
                        : "$" + sessionChart.mean[hoverPoint.index].toFixed(2)}
                    </div>
                    <div>
                      Band:{" "}
                      {showUnits
                        ? sessionChart.lower[hoverPoint.index].toFixed(2) + " u"
                        : "$" + sessionChart.lower[hoverPoint.index].toFixed(2)}{" "}
                      to{" "}
                      {showUnits
                        ? sessionChart.upper[hoverPoint.index].toFixed(2) + " u"
                        : "$" + sessionChart.upper[hoverPoint.index].toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="muted">
              EV/SD are applied per hand. Band mode uses {bandMode === "sigma" ? `${sigmaK}σ` : "percentile fan (5–95 and 25–75)"}.
            </div>
          </details>

          <details className="card">
            <summary className="card-title">TC Histograms</summary>
            <div className="charts">
              {result?.tc_histogram && renderHistogram(result.tc_histogram, "TC Histogram (raw)")}
              {result?.tc_histogram_est && JSON.stringify(result.tc_histogram_est) !== JSON.stringify(result.tc_histogram) &&
                renderHistogram(result.tc_histogram_est, "TC Histogram (estimated)")}
            </div>
          </details>

          <div className="card">
            <div className="card-title">Risk of Ruin (calculator)</div>
            <div className="risk-grid">
              <label>
                <span className="label-row">
                  Mode
                  <HelpIcon text="Simple = infinite play log-ruin approximation. Trip = finite-hands session risk using a normal approximation." />
                </span>
                <select value={rorMode} onChange={(e) => setRorMode(e.target.value as "simple" | "trip")}>
                  <option value="simple">Simple (infinite)</option>
                  <option value="trip">Trip (finite)</option>
                </select>
              </label>
              {rorMode === "trip" && (
                <label>
                  <span className="label-row">
                    Trip input
                    <HelpIcon text="Choose whether the trip length is defined by hands or hours." />
                  </span>
                  <select value={rorTripMode} onChange={(e) => setRorTripMode(e.target.value as "hands" | "hours")}>
                    <option value="hands">Hands</option>
                    <option value="hours">Hours</option>
                  </select>
                </label>
              )}
              {rorMode === "trip" && (
                <label>
                  <span className="label-row">
                    Trip {rorTripMode}
                    <HelpIcon text="Total length of the session. Longer trips increase trip RoR." />
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={rorTripValue}
                    onChange={(e) => setRorTripValue(Number(e.target.value))}
                  />
                </label>
              )}
              {rorMode === "trip" && (
                <div className="inline-actions">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      setRorTripMode("hands");
                      setRorTripValue(hands);
                    }}
                  >
                    Use sim hands
                  </button>
                </div>
              )}
              <label>
                <span className="label-row">
                  Bankroll ($)
                  <HelpIcon text="Shared with Simulation Settings. Changing this value updates both the sim bankroll and the RoR calculator." />
                </span>
                <input
                  type="number"
                  value={bankroll ?? ""}
                  onChange={(e) => setBankroll(e.target.value ? Number(e.target.value) : null)}
                />
              </label>
            </div>
            {riskInputs ? (
              <>
                <div className="risk-output">
                  <div>
                    <div className="label">Simple RoR</div>
                    <div className="risk-value">{formatRor(rorSimple)}</div>
                    {showConfidence && (
                      <div className="muted">
                        95% CI:{" "}
                        {ciMetrics?.ror && ciMetrics.ror.low != null && ciMetrics.ror.high != null
                          ? formatRange(ciMetrics.ror.low * 100, ciMetrics.ror.high * 100, 3, "%")
                          : "n/a"}
                      </div>
                    )}
                  </div>
                  {rorMode === "trip" && (
                    <div>
                      <div className="label">Trip RoR</div>
                      <div className="risk-value">{formatRor(rorTrip)}</div>
                      {showConfidence && (
                        <div className="muted">
                          95% CI:{" "}
                          {ciMetrics?.rorTrip && ciMetrics.rorTrip.low != null && ciMetrics.rorTrip.high != null
                            ? formatRange(ciMetrics.rorTrip.low * 100, ciMetrics.rorTrip.high * 100, 3, "%")
                            : "n/a"}
                        </div>
                      )}
                      <div className="muted">
                        {tripHands.toLocaleString()} hands ({handsPerHour > 0 ? (tripHands / handsPerHour).toFixed(1) : "n/a"} hrs)
                      </div>
                    </div>
                  )}
                </div>
                <div className="muted">
                  Uses EV/100{" "}
                  {evPer100Units === null
                    ? "n/a"
                    : showUnits
                      ? `${formatNumber(evPer100Units)} u`
                      : evPer100DisplayDollars !== null
                        ? `$${formatNumber(evPer100DisplayDollars)}`
                        : "n/a"}{" "}
                  and SD/100{" "}
                  {stdevPer100Units === null
                    ? "n/a"
                    : showUnits
                      ? `${formatNumber(stdevPer100Units)} u`
                      : stdevPer100DisplayDollars !== null
                        ? `$${formatNumber(stdevPer100DisplayDollars)}`
                        : "n/a"}{" "}
                  from the current run. Bankroll: {bankroll !== null ? `$${bankroll.toFixed(2)}` : "n/a"} (
                  {riskBankrollUnits !== null ? riskBankrollUnits.toFixed(1) + " u" : "n/a"}).
                </div>
              </>
            ) : (
              <div className="muted">Run a simulation and set a bankroll to estimate RoR.</div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Performance Tables</div>
            {!result && !progress?.ev_per_100_est ? (
              <div className="muted">Run a simulation to populate tables.</div>
            ) : (
              <>
                <div className="opt-controls">
                  <label>
                    <span className="label-row">
                      Kelly fraction
                      <HelpIcon text="Fraction of full Kelly sizing used for optimal bets. 1.0 = full Kelly; 0.5 = half Kelly. Lower values reduce variance and RoR but also reduce growth." />
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      value={optKellyFraction}
                      onChange={(e) => setOptKellyFraction(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    <span className="label-row">
                      Max units
                      <HelpIcon text="Hard cap for optimal bets. Set to your table max or spread limit. Higher caps increase EV and variance." />
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={optMaxUnits}
                      onChange={(e) => setOptMaxUnits(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    <span className="label-row">
                      Bet increment (units)
                      <HelpIcon text="Minimum bet step for rounding optimal bets (e.g., 1.0 = whole unit, 0.5 = half unit)." />
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min={0.01}
                      value={optBetIncrement}
                      onChange={(e) => setOptBetIncrement(Number(e.target.value))}
                    />
                  </label>
                  <label className="toggle">
                    <span className="label-row">
                      Simplify
                      <HelpIcon text="Smooths the optimal bet ramp by reducing abrupt jumps. More realistic, but can slightly reduce EV." />
                    </span>
                    <input type="checkbox" checked={optSimplify} onChange={(e) => setOptSimplify(e.target.checked)} />
                  </label>
                  <label>
                    <span className="label-row">
                      Negative edge policy
                      <HelpIcon text="What to do when EV% <= 0 for a TC bucket: sit out (0 bet), force min bet, or hide the row." />
                    </span>
                    <select value={negativeEdgePolicy} onChange={(e) => setNegativeEdgePolicy(e.target.value as "sit_out" | "min_bet" | "hide")}>
                      <option value="sit_out">Sit out (0 bet)</option>
                      <option value="min_bet">Force min bet</option>
                      <option value="hide">Hide (N/A)</option>
                    </select>
                  </label>
                  <label className="toggle">
                    <span className="label-row">
                      Show edge bars
                      <HelpIcon text="Adds EV% bars behind the lines to show where your edge is positive or negative." />
                    </span>
                    <input type="checkbox" checked={showEdgeBars} onChange={(e) => setShowEdgeBars(e.target.checked)} />
                  </label>
                  <label className="toggle">
                    <span className="label-row">
                      Show exact line
                      <HelpIcon text="Shows the unrounded Kelly bet line before chip rounding and caps are applied." />
                    </span>
                    <input type="checkbox" checked={showExactLine} onChange={(e) => setShowExactLine(e.target.checked)} />
                  </label>
                </div>
                <div className="muted">
                  Optimal bets use EV/variance per TC with a Kelly-style formula and the shared bankroll (currently{" "}
                  {riskBankrollUnits !== null ? `${riskBankrollUnits.toFixed(1)} u` : "n/a"}).
                </div>
                <div className="table-scroll">
                  <table className="data-table wide">
                    <thead>
                      <tr>
                        <th title="Average initial bet before doubles/splits/surrender/insurance.">Bet Average (u)</th>
                        <th title="EV per 100 rounds.">Results</th>
                        <th title="Standard deviation per 100 rounds.">Std Dev</th>
                        <th>Risk of Ruin</th>
                        <th title="Score (EV/Var proxy).">Performance</th>
                        <th title="EV per hand divided by average initial bet.">%W/L</th>
                        <th>Win Rate</th>
                        <th>$/Hr</th>
                        <th>Hand/Hr</th>
                        <th>DI</th>
                        <th>c-SCORE</th>
                        <th>CE</th>
                        <th>CE/WR</th>
                        <th>N0</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{avgInitialBetUnits !== null ? avgInitialBetUnits.toFixed(2) : "n/a"}</td>
                        <td
                          title={
                            showConfidence
                              ? `95% CI: ${
                                  ciMetrics?.ev100
                                    ? showUnits
                                      ? formatRange(ciMetrics.ev100.low, ciMetrics.ev100.high, 2, " u")
                                      : formatRange(
                                          ciMetrics.ev100.low * displayUnitSize,
                                          ciMetrics.ev100.high * displayUnitSize,
                                          2,
                                          "",
                                          "$"
                                        )
                                    : "n/a"
                                }`
                              : undefined
                          }
                        >
                          {evPer100Units === null
                            ? "n/a"
                            : showUnits
                              ? `${formatNumber(evPer100Units)} u`
                              : evPer100DisplayDollars !== null
                                ? `$${formatNumber(evPer100DisplayDollars)}`
                                : "n/a"}
                        </td>
                        <td
                          title={
                            showConfidence
                              ? `95% CI: ${
                                  ciMetrics?.sd100
                                    ? showUnits
                                      ? formatRange(ciMetrics.sd100.low, ciMetrics.sd100.high, 2, " u")
                                      : formatRange(
                                          ciMetrics.sd100.low * displayUnitSize,
                                          ciMetrics.sd100.high * displayUnitSize,
                                          2,
                                          "",
                                          "$"
                                        )
                                    : "n/a"
                                }`
                              : undefined
                          }
                        >
                          {stdevPer100Units === null
                            ? "n/a"
                            : showUnits
                              ? `${formatNumber(stdevPer100Units)} u`
                              : stdevPer100DisplayDollars !== null
                                ? `$${formatNumber(stdevPer100DisplayDollars)}`
                                : "n/a"}
                        </td>
                        <td
                          title={
                            showConfidence
                              ? `95% CI: ${
                                  ciMetrics?.ror && ciMetrics.ror.low != null && ciMetrics.ror.high != null
                                    ? formatRange(ciMetrics.ror.low * 100, ciMetrics.ror.high * 100, 3, "%")
                                    : "n/a"
                                }`
                              : undefined
                          }
                        >
                          {formatRor(rorSimple ?? result?.ror)}
                        </td>
                        <td
                          title={
                            showConfidence
                              ? `95% CI: ${ciMetrics?.score ? formatRange(ciMetrics.score.low, ciMetrics.score.high, 4) : "n/a"}`
                              : undefined
                          }
                        >
                          {displayScore !== null ? displayScore.toFixed(4) : "n/a"}
                        </td>
                        <td
                          title={
                            showConfidence
                              ? `95% CI: ${ciMetrics?.winLossPct ? formatRange(ciMetrics.winLossPct.low, ciMetrics.winLossPct.high, 2, "%") : "n/a"}`
                              : undefined
                          }
                        >
                          {formatPercent(winLossPct, 2)}
                        </td>
                        <td
                          title={
                            showConfidence
                              ? `95% CI: ${ciMetrics?.winRateUnits ? formatRange(ciMetrics.winRateUnits.low, ciMetrics.winRateUnits.high, 2, " u/hr") : "n/a"}`
                              : undefined
                          }
                        >
                          {winRateUnits !== null ? `${winRateUnits.toFixed(2)} u/hr` : "n/a"}
                        </td>
                        <td
                          title={
                            showConfidence
                              ? `95% CI: ${ciMetrics?.winRateDollars ? formatRange(ciMetrics.winRateDollars.low, ciMetrics.winRateDollars.high, 2, "", "$") : "n/a"}`
                              : undefined
                          }
                        >
                          {winRateDollars !== null ? `$${winRateDollars.toFixed(2)}` : "n/a"}
                        </td>
                        <td>{handsPerHour}</td>
                        <td
                          title={
                            showConfidence ? `95% CI: ${ciMetrics?.di ? formatRange(ciMetrics.di.low, ciMetrics.di.high, 5) : "n/a"}` : undefined
                          }
                        >
                          {result ? result.di.toFixed(4) : "n/a"}
                        </td>
                        <td>{cScore !== null ? cScore.toFixed(4) : "n/a"}</td>
                        <td className="muted">n/a</td>
                        <td className="muted">n/a</td>
                        <td
                          title={
                            showConfidence ? `95% CI: ${ciMetrics?.n0 ? formatRange(ciMetrics.n0.low, ciMetrics.n0.high, 0) : "n/a"}` : undefined
                          }
                        >
                          {displayN0 !== null ? displayN0.toFixed(0) : "n/a"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="table-note muted">
                  Bet Average is the initial bet in units before doubles/splits/surrender/insurance. CE and CE/WR are not yet implemented.
                </div>
                {optimalChart ? (
                  <div className="optimal-chart">
                    <div className="chart-legend">
                      <span className="legend-item">
                        <span className="legend-swatch ramp" /> Current ramp
                      </span>
                      <span className="legend-item">
                        <span className="legend-swatch chips" /> Optimal chips
                      </span>
                      {showExactLine && (
                        <span className="legend-item">
                          <span className="legend-swatch exact" /> Optimal exact
                        </span>
                      )}
                      {showEdgeBars && (
                        <span className="legend-item">
                          <span className="legend-swatch edge" /> EV% bars
                        </span>
                      )}
                    </div>
                    <svg viewBox={`0 0 ${optimalChart.width} ${optimalChart.height}`} className="optimal-chart-svg">
                      <g className="opt-bg">
                        {optimalChart.data.map((row, idx) => {
                          const x = optimalChart.scaleXLeft(idx);
                          const isPositive = row.ev_pct > 0;
                          return (
                            <rect
                              key={`bg-${row.label}`}
                              x={x}
                              y={optimalChart.margin.top}
                              width={optimalChart.bucketWidth}
                              height={optimalChart.plotHeight}
                              className={isPositive ? "opt-bg-positive" : "opt-bg-negative"}
                            />
                          );
                        })}
                      </g>
                      {showEdgeBars && (
                        <g className="opt-edge-bars">
                          {optimalChart.data.map((row, idx) => {
                            const barHeight = (Math.abs(row.ev_pct) / optimalChart.maxAbsEdge) * optimalChart.plotHeight * 0.6;
                            const xCenter = optimalChart.scaleXCenter(idx);
                            const yBottom = optimalChart.margin.top + optimalChart.plotHeight;
                            return (
                              <rect
                                key={`bar-${row.label}`}
                                x={xCenter - optimalChart.bucketWidth * 0.25}
                                y={yBottom - barHeight}
                                width={optimalChart.bucketWidth * 0.5}
                                height={barHeight}
                                className={row.ev_pct >= 0 ? "opt-edge-positive" : "opt-edge-negative"}
                              />
                            );
                          })}
                        </g>
                      )}
                      <line
                        className="opt-baseline"
                        x1={optimalChart.margin.left}
                        x2={optimalChart.margin.left + optimalChart.plotWidth}
                        y1={optimalChart.scaleY(0)}
                        y2={optimalChart.scaleY(0)}
                      />
                      <path d={optimalChart.rampPath} className="opt-line ramp" />
                      <path d={optimalChart.chipsPath} className="opt-line chips" />
                      {showExactLine && <path d={optimalChart.exactPath} className="opt-line exact" />}
                      {optimalChart.data.map((row, idx) => (
                        <circle
                          key={`pt-${row.label}`}
                          cx={optimalChart.scaleXCenter(idx)}
                          cy={optimalChart.scaleY(row.opt_chips ?? 0)}
                          r={2.8}
                          className="opt-point"
                        />
                      ))}
                      <g className="opt-axis">
                        {optimalChart.data.map((row, idx) => (
                          <text
                            key={`x-${row.label}`}
                            x={optimalChart.scaleXCenter(idx)}
                            y={optimalChart.height - 8}
                            textAnchor="middle"
                          >
                            {row.label}
                          </text>
                        ))}
                        <text x={optimalChart.margin.left - 6} y={optimalChart.margin.top + 6} textAnchor="end">
                          {optimalChart.yMax.toFixed(0)}u
                        </text>
                        <text x={optimalChart.margin.left - 6} y={optimalChart.scaleY(0) + 4} textAnchor="end">
                          0
                        </text>
                      </g>
                    </svg>
                  </div>
                ) : (
                  <div className="muted">Run a simulation to see optimal bet comparisons.</div>
                )}
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Count</th>
                        <th>Freq.</th>
                        <th>N (played)</th>
                        <th>EV% (IBA)</th>
                        <th>Std Err%</th>
                        <th>Optimal Bet Exact (u)</th>
                        <th>Optimal Bet Chips (u)</th>
                        <th>Optimal Bet Chips ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tcSummary?.rows.map((row) => {
                        const minUnits = rampStats?.min ?? 1;
                        const notes: string[] = [];
                        if (!row.edge_known) {
                          notes.push("Bucket includes 0-bet (wonged) rounds; IBA undefined.");
                        } else if (row.ev_pct <= 0) {
                          notes.push("Edge <= 0: optimal is 0 (sit out) unless forced min-bet.");
                        }
                        if (row.n_zero > 0) {
                          notes.push("Bucket includes wonged rounds.");
                        }
                        const tooltip = [
                          `TC bucket: ${row.label}`,
                          `Freq: ${(row.freq * 100).toFixed(2)}% (N=${row.n_total.toLocaleString()}, played=${row.n_iba.toLocaleString()})`,
                          `Edge (IBA): ${row.edge_known ? row.ev_pct.toFixed(2) + "%" : "n/a"}`,
                          `Std Err: ${row.edge_known ? row.ev_se_pct.toFixed(2) + "%" : "n/a"}`,
                          `Bankroll: ${riskBankrollUnits !== null ? riskBankrollUnits.toFixed(1) + "u" : "n/a"}, Kelly fraction: ${optKellyFraction.toFixed(2)}`,
                          `Exact: ${row.opt_exact !== null ? row.opt_exact.toFixed(2) + "u" : "n/a"}  Chips: ${row.opt_chips !== null ? row.opt_chips.toFixed(2) + "u" : "n/a"} (inc ${optBetIncrement}u, min ${minUnits}u, max ${optMaxUnits}u)`,
                          ...notes,
                        ].join("\n");
                        return (
                          <tr key={row.label} title={tooltip} className={row.n_iba < 200 ? "low-sample" : ""}>
                            <td>{row.label}</td>
                            <td>{formatPercent(row.freq * 100, 2)}</td>
                            <td>{row.n_iba}</td>
                            <td>{row.edge_known ? formatPercent(row.ev_pct, 2) : "n/a"}</td>
                            <td>{row.edge_known ? formatPercent(row.ev_se_pct, 2) : "n/a"}</td>
                            <td>{row.opt_exact !== null ? row.opt_exact.toFixed(2) : "n/a"}</td>
                            <td>{row.opt_chips !== null ? row.opt_chips.toFixed(2) : "n/a"}</td>
                            <td>{row.opt_chips !== null ? "$" + (row.opt_chips * unitSize).toFixed(2) : "n/a"}</td>
                          </tr>
                        );
                      })}
                      {!tcSummary && (
                        <tr>
                          <td colSpan={8} className="muted">
                            No per-count data yet. Run a simulation with the updated backend.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <details className="help-block">
                  <summary>How to read this table</summary>
                  <ul>
                    <li>
                      What this table shows: For each true count bucket, we estimate your edge (EV%) and uncertainty (Std Err%) using IBA (profit per initial bet).
                    </li>
                    <li>
                      Optimal Bet = Kelly-style sizing: Optimal Bet Exact uses a Kelly-style formula: bet bigger when the edge is higher and/or variance is lower,
                      and smaller when variance is higher. It also scales with your bankroll and Kelly fraction.
                    </li>
                    <li>
                      Chips vs Exact: Chips (u) rounds the exact bet to your bet increment and clamps it to min/max units. Chips ($) converts units to dollars using Unit size.
                    </li>
                    <li>
                      Why some rows show 0 or N/A: When the estimated edge is &lt;= 0, the unconstrained optimal bet is 0 (sit out) unless your rules force you to play.
                      Rows can show N/A when the bucket includes wonged (0-bet) rounds, because IBA is undefined when initial bet = 0.
                    </li>
                    <li>
                      How to use it: Compare your current ramp to Optimal Chips. If your ramp is higher than optimal at mid counts, you will usually get higher EV but also higher risk (RoR / drawdowns).
                    </li>
                    <li>
                      Important limitation: These are conditional estimates by bucket; real play can differ because TC estimation, table selection, and rule constraints change what you actually see and bet.
                    </li>
                  </ul>
                </details>
                <div className="table-note muted">
                  Per-count EV and standard error use IBA (profit per initial bet). Optimal bets are Kelly-style and rounded by the bet increment.
                </div>
              </>
            )}
          </div>

          {result?.debug_hands && (
            <details className="card">
              <summary className="card-title">Run Details</summary>
              <pre className="code-block">
                {JSON.stringify({ meta: result.meta, ror_raw: result.ror, debug_hands: result.debug_hands }, null, 2)}
              </pre>
            </details>
          )}
        </main>
      </div>
        </>
      )}

      {showSavePreset && (
        <div className="modal-backdrop" onClick={() => setShowSavePreset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Save Preset</h3>
            <label>
              Type
              <select value={presetType} onChange={(e) => setPresetType(e.target.value as PresetType)}>
                <option value="scenario">Scenario</option>
                <option value="rules">Rules</option>
                <option value="ramp">Ramp</option>
                <option value="deviations">Deviations</option>
              </select>
            </label>
            <label>
              Name
              <input value={presetName} onChange={(e) => setPresetName(e.target.value)} />
            </label>
            <label>
              Tags (comma-separated)
              <input value={presetTags} onChange={(e) => setPresetTags(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowSavePreset(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={handleSavePreset}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoadPreset && (
        <div className="modal-backdrop" onClick={() => setShowLoadPreset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Load Preset</h3>
            <input placeholder="Search presets..." value={searchPresets} onChange={(e) => setSearchPresets(e.target.value)} />
            <div className="preset-list">
              {filteredPresets.map((preset) => (
                <div key={preset.id} className="preset-item">
                  <button className="preset-load" onClick={() => handleLoadPreset(preset)}>
                    <div>
                      <strong>{preset.name}</strong>
                      <div className="muted">{preset.type}</div>
                    </div>
                    <div className="tags">{preset.tags.join(", ")}</div>
                  </button>
                  <div className="preset-actions">
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deletePreset(preset);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;

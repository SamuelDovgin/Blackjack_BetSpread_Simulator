import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  BetRamp,
  BetRampEntry,
  Deviation,
  DefaultLibraries,
  Rules,
  SimulationResult,
  SimulationStatus,
  fetchDefaults,
  getSimulation,
  getSimulationStatus,
  startSimulation,
} from "./api/client";

type UiStatus = "idle" | "running" | "done" | "error";
type PresetType = "rules" | "ramp" | "deviations" | "scenario";

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

const actionOptions = ["H", "S", "D", "P", "R", "I"];
const tcModes = [
  { label: "Perfect", value: 0 },
  { label: "Half-deck", value: 0.5 },
  { label: "Full-deck", value: 1.0 },
];
const tcRounding = ["nearest", "floor", "ceil"];
const handPresets = [50_000, 200_000, 2_000_000];

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
        wong_out_below: null,
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
        wong_out_below: null,
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
        wong_out_below: -1,
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
        wong_out_below: -1,
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
        wong_out_below: -1,
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
  const [defaults, setDefaults] = useState<DefaultLibraries | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [betRamp, setBetRamp] = useState<BetRamp | null>(null);
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [hands, setHands] = useState<number>(2_000_000);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000_000));
  const [randomizeSeedEachRun, setRandomizeSeedEachRun] = useState<boolean>(true);
  const [unitSize, setUnitSize] = useState<number>(10);
  const [bankroll, setBankroll] = useState<number | null>(null);
  const [handsPerHour, setHandsPerHour] = useState<number>(100);
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
  const [sessionCount, setSessionCount] = useState<number>(3);
  const [sessionSigma, setSessionSigma] = useState<number>(1);
  const [sessionPoints, setSessionPoints] = useState<number>(80);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [rampPresetId, setRampPresetId] = useState<string>("");
  const [deviationPresetId, setDeviationPresetId] = useState<string>("");

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    fetchDefaults()
      .then((data) => {
        setDefaults(data);
        setRules(data.rules);
        setBetRamp(data.bet_ramp);
        setDeviations(data.deviations);
      })
      .catch((err) => setError(`Failed to load defaults: ${err.message}`));
  }, []);

  useEffect(() => {
    if (tcEstStep === 0) {
      setUseEstForBet(false);
      setUseEstForDev(false);
    }
  }, [tcEstStep]);

  useEffect(() => {
    if (!simId) return;
    setStatus("running");
    const timer = setInterval(async () => {
      try {
        const stat = await getSimulationStatus(simId);
        setProgress(stat);
        if (stat.status === "done" || stat.progress >= 1) {
          const data = await getSimulation(simId);
          setResult(data);
          setStatus("done");
          clearInterval(timer);
        }
      } catch {
        // keep polling until available
      }
    }, 750);
    return () => clearInterval(timer);
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
  const isStale = lastRunConfig !== null && lastRunConfig !== scenarioJson;
  const isDirty = lastSavedConfig !== null ? lastSavedConfig !== scenarioJson : scenarioConfig !== null;

  const handleRun = async () => {
    if (!scenarioConfig) return;
    setError(null);
    setResult(null);
    try {
      const runSeed = randomizeSeedEachRun ? Math.floor(Math.random() * 1_000_000_000) : seed;
      if (randomizeSeedEachRun) setSeed(runSeed);
      const runConfig = {
        ...scenarioConfig,
        settings: { ...scenarioConfig.settings, seed: runSeed },
      };
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
      };
      const { id } = await startSimulation(payload);
      setSimId(id);
      setStatus("running");
      setProgress({ status: "running", progress: 0, hands_done: 0, hands_total: hands });
      setLastRunConfig(JSON.stringify(runConfig));
    } catch (err: any) {
      setError(err.message ?? "Failed to start simulation");
      setStatus("error");
    }
  };

  const handleStop = () => {
    setSimId(null);
    setStatus("idle");
    setProgress(null);
  };

  const statusLabel = () => {
    if (status === "running" && progress) return `Running ${Math.round(progress.progress * 100)}%`;
    if (status === "done") return "Complete";
    if (status === "error") return "Error";
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
    return `${(ror * 100).toFixed(1)}%`;
  };

  const evPer100 = result?.ev_per_100 ?? progress?.ev_per_100_est ?? null;
  const stdevPer100 = result?.stdev_per_100 ?? progress?.stdev_per_100_est ?? null;
  const avgInitialBet = result?.avg_initial_bet ?? progress?.avg_initial_bet_est ?? null;
  const avgInitialBetUnits = avgInitialBet ? avgInitialBet / unitSize : null;
  const evPerRound = evPer100 !== null ? evPer100 / 100 : null;
  const winRateDollars = evPerRound !== null ? evPerRound * handsPerHour : null;
  const winRateUnits = winRateDollars !== null ? winRateDollars / unitSize : null;

  const sessionChart = useMemo(() => {
    if (evPer100 === null || stdevPer100 === null || !hands) return null;
    const points = Math.max(10, Math.min(sessionPoints, 200));
    const totalHands = hands;
    const meanPerHand = evPer100 / 100;
    const stdevPerHand = stdevPer100 / 10;
    const base = bankroll ?? 0;

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

    const lines: number[][] = [];
    for (let s = 0; s < sessionCount; s += 1) {
      const rng = mulberry32(seed + s * 9973);
      const values: number[] = [];
      let cumulative = 0;
      let prevN = 0;
      for (let i = 0; i <= points; i += 1) {
        const n = Math.round((i / points) * totalHands);
        const chunk = n - prevN;
        if (chunk > 0) {
          const mean = meanPerHand * chunk;
          const stdev = stdevPerHand * Math.sqrt(chunk);
          const increment = mean + stdev * randn(rng);
          cumulative += increment;
          prevN = n;
        }
        values.push(base + cumulative);
      }
      lines.push(values);
    }

    const expected: number[] = [];
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = 0; i <= points; i += 1) {
      const n = Math.round((i / points) * totalHands);
      const mean = base + meanPerHand * n;
      const band = sessionSigma * stdevPerHand * Math.sqrt(n);
      expected.push(mean);
      upper.push(mean + band);
      lower.push(mean - band);
    }

    return { lines, expected, upper, lower, points };
  }, [evPer100, stdevPer100, hands, sessionCount, sessionSigma, sessionPoints, seed, bankroll]);

  const sessionSvg = useMemo(() => {
    if (!sessionChart) return null;
    const width = 900;
    const height = 240;
    const pad = 30;
    const allValues = [
      ...sessionChart.lines.flat(),
      ...sessionChart.upper,
      ...sessionChart.lower,
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

    const scaleX = (i: number) => pad + (i / sessionChart.points) * (width - pad * 2);
    const scaleY = (value: number) => height - pad - ((value - minY) / (maxY - minY)) * (height - pad * 2);

    const buildPath = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(v)}`).join(" ");

    const lowerPoints = sessionChart.lower.map((v, i) => `${scaleX(i)},${scaleY(v)}`);
    const upperPoints = sessionChart.upper.map((v, i) => `${scaleX(i)},${scaleY(v)}`).reverse();
    const bandPath = `M${lowerPoints[0]} L${lowerPoints.slice(1).join(" L")} L${upperPoints.join(" L")} Z`;

    return {
      width,
      height,
      bandPath,
      expectedPath: buildPath(sessionChart.expected),
      linePaths: sessionChart.lines.map(buildPath),
      minY,
      maxY,
    };
  }, [sessionChart]);

  return (
    <div className="app">
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
          {handPresets.map((preset) => (
            <button key={preset} className="btn ghost" onClick={() => setHands(preset)} disabled={status === "running"}>
              {preset.toLocaleString()} hands
            </button>
          ))}
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
        </div>
        <label className="toggle">
          Show units
          <input type="checkbox" checked={showUnits} onChange={(e) => setShowUnits(e.target.checked)} />
        </label>
        <div className={`status-chip ${status}`}>{statusLabel()}</div>
      </header>

      {isStale && (
        <div className="banner">
          Results are from a previous configuration. {" "}
          <button className="link" onClick={handleRun}>
            Re-run
          </button>
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
                    <option value="default">6D H17 DAS LS (Midwest)</option>
                    <option value="s17">6D S17 DAS LS (Midwest)</option>
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
                Unit size ($)
                <input type="number" value={unitSize} onChange={(e) => setUnitSize(Number(e.target.value))} />
              </label>
              <label>
                Bankroll ($)
                <input type="number" value={bankroll ?? ""} onChange={(e) => setBankroll(e.target.value ? Number(e.target.value) : null)} />
              </label>
              <label>
                Hands
                <input type="number" value={hands} onChange={(e) => setHands(Number(e.target.value))} />
              </label>
              <label>
                Hands/hour
                <input type="number" value={handsPerHour} onChange={(e) => setHandsPerHour(Number(e.target.value))} />
              </label>
              <label>
                Seed
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
                Randomize seed each run
                <input type="checkbox" checked={randomizeSeedEachRun} onChange={(e) => setRandomizeSeedEachRun(e.target.checked)} />
              </label>
              <label className="toggle">
                Debug log
                <input type="checkbox" checked={debugLog} onChange={(e) => setDebugLog(e.target.checked)} />
              </label>
              {debugLog && (
                <label>
                  Debug hands
                  <input type="number" min={1} max={500} value={debugLogHands} onChange={(e) => setDebugLogHands(Number(e.target.value))} />
                </label>
              )}
            </div>
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
                  <div className="progress-bar" style={{ width: `${Math.min(progress.progress * 100, 100)}%` }} />
                  <div className="progress-label">
                    {progress.hands_done.toLocaleString()} / {progress.hands_total.toLocaleString()} rounds
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
                      {evPer100 === null
                        ? "n/a"
                        : showUnits
                          ? (evPer100 / unitSize).toFixed(2) + " u"
                          : "$" + evPer100.toFixed(2)}
                    </div>
                    <div className="sub">
                      EV/round:{" "}
                      {evPer100 === null
                        ? "n/a"
                        : showUnits
                          ? (evPer100 / unitSize / 100).toFixed(4) + " u"
                          : "$" + (evPer100 / 100).toFixed(4)}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="label">SD / 100 rounds</div>
                    <div className="value">
                      {stdevPer100 === null
                        ? "n/a"
                        : showUnits
                          ? (stdevPer100 / unitSize).toFixed(2) + " u"
                          : "$" + stdevPer100.toFixed(2)}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="label" title="Rounds until EV equals 1 SD.">N0 (rounds)</div>
                    <div className="value">{result ? result.n0_hands.toFixed(0) : "n/a"}</div>
                  </div>
                  <div className="metric">
                    <div className="label" title="Score proxy = 100 * (EV^2 / variance)">
                      Score (EV/Var proxy)
                    </div>
                    <div className="value">{result ? result.score.toFixed(4) : "n/a"}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Equivalent table time</div>
                    <div className="value">{result ? formatHours(result.hours_played) : "n/a"}</div>
                  </div>
                  <div className="metric">
                    <div className="label">RoR</div>
                    <div className="value" title={result?.ror === null || result?.ror === undefined ? "Requires bankroll and positive EV." : ""}>
                      {result ? formatRor(result.ror) : "n/a"}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="label">Bet Average (units)</div>
                    <div className="value">{avgInitialBetUnits !== null ? avgInitialBetUnits.toFixed(2) + " u" : "n/a"}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Win rate (units/hour)</div>
                    <div className="value">{winRateUnits !== null ? winRateUnits.toFixed(2) + " u/hr" : "n/a"}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Win rate ($/hour)</div>
                    <div className="value">{winRateDollars !== null ? "$" + winRateDollars.toFixed(2) : "n/a"}</div>
                  </div>
                  {showAdvanced && (
                    <div className="metric">
                      <div className="label">DI</div>
                      <div className="value">{result ? result.di.toFixed(5) : "n/a"}</div>
                    </div>
                  )}
                </div>
                <div className="toggle-row">
                  <label className="toggle">
                    Show advanced metrics
                    <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
                  </label>
                </div>
                {status === "running" && progress?.hands_done ? (
                  <div className="muted">
                    Showing estimated metrics from {progress.hands_done.toLocaleString()} rounds.
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">Session Outcomes (simulated)</div>
            <div className="session-controls">
              <label>
                Sessions
                <input type="number" min={1} max={5} value={sessionCount} onChange={(e) => setSessionCount(Number(e.target.value))} />
              </label>
              <label>
                Sigma band
                <input type="number" step="0.5" min={0.5} max={3} value={sessionSigma} onChange={(e) => setSessionSigma(Number(e.target.value))} />
              </label>
              <label>
                Points
                <input type="number" min={20} max={200} value={sessionPoints} onChange={(e) => setSessionPoints(Number(e.target.value))} />
              </label>
            </div>
            {!sessionSvg ? (
              <div className="muted">Run a simulation to generate session paths.</div>
            ) : (
              <svg viewBox={`0 0 ${sessionSvg.width} ${sessionSvg.height}`} className="session-chart">
                <path d={sessionSvg.bandPath} fill="rgba(31, 138, 112, 0.18)" stroke="none" />
                <path d={sessionSvg.expectedPath} fill="none" stroke="rgba(31, 138, 112, 0.9)" strokeWidth="2" />
                {sessionSvg.linePaths.map((path, idx) => (
                  <path key={idx} d={path} fill="none" stroke="rgba(225, 107, 59, 0.7)" strokeWidth="1.5" />
                ))}
              </svg>
            )}
            <div className="muted">
              Simulated paths use a normal approximation based on EV and SD; the shaded band shows +/- {sessionSigma} SD around expected value.
            </div>
          </div>

          <details className="card">
            <summary className="card-title">TC Histograms</summary>
            <div className="charts">
              {result?.tc_histogram && renderHistogram(result.tc_histogram, "TC Histogram (raw)")}
              {result?.tc_histogram_est && JSON.stringify(result.tc_histogram_est) !== JSON.stringify(result.tc_histogram) &&
                renderHistogram(result.tc_histogram_est, "TC Histogram (estimated)")}
            </div>
          </details>

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
                <button key={preset.id} className="preset-item" onClick={() => handleLoadPreset(preset)}>
                  <div>
                    <strong>{preset.name}</strong>
                    <div className="muted">{preset.type}</div>
                  </div>
                  <div className="tags">{preset.tags.join(", ")}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

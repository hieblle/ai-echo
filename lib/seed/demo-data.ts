/**
 * Phase 2 demo data generator (SPEC.md §13 Phase 2, §16.3).
 *
 * Generates deterministic synthetic survey responses and participation stats
 * for the three §16.3 demo orgs over a caller-supplied window of consecutive
 * ISO weeks — tuned so the trigger engine (SPEC.md §11) fires EXACTLY the
 * intended story and nothing else:
 *
 * - Merlin (healthy): only R5 (context "copilot365") — the paid Copilot
 *   licence is barely used (W1.2 share < 15 %); Marketing (headcount 4) is
 *   the k-anonymity suppression showcase.
 * - SPAR: only R4 (context "prompt_engineering") and R6 (context "strategy"
 *   — employee M5.1 ≈ 3.8 vs leadership F6 ≈ 8.2).
 * - REWE (struggling): only R1, R3 and R7 — adoption < 0.5 every week, a
 *   strictly declining sentiment and participation < 0.4 from week 5 onward.
 *   Trust stays ≥ 5.5 so R2 does NOT fire.
 *
 * All trend anomalies are keyed off the ABSOLUTE week index, so extending the
 * window ("Woche simulieren") keeps every anomaly alive and never rewrites
 * history. Free-text answers carry NO department (SPEC.md §7): per-lead or
 * small-team texts would be personally attributable, so `kind: "text"` rows
 * are emitted org-level only.
 *
 * Pure and fully deterministic: an inline xmur3 + mulberry32 PRNG seeded from
 * `(org, week)`; no Math.random, no Date.now — weeks come in as parameters.
 * The weekly question set is the REAL org draw from `pickWeeklyQuestions`
 * (W1.1 anchored via WEEKLY_ANCHOR_CODES per DECISIONS D2.10, last week's
 * codes excluded), so generated codes match the rotation the runner uses.
 */

import type {
  AnswerValue,
  Department,
  NewSurveyResponse,
  Organization,
  OrgToolSetting,
  ParticipationStat,
  Question,
  RoleScope,
} from "@/lib/types";
import { previousIsoWeek } from "@/lib/domain/isoWeek";
import {
  WEEKLY_ANCHOR_CODES,
  pickWeeklyQuestions,
} from "@/lib/domain/rotation";
import { TOOL_CATALOG, questionsFor } from "./questions";
import {
  DEMO_ORGS,
  DEMO_ORG_DEPARTMENTS,
  DEMO_ORG_HEADCOUNTS,
  DEMO_ORG_TOOL_SETTINGS,
  MERLIN_ORG_ID,
  REWE_ORG_ID,
  SPAR_ORG_ID,
} from "./orgs-demo";

// --- Deterministic randomness (inline, no Math.random / Date.now) -----------

type Rng = () => number;

/** xmur3 string hash — seeds mulberry32; reproducible, not cryptographic. */
function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG — floats in [0, 1), deterministic per seed. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRng(seedString: string): Rng {
  return mulberry32(xmur3(seedString)());
}

// --- Small pure helpers ------------------------------------------------------

/** [value, weight] pairs; weights need not sum to 1. */
type Dist = readonly (readonly [string, number])[];

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`demo-data: missing ${what}`);
  return value;
}

function shuffleInPlace<T>(rng: Rng, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
}

function pickFrom<T>(rng: Rng, items: readonly T[]): T {
  return required(items[Math.floor(rng() * items.length)], "pool entry");
}

function pickWeighted(rng: Rng, dist: Dist, exclude: readonly string[] = []): string {
  const candidates = dist.filter(([value]) => !exclude.includes(value));
  const pool = candidates.length > 0 ? candidates : dist;
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of pool) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return required(pool[pool.length - 1], "weighted entry")[0];
}

function pickDistinctWeighted(
  rng: Rng,
  dist: Dist,
  count: number,
  exclude: readonly string[] = [],
): string[] {
  const picked: string[] = [];
  const available = dist.filter(([value]) => !exclude.includes(value));
  while (picked.length < count && picked.length < available.length) {
    picked.push(pickWeighted(rng, available, picked));
  }
  return picked;
}

/**
 * Quota allocation (largest remainder): returns exactly `count` values whose
 * per-value counts match the weights to within < 1 — this is what makes the
 * dictated shares (adoption, tool usage, training wishes) hold every week
 * instead of drifting with sampling noise. The result is shuffled.
 */
function allocateByShares(rng: Rng, count: number, dist: Dist): string[] {
  if (count === 0) return [];
  const totalWeight = dist.reduce((sum, [, weight]) => sum + weight, 0);
  if (dist.length === 0 || totalWeight <= 0) {
    throw new Error("allocateByShares needs at least one positive weight");
  }
  const cells = dist.map(([value, weight], index) => {
    const exact = (count * weight) / totalWeight;
    return { value, index, count: Math.floor(exact), fraction: exact % 1 };
  });
  let assigned = cells.reduce((sum, cell) => sum + cell.count, 0);
  const byFraction = [...cells].sort(
    (a, b) => b.fraction - a.fraction || a.index - b.index,
  );
  for (let i = 0; assigned < count; i = (i + 1) % byFraction.length) {
    required(byFraction[i], "quota cell").count += 1;
    assigned += 1;
  }
  const result: string[] = [];
  for (const cell of cells) {
    for (let i = 0; i < cell.count; i++) result.push(cell.value);
  }
  shuffleInPlace(rng, result);
  return result;
}

/**
 * `count` integer scale values in [min, max] whose SUM equals
 * round(mean × count) exactly (clamped to the feasible range) — the achieved
 * mean deviates from the target by at most 0.5/count. Combined with the FIXED
 * non-user counts (see OrgDemoProfile.nonUserCount) this makes REWE's
 * strictly-declining sentiment and the zigzag guards of the healthy orgs hold
 * by construction, not by luck. Values are diffused ±1 (sum-preserving) for a
 * natural-looking spread.
 */
function allocateScaleValues(
  rng: Rng,
  count: number,
  mean: number,
  min: number,
  max: number,
): number[] {
  if (count === 0) return [];
  const targetSum = Math.min(
    max * count,
    Math.max(min * count, Math.round(mean * count)),
  );
  const base = Math.floor(targetSum / count);
  let remainder = targetSum - base * count;
  const values = new Array<number>(count).fill(base);
  for (let i = 0; i < count && remainder > 0; i++, remainder--) {
    values[i] = base + 1;
  }
  for (let step = 0; step < count * 3; step++) {
    const i = Math.floor(rng() * count);
    const j = Math.floor(rng() * count);
    const vi = required(values[i], "scale value");
    const vj = required(values[j], "scale value");
    if (i !== j && vi < max && vj > min) {
      values[i] = vi + 1;
      values[j] = vj - 1;
    }
  }
  shuffleInPlace(rng, values);
  return values;
}

/** Deterministic ~`share` subset of `items` (shuffled copy, quota-sized). */
function takeShare<T>(rng: Rng, items: readonly T[], share: number): T[] {
  const count = Math.round(items.length * share);
  const copy = [...items];
  shuffleInPlace(rng, copy);
  return copy.slice(0, count);
}

/**
 * W4.1 choice values by "relief level" 0..4 — the KPI engine maps them onto
 * 0/2,5/5/7,5/10 (SPEC.md §10), i.e. mapped value = 2.5 × level. Generating
 * W4.1 as an exact-sum level allocation gives the sentiment index the same
 * sum-level control as the W4.2 scale.
 */
const W41_LEVEL_VALUES = [
  "strong_strain",
  "some_strain",
  "neutral",
  "some_relief",
  "strong_relief",
] as const;

/**
 * Cap share for any single M3.2 training topic that is NOT the org's intended
 * R4 anomaly: kept strictly below 0.28 (the R4 threshold is > 0.3), so no
 * accidental R4 fires — and because EVERY monthly cycle is capped, the bound
 * also holds pooled over multiple cycles after simulated weeks.
 */
const M32_TOPIC_CAP_SHARE = 0.27;

// --- Org demo profiles (targets behind the dictated anomalies) --------------

interface OrgDemoProfile {
  /** Weekly participation target by ABSOLUTE week index (stable under
   * window extension — "Woche simulieren" must not rewrite the trend). */
  weeklyParticipation: (weekIndex: number) => number;
  /**
   * FIXED number of short-pulse non-users per cycle (≈ 10 % of respondents).
   * A fixed count keeps the undrawn-week W4.1/W4.2 sample size — and with it
   * the sentiment quantization grid — constant across weeks (see R3 notes).
   */
  nonUserCount: number;
  /** W1.1 distribution among tool USERS ("none" = quiet week, drives adoption). */
  w11UserDist: Dist;
  /** W1.2 most-used-tool shares (also the O2 main tool distribution). Every
   * share except an intended R5 anomaly stays clearly above 0.25. */
  toolDist: Dist;
  w13YesRate: number;
  w21Dist: Dist;
  w23Mean: number;
  w31Dist: Dist;
  w32Dist: Dist;
  w33Mean: number;
  /**
   * Constant W4.1 target level (0..4; mapped mean = 2.5 × level). Chosen so
   * nonUserCount × level is an integer — undrawn weeks then reproduce the
   * EXACT same W4.1 mean every week and W4.2 alone moves the sentiment index.
   */
  w41Level: number;
  /** W4.2 target mean by ABSOLUTE week index. */
  w42Mean: (weekIndex: number) => number;
  /** Share of respondents answering optional weekly free texts. */
  weeklyTextRate: number;
  monthly: {
    /** Share of the week's respondents also completing the monthly survey. */
    respondentShare: number;
    m11BaseHours: number;
    m13Mean: number;
    toolUsefulness: Record<string, number>;
    toolUsesPerWeek: Record<string, number>;
    m31Mean: number;
    m32PromptRate: number;
    m32NoneRate: number;
    m32TopicDist: Dist;
    m33YesRate: number;
    m41Mean: number;
    m42Dist: Dist;
    m51Mean: number;
    m52Mean: number;
    m61Mean: number;
    textRate: number;
  };
  leadership: {
    f2Mean: number;
    f6Mean: number;
    f7Mean: number;
    textRate: number;
  };
  onboarding: {
    share: number;
    /** Org department id → closest O1 catalog value. */
    o1ByDepartment: Record<string, string>;
    o3UserDist: Dist;
    o4Mean: number;
    o5Dist: Dist;
    secondToolRate: number;
  };
  /** German free-text pools reflecting the §16.3 use-case focus. */
  snippets: {
    helpful: string[];
    concern: string[];
    wish: string[];
    opportunity: string[];
    tried: string[];
    leadSuccess: string[];
    leadObstacle: string[];
  };
}

/**
 * Healthy-org guard: the W4.2 target zigzags ±0.3 around the base, so the
 * sentiment index strictly alternates week over week — three consecutive
 * declines (R3) are structurally impossible at ANY horizon.
 */
function zigzag(base: number): (weekIndex: number) => number {
  return (weekIndex) => base + (weekIndex % 2 === 0 ? 0.3 : -0.3);
}

const MERLIN_PROFILE: OrgDemoProfile = {
  weeklyParticipation: () => 0.75,
  nonUserCount: 4,
  // W1.1 is anchored: adoption ≈ 0.8 × users/(users+4) ≈ 0.7 EVERY week.
  w11UserDist: [
    ["none", 0.2],
    ["1_2", 0.16],
    ["3_5", 0.27],
    ["daily", 0.23],
    ["multiple_daily", 0.14],
  ],
  // Copilot licence paid but barely used (< 15 % → R5); the other paid tools
  // stay far above the 20 % threshold.
  toolDist: [
    ["copilot365", 0.08],
    ["chatgpt", 0.55],
    ["deepl_write", 0.37],
  ],
  w13YesRate: 0.3,
  w21Dist: [
    ["none", 0.08],
    ["lt_1", 0.17],
    ["1_3", 0.35],
    ["3_5", 0.25],
    ["5_10", 0.12],
    ["gt_10", 0.03],
  ],
  w23Mean: 7.4,
  w31Dist: [
    ["never", 0.25],
    ["rarely", 0.4],
    ["sometimes", 0.25],
    ["often", 0.08],
    ["almost_always", 0.02],
  ],
  w32Dist: [
    ["yes", 0.12],
    ["no", 0.75],
    ["dont_know", 0.13],
  ],
  w33Mean: 7.2,
  w41Level: 3, // mapped 7.5; 4 non-users × 3 = 12 → exact every undrawn week
  w42Mean: zigzag(7.3),
  weeklyTextRate: 0.3,
  monthly: {
    respondentShare: 0.7,
    m11BaseHours: 12,
    m13Mean: 2.4,
    toolUsefulness: { copilot365: 3, chatgpt: 8.2, deepl_write: 8.4 },
    toolUsesPerWeek: { copilot365: 1, chatgpt: 7, deepl_write: 6 },
    m31Mean: 6.8,
    m32PromptRate: 0.2,
    m32NoneRate: 0.15,
    m32TopicDist: [
      ["basics", 0.12],
      ["data_analysis", 0.18],
      ["automation", 0.22],
      ["privacy_legal", 0.18],
      ["creative", 0.15],
      ["ethics", 0.15],
    ],
    m33YesRate: 0.15,
    m41Mean: 7.6,
    m42Dist: [
      ["regularly", 0.3],
      ["sometimes", 0.45],
      ["rarely", 0.2],
      ["never", 0.05],
    ],
    m51Mean: 6.9,
    m52Mean: 7.0,
    m61Mean: 8.4,
    textRate: 0.3,
  },
  // Gaps ≤ 0.5 on every pair — R6 must stay a SPAR-only anomaly.
  leadership: { f2Mean: 7.6, f6Mean: 7.4, f7Mean: 6.6, textRate: 0.5 },
  onboarding: {
    share: 0.9,
    o1ByDepartment: {
      "vertrieb-export": "sales",
      "technik-entwicklung": "rnd",
      "verwaltung-finanzen": "finance",
      marketing: "marketing",
      "service-innendienst": "support",
    },
    o3UserDist: [
      ["lt_1m", 0.05],
      ["1_3m", 0.15],
      ["3_6m", 0.25],
      ["6_12m", 0.3],
      ["gt_1y", 0.25],
    ],
    o4Mean: 6.2,
    o5Dist: [
      ["translation", 0.25],
      ["emails", 0.2],
      ["writing", 0.2],
      ["summaries", 0.15],
      ["research", 0.1],
      ["presentations", 0.05],
      ["meeting_notes", 0.05],
    ],
    secondToolRate: 0.4,
  },
  snippets: {
    helpful: [
      "Englische Angebotskorrespondenz für einen Exportkunden vorformuliert",
      "Technische Dokumentation für eine neue Befeuchtungsanlage strukturiert",
      "Service-Bericht aus Stichworten in einen sauberen Text verwandelt",
      "Übersetzung eines Wartungsvertrags ins Französische vorbereitet",
      "Lange Kunden-E-Mails aus dem Export in Minuten zusammengefasst",
      "Prüfprotokoll aus der Messtechnik verständlich aufbereitet",
    ],
    concern: [
      "Fachbegriffe aus der Messtechnik werden immer wieder falsch übersetzt",
      "Unklar, welche Kundendaten in die Tools eingegeben werden dürfen",
      "Technische Angaben müssen doppelt geprüft werden, das kostet Zeit",
      "Copilot findet unsere internen Ablagen oft nicht",
    ],
    wish: [
      "Ein internes Glossar für Fachbegriffe im Übersetzungs-Workflow",
      "Klare Vorgaben, welche Daten eingegeben werden dürfen",
      "Mehr Schulungen speziell für den Vertriebsinnendienst",
      "Eine Anbindung der KI an unser ERP-System",
    ],
    opportunity: [
      "Schnellere Angebote in Landessprache für alle Exportmärkte",
      "Technische Doku könnte mehrsprachig fast automatisch entstehen",
      "Service-Berichte werden einheitlicher und schneller fertig",
      "Mehr Zeit für Beratung statt Schreibarbeit im Innendienst",
    ],
    tried: [
      "DeepL Write für Angebotstexte",
      "ChatGPT-Projekte für Servicefälle",
      "Diktierfunktion für Service-Berichte",
      "Copilot in Outlook kurz getestet",
    ],
    leadSuccess: [
      "Angebote gehen im Export deutlich schneller raus",
      "Service-Berichte sind einheitlicher und schneller fertig",
      "Weniger Rückfragen bei fremdsprachiger Korrespondenz",
      "Technische Doku entsteht in der halben Zeit",
    ],
    leadObstacle: [
      "Die Copilot-Lizenzen werden kaum genutzt",
      "Unsicherheit, welche Daten eingegeben werden dürfen",
      "Wenig Zeit für Schulungen im Tagesgeschäft",
      "Fachvokabular macht Übersetzungen fehleranfällig",
    ],
  },
};

const SPAR_PROFILE: OrgDemoProfile = {
  weeklyParticipation: () => 0.65,
  nonUserCount: 5,
  // Adoption ≈ 0.7 × users/(users+5) ≈ 0.63 every week — inside (0.5, 0.75).
  w11UserDist: [
    ["none", 0.3],
    ["1_2", 0.28],
    ["3_5", 0.25],
    ["daily", 0.12],
    ["multiple_daily", 0.05],
  ],
  // Every paid tool clearly above the R5 threshold (deepl_write raised to
  // 0.30 — at exactly 0.2 quota rounding dipped below the strict "< 0.2").
  toolDist: [
    ["copilot365", 0.28],
    ["chatgpt", 0.42],
    ["deepl_write", 0.3],
  ],
  w13YesRate: 0.25,
  w21Dist: [
    ["none", 0.15],
    ["lt_1", 0.25],
    ["1_3", 0.33],
    ["3_5", 0.17],
    ["5_10", 0.08],
    ["gt_10", 0.02],
  ],
  w23Mean: 6.6,
  w31Dist: [
    ["never", 0.15],
    ["rarely", 0.3],
    ["sometimes", 0.35],
    ["often", 0.15],
    ["almost_always", 0.05],
  ],
  w32Dist: [
    ["yes", 0.2],
    ["no", 0.65],
    ["dont_know", 0.15],
  ],
  w33Mean: 6.1,
  w41Level: 2.6, // mapped 6.5; 5 non-users × 2.6 = 13 → exact every undrawn week
  w42Mean: zigzag(6.4),
  weeklyTextRate: 0.3,
  monthly: {
    respondentShare: 0.7,
    m11BaseHours: 8,
    m13Mean: 1.6,
    toolUsefulness: { copilot365: 5.5, chatgpt: 7.5, deepl_write: 7 },
    toolUsesPerWeek: { copilot365: 3, chatgpt: 5, deepl_write: 3 },
    m31Mean: 5.6,
    // ~50 % of all M3.2 answers include prompt_engineering (> 35 % → R4);
    // every OTHER topic is capped below 28 % (see M32_TOPIC_CAP_SHARE).
    m32PromptRate: 0.55,
    m32NoneRate: 0.1,
    m32TopicDist: [
      ["basics", 0.2],
      ["data_analysis", 0.2],
      ["automation", 0.15],
      ["privacy_legal", 0.2],
      ["creative", 0.15],
      ["ethics", 0.1],
    ],
    m33YesRate: 0.12,
    m41Mean: 6.4,
    m42Dist: [
      ["regularly", 0.15],
      ["sometimes", 0.4],
      ["rarely", 0.3],
      ["never", 0.15],
    ],
    // Perception gap: employees see no clear strategy (M5.1 ≈ 3.8) while
    // leadership rates its communication F6 ≈ 8.2 → gap > 3 → R6 (strategy
    // pair only; competence and benefit stay well below 3).
    m51Mean: 3.8,
    m52Mean: 4.4,
    m61Mean: 7.0,
    textRate: 0.3,
  },
  leadership: { f2Mean: 7.8, f6Mean: 8.2, f7Mean: 7.4, textRate: 0.5 },
  onboarding: {
    share: 0.9,
    o1ByDepartment: {
      "einkauf-cm": "operations",
      marketing: "marketing",
      "it-digital": "it",
      hr: "hr",
      "finanzen-controlling": "finance",
      logistikplanung: "operations",
    },
    o3UserDist: [
      ["lt_1m", 0.1],
      ["1_3m", 0.2],
      ["3_6m", 0.3],
      ["6_12m", 0.25],
      ["gt_1y", 0.15],
    ],
    o4Mean: 5.4,
    o5Dist: [
      ["writing", 0.2],
      ["emails", 0.2],
      ["research", 0.15],
      ["summaries", 0.15],
      ["translation", 0.1],
      ["data_analysis", 0.1],
      ["presentations", 0.1],
    ],
    secondToolRate: 0.35,
  },
  snippets: {
    helpful: [
      "Lieferantenkorrespondenz zu Konditionen vorformuliert",
      "Aktionstexte für das Flugblatt in drei Varianten erstellt",
      "Stellenanzeige für eine Marktleitung überarbeitet",
      "Sortimentsdaten für den Jour fixe zusammengefasst",
      "Antwort auf eine Lieferantenreklamation sauber formuliert",
      "Kategorie-Analyse als Management-Summary aufbereitet",
    ],
    concern: [
      "Aktionstexte klingen oft zu generisch und müssen nachgeschärft werden",
      "Zahlen aus Excel-Tabellen werden manchmal falsch übernommen",
      "Unklar, was mit Lieferantendaten in den Tools erlaubt ist",
      "Es fehlt eine offizielle Freigabe, welche Tools erlaubt sind",
    ],
    wish: [
      "Eine Vorlagen-Bibliothek für Aktions- und Werbetexte",
      "Schulung zu Prompt Engineering für den Einkauf",
      "Klare Kommunikation der KI-Strategie durch die Leitung",
      "Anbindung an unsere Sortimentsdatenbank",
    ],
    opportunity: [
      "Schnellere Aktionsplanung durch vorbereitete Textbausteine",
      "Stellenanzeigen könnten in Minuten statt Stunden entstehen",
      "Lieferantenkommunikation wird professioneller und konsistenter",
      "Mehr Zeit für Verhandlungen statt Schreibarbeit",
    ],
    tried: [
      "Copilot in Excel für die Aktionsplanung",
      "ChatGPT für Stellenanzeigen",
      "DeepL für Lieferantenmails auf Italienisch",
      "Copilot-Zusammenfassung in Teams",
    ],
    leadSuccess: [
      "Aktionstexte entstehen deutlich schneller",
      "Stellenanzeigen sind schneller online und einheitlicher",
      "Lieferantenanfragen werden schneller beantwortet",
    ],
    leadObstacle: [
      "Viele im Team wissen nicht, was offiziell erlaubt ist",
      "Prompt-Wissen fehlt, Ergebnisse schwanken stark",
      "Die Strategie ist oben klar, kommt aber unten nicht an",
    ],
  },
};

const REWE_PROFILE: OrgDemoProfile = {
  // < 0.4 from week index 4 onward — R7 fires and STAYS fired when the
  // window is extended (absolute keying, plateau at 0.33).
  weeklyParticipation: (weekIndex) => (weekIndex <= 3 ? 0.45 : 0.33),
  nonUserCount: 4,
  // Adoption ≈ 0.45 × users/(users+4) ≈ 0.38–0.40 < 0.5 in EVERY week (→ R1)
  // at any horizon (participation plateaus, the shares are quota-exact).
  w11UserDist: [
    ["none", 0.55],
    ["1_2", 0.2],
    ["3_5", 0.15],
    ["daily", 0.07],
    ["multiple_daily", 0.03],
  ],
  // internal_ai raised to 0.28 — at exactly 0.2 the pooled share dipped
  // below the strict "< 0.2" threshold after simulated weeks (R5 misfire).
  toolDist: [
    ["copilot365", 0.3],
    ["chatgpt", 0.42],
    ["internal_ai", 0.28],
  ],
  w13YesRate: 0.12,
  w21Dist: [
    ["none", 0.35],
    ["lt_1", 0.3],
    ["1_3", 0.22],
    ["3_5", 0.09],
    ["5_10", 0.03],
    ["gt_10", 0.01],
  ],
  w23Mean: 5.6,
  // Inverted W3.1 mean ≈ 6.2 — combined trust index stays ≥ 5 (R2 must NOT fire).
  w31Dist: [
    ["never", 0.15],
    ["rarely", 0.35],
    ["sometimes", 0.35],
    ["often", 0.12],
    ["almost_always", 0.03],
  ],
  w32Dist: [
    ["yes", 0.3],
    ["no", 0.5],
    ["dont_know", 0.2],
  ],
  w33Mean: 6.2,
  w41Level: 1.75, // mapped 4.375; 4 non-users × 1.75 = 7 → exact every undrawn week
  // Strictly declining sentiment (→ R3): slope 0.25/week moves the 4-answer
  // undrawn weeks by EXACTLY one sum point, so the decline is strict by
  // construction until the floor (~week 20) — it survives "Woche simulieren".
  w42Mean: (weekIndex) => Math.max(2.0, 7.0 - 0.25 * weekIndex),
  weeklyTextRate: 0.3,
  monthly: {
    respondentShare: 0.7,
    m11BaseHours: 5,
    m13Mean: 0.6,
    toolUsefulness: { copilot365: 4.5, chatgpt: 6.5, internal_ai: 3.5 },
    toolUsesPerWeek: { copilot365: 2, chatgpt: 4, internal_ai: 1 },
    m31Mean: 4.8,
    // NO R4 at REWE: prompt stays ≈ 0.18, every other topic is capped < 0.28.
    m32PromptRate: 0.2,
    m32NoneRate: 0.12,
    m32TopicDist: [
      ["basics", 0.3],
      ["data_analysis", 0.15],
      ["automation", 0.1],
      ["privacy_legal", 0.2],
      ["creative", 0.1],
      ["ethics", 0.15],
    ],
    m33YesRate: 0.08,
    m41Mean: 5.4,
    m42Dist: [
      ["regularly", 0.08],
      ["sometimes", 0.3],
      ["rarely", 0.38],
      ["never", 0.24],
    ],
    m51Mean: 4.4,
    m52Mean: 4.0,
    m61Mean: 5.6,
    textRate: 0.3,
  },
  // F6 − M5.1 ≈ 2.0 ≤ 2.5 on every pair: R6 stays a SPAR-only anomaly.
  leadership: { f2Mean: 5.8, f6Mean: 6.4, f7Mean: 5.2, textRate: 0.5 },
  onboarding: {
    share: 0.9,
    o1ByDepartment: {
      einkauf: "operations",
      marketing: "marketing",
      it: "it",
      hr: "hr",
      controlling: "finance",
      "supply-chain": "operations",
    },
    o3UserDist: [
      ["lt_1m", 0.2],
      ["1_3m", 0.3],
      ["3_6m", 0.25],
      ["6_12m", 0.15],
      ["gt_1y", 0.1],
    ],
    o4Mean: 4.6,
    o5Dist: [
      ["summaries", 0.25],
      ["writing", 0.2],
      ["research", 0.2],
      ["emails", 0.15],
      ["data_analysis", 0.1],
      ["meeting_notes", 0.1],
    ],
    secondToolRate: 0.25,
  },
  snippets: {
    helpful: [
      "Sortimentsanalyse für die Regionstagung zusammengefasst",
      "Internen Bericht zum Lieferantenwechsel strukturiert",
      "Protokoll der Abstimmungsrunde in klare Stichpunkte verwandelt",
      "Kennzahlen-Kommentar für das Monatsreporting vorformuliert",
      "Marktdaten für eine Sortimentsentscheidung verdichtet",
    ],
    concern: [
      "Die interne KI-Lösung ist langsam und oft nicht erreichbar",
      "Unklare Vorgaben, welche Tools überhaupt genutzt werden dürfen",
      "Antworten klingen überzeugend, stimmen inhaltlich aber oft nicht",
      "Ohne Schulung fühlt sich die Nutzung wie ein Ratespiel an",
      "Sorge, dass Berichte ungeprüft übernommen werden",
    ],
    wish: [
      "Endlich eine klare KI-Strategie kommunizieren",
      "Grundlagenschulung für alle im Zentralbereich",
      "Bessere Performance der internen KI-Lösung",
      "Konkrete Anwendungsfälle für das Controlling zeigen",
    ],
    opportunity: [
      "Sortimentsanalysen könnten deutlich schneller entstehen",
      "Interne Berichte ließen sich stark standardisieren",
      "Routine-Zusammenfassungen würden viel Zeit sparen",
    ],
    tried: [
      "Die interne KI-Lösung für einen Bericht getestet",
      "ChatGPT für eine Wettbewerbsrecherche",
      "Copilot-Zusammenfassung in Word",
    ],
    leadSuccess: [
      "Einzelne Berichte entstehen schneller als früher",
      "Erste brauchbare Zusammenfassungen im Controlling",
    ],
    leadObstacle: [
      "Kaum jemand nutzt die Tools regelmäßig",
      "Es fehlt eine klar kommunizierte Strategie",
      "Die Stimmung im Team kippt spürbar",
      "Teilnahme an Umfragen und Schulungen sinkt",
    ],
  },
};

const ORG_PROFILES: Record<string, OrgDemoProfile> = {
  [MERLIN_ORG_ID]: MERLIN_PROFILE,
  [SPAR_ORG_ID]: SPAR_PROFILE,
  [REWE_ORG_ID]: REWE_PROFILE,
};

/** German course names for M3.3 "Ja → Welchen?". */
const COURSE_SNIPPETS = [
  "KI-Grundlagen der dbrains academy",
  "Prompt-Engineering-Workshop",
  "Interne Copilot-Einführung",
  "Online-Kurs zu KI im Büroalltag",
];

const TOOL_LABEL_BY_VALUE = new Map(
  TOOL_CATALOG.map((choice) => [choice.value, choice.label]),
);

// --- Weekly draw (must match the real rotation) ------------------------------

/**
 * The org-level weekly draw for `weeks[weekIndex]`, reproducing the rotation
 * chain the app applies: W1.1 is anchored in every draw (WEEKLY_ANCHOR_CODES,
 * DECISIONS D2.10) and every week excludes the PREVIOUS week's draw codes
 * (SPEC.md §9; anchors are exempt), starting with no exclusion at `weeks[0]`.
 */
function weeklyDrawFor(
  orgId: string,
  weeks: readonly string[],
  weekIndex: number,
): Question[] {
  const pool = questionsFor("weekly");
  let draw: Question[] = [];
  let previousCodes: readonly string[] = [];
  for (let i = 0; i <= weekIndex; i++) {
    const isoWeek = required(weeks[i], `weeks[${i}]`);
    draw = pickWeeklyQuestions({
      pool,
      orgId,
      isoWeek,
      exclude: i > 0 ? previousCodes : [],
      anchors: WEEKLY_ANCHOR_CODES,
    });
    previousCodes = draw.map((question) => question.code);
  }
  return draw;
}

/** Weeks must be consecutive ISO weeks — the rotation's no-repeat exclusion
 * and the trend anomalies only make sense on a contiguous window. */
function assertConsecutiveWeeks(weeks: readonly string[]): void {
  if (weeks.length === 0) throw new Error("demo-data: weeks must not be empty");
  for (let i = 1; i < weeks.length; i++) {
    const current = required(weeks[i], `weeks[${i}]`);
    const previous = required(weeks[i - 1], `weeks[${i - 1}]`);
    if (previousIsoWeek(current) !== previous) {
      throw new Error(
        `demo-data: weeks must be consecutive ISO weeks ("${previous}" → "${current}")`,
      );
    }
  }
}

// --- Generator ----------------------------------------------------------------

interface DemoRespondent {
  department_id: string;
  nonUser: boolean;
}

export interface GenerateOrgWeekArgs {
  org: Organization;
  departments: Department[];
  /** Department id → headcount (see DEMO_ORG_HEADCOUNTS). */
  headcounts: Record<string, number>;
  toolSettings: OrgToolSetting[];
  /** Chronological, consecutive ISO weeks; the window the demo covers. */
  weeks: string[];
  weekIndex: number;
}

export interface GeneratedDemoData {
  responses: NewSurveyResponse[];
  participation: ParticipationStat[];
}

/** The non-user short pulse (SPEC.md §9): answered EVERY week regardless of
 * the draw. W1.1 is additionally anchored in every draw (D2.10), so the
 * weekly adoption rate always rests on the full respondent sample. */
const SHORT_PULSE_CODES = new Set(["W1.1", "W4.1", "W4.2"]);

/**
 * Generates one org-week of demo responses + participation stats.
 * Deterministic: same args → same output (PRNG seeded from org and week).
 * All trends are keyed by ABSOLUTE week index, so extending `weeks` later
 * ("Woche simulieren") never changes already-generated weeks.
 */
export function generateOrgWeek(args: GenerateOrgWeekArgs): GeneratedDemoData {
  const { org, departments, headcounts, toolSettings, weeks, weekIndex } = args;
  assertConsecutiveWeeks(weeks);
  const isoWeek = required(weeks[weekIndex], `weeks[${weekIndex}]`);
  const profile = ORG_PROFILES[org.id];
  if (!profile) {
    throw new Error(
      `demo-data: no demo profile for org "${org.id}" — the generator covers the SPEC.md §16.3 demo orgs`,
    );
  }

  const rng = seededRng(`demo-data|${org.id}|${isoWeek}`);
  const responses: NewSurveyResponse[] = [];
  const participation: ParticipationStat[] = [];
  const totalHeadcount = departments.reduce(
    (sum, dept) => sum + (headcounts[dept.id] ?? 0),
    0,
  );
  const activeTools = toolSettings.filter((tool) => tool.active);

  const emit = (
    cycleId: string,
    departmentId: string | null,
    roleScope: RoleScope,
    questionCode: string,
    answer: AnswerValue,
  ): void => {
    responses.push({
      org_id: org.id,
      cycle_id: cycleId,
      // Free texts are the most re-identifiable answers (a per-lead F3/F4
      // row is n = 1): they NEVER carry a department (SPEC.md §7) — the
      // dashboard shows them org-level only. Other answers keep theirs.
      department_id: answer.kind === "text" ? null : departmentId,
      role_scope: roleScope,
      question_code: questionCode,
      answer,
      created_week: isoWeek,
    });
  };

  /** Respondents for a cycle: per-department counts with a small jitter. */
  const buildRespondents = (share: number, jitterAmplitude: number): DemoRespondent[] => {
    const list: DemoRespondent[] = [];
    for (const dept of departments) {
      const headcount = headcounts[dept.id] ?? 0;
      if (headcount <= 0) continue;
      const jitter = 1 - jitterAmplitude + rng() * 2 * jitterAmplitude;
      const completed = clampInt(headcount * share * jitter, 1, headcount);
      for (let i = 0; i < completed; i++) {
        list.push({ department_id: dept.id, nonUser: false });
      }
    }
    // Fixed non-user count (≈ 10 %) org-wide — constant across weeks so the
    // short-pulse sample size (and the sentiment grid) never wobbles.
    const nonUserCount = Math.min(list.length, Math.max(1, profile.nonUserCount));
    const indices = list.map((_, index) => index);
    shuffleInPlace(rng, indices);
    for (const index of indices.slice(0, nonUserCount)) {
      required(list[index], "respondent").nonUser = true;
    }
    return list;
  };

  // ---- Weekly pulse ---------------------------------------------------------

  const weeklyCycleId = `weekly-${isoWeek}`;
  const respondents = buildRespondents(
    profile.weeklyParticipation(weekIndex),
    0.05,
  );
  const users = respondents.filter((r) => !r.nonUser);
  const nonUsers = respondents.filter((r) => r.nonUser);

  const draw = weeklyDrawFor(org.id, weeks, weekIndex);
  const drawnCodes = new Set(draw.map((question) => question.code));

  const emitWeeklyChoiceRows = (
    code: string,
    answerers: readonly DemoRespondent[],
    dist: Dist,
  ): void => {
    const values = allocateByShares(rng, answerers.length, dist);
    answerers.forEach((respondent, index) => {
      emit(weeklyCycleId, respondent.department_id, "employee", code, {
        kind: "choice",
        value: required(values[index], `${code} value`),
      });
    });
  };

  const emitWeeklyScaleRows = (
    code: string,
    answerers: readonly DemoRespondent[],
    mean: number,
  ): void => {
    const values = allocateScaleValues(rng, answerers.length, mean, 1, 10);
    answerers.forEach((respondent, index) => {
      emit(weeklyCycleId, respondent.department_id, "employee", code, {
        kind: "scale",
        value: required(values[index], `${code} value`),
      });
    });
  };

  const emitWeeklyTextRows = (code: string, pool: readonly string[]): void => {
    for (const respondent of takeShare(rng, users, profile.weeklyTextRate)) {
      emit(weeklyCycleId, respondent.department_id, "employee", code, {
        kind: "text",
        value: pickFrom(rng, pool),
      });
    }
  };

  // Iterate the weekly pool in its stable order for reproducible rng usage.
  for (const question of questionsFor("weekly")) {
    const code = question.code;
    const isDrawn = drawnCodes.has(code);
    if (!isDrawn && !SHORT_PULSE_CODES.has(code)) continue;

    switch (code) {
      case "W1.1": {
        // Anchored → drawn every week; users answer with the org's usage
        // distribution, non-users always report "none" (short pulse).
        if (isDrawn) emitWeeklyChoiceRows(code, users, profile.w11UserDist);
        for (const respondent of nonUsers) {
          emit(weeklyCycleId, respondent.department_id, "employee", code, {
            kind: "choice",
            value: "none",
          });
        }
        break;
      }
      case "W1.2": {
        // requires_tool: only users see it.
        emitWeeklyChoiceRows(code, users, profile.toolDist);
        break;
      }
      case "W1.3": {
        const values = allocateByShares(rng, users.length, [
          ["yes", profile.w13YesRate],
          ["no", 1 - profile.w13YesRate],
        ]);
        users.forEach((respondent, index) => {
          const value = required(values[index], "W1.3 value");
          emit(
            weeklyCycleId,
            respondent.department_id,
            "employee",
            code,
            value === "yes"
              ? { kind: "choice", value, text: pickFrom(rng, profile.snippets.tried) }
              : { kind: "choice", value },
          );
        });
        break;
      }
      case "W2.1": {
        emitWeeklyChoiceRows(code, users, profile.w21Dist);
        break;
      }
      case "W2.2": {
        emitWeeklyTextRows(code, profile.snippets.helpful);
        break;
      }
      case "W2.3": {
        emitWeeklyScaleRows(code, users, profile.w23Mean);
        break;
      }
      case "W3.1": {
        emitWeeklyChoiceRows(code, users, profile.w31Dist);
        break;
      }
      case "W3.2": {
        const values = allocateByShares(rng, users.length, profile.w32Dist);
        users.forEach((respondent, index) => {
          const value = required(values[index], "W3.2 value");
          if (value === "yes") {
            const tool = pickWeighted(rng, profile.toolDist);
            emit(weeklyCycleId, respondent.department_id, "employee", code, {
              kind: "choice",
              value,
              text: TOOL_LABEL_BY_VALUE.get(tool) ?? tool,
            });
          } else {
            emit(weeklyCycleId, respondent.department_id, "employee", code, {
              kind: "choice",
              value,
            });
          }
        });
        break;
      }
      case "W3.3": {
        emitWeeklyScaleRows(code, users, profile.w33Mean);
        break;
      }
      case "W4.1": {
        // Exact-sum LEVEL allocation (constant target): undrawn weeks with
        // the fixed non-user sample reproduce the identical mean every week,
        // so only W4.2 moves the sentiment index (keeps R3 fully controlled).
        const answerers = isDrawn ? respondents : nonUsers;
        const levels = allocateScaleValues(
          rng,
          answerers.length,
          profile.w41Level,
          0,
          4,
        );
        answerers.forEach((respondent, index) => {
          emit(weeklyCycleId, respondent.department_id, "employee", code, {
            kind: "choice",
            value: required(
              W41_LEVEL_VALUES[required(levels[index], "W4.1 level")],
              "W4.1 value",
            ),
          });
        });
        break;
      }
      case "W4.2": {
        const answerers = isDrawn ? respondents : nonUsers;
        emitWeeklyScaleRows(code, answerers, profile.w42Mean(weekIndex));
        break;
      }
      case "W4.3": {
        emitWeeklyTextRows(code, profile.snippets.concern);
        break;
      }
      default:
        throw new Error(`demo-data: unhandled weekly question "${code}"`);
    }
  }

  participation.push({
    org_id: org.id,
    cycle_id: weeklyCycleId,
    template_key: "weekly",
    week: isoWeek,
    invited: totalHeadcount,
    completed: respondents.length,
  });

  // ---- Onboarding (baseline, first week of the window only) ------------------

  if (weekIndex === 0) {
    const onboardingCycleId = `onboarding-${isoWeek}`;
    const onboarders = buildRespondents(profile.onboarding.share, 0);
    const onboardingUsers = onboarders.filter((r) => !r.nonUser);

    // O1 — department (catalog value closest to the real org department; the
    // row's department_id carries the real department).
    for (const respondent of onboarders) {
      emit(onboardingCycleId, respondent.department_id, "employee", "O1", {
        kind: "choice",
        value:
          profile.onboarding.o1ByDepartment[respondent.department_id] ?? "other",
      });
    }

    // O2 — tools used (non-users pick the exclusive "none").
    const mainTools = allocateByShares(rng, onboardingUsers.length, profile.toolDist);
    onboardingUsers.forEach((respondent, index) => {
      const values = [required(mainTools[index], "O2 main tool")];
      if (rng() < profile.onboarding.secondToolRate) {
        values.push(pickWeighted(rng, profile.toolDist, values));
      }
      emit(onboardingCycleId, respondent.department_id, "employee", "O2", {
        kind: "choices",
        values,
      });
    });
    for (const respondent of onboarders.filter((r) => r.nonUser)) {
      emit(onboardingCycleId, respondent.department_id, "employee", "O2", {
        kind: "choices",
        values: ["none"],
      });
    }

    // O3 — usage duration ("not_yet" for non-users).
    const durations = allocateByShares(
      rng,
      onboardingUsers.length,
      profile.onboarding.o3UserDist,
    );
    onboardingUsers.forEach((respondent, index) => {
      emit(onboardingCycleId, respondent.department_id, "employee", "O3", {
        kind: "choice",
        value: required(durations[index], "O3 value"),
      });
    });
    for (const respondent of onboarders.filter((r) => r.nonUser)) {
      emit(onboardingCycleId, respondent.department_id, "employee", "O3", {
        kind: "choice",
        value: "not_yet",
      });
    }

    // O4 — self-assessed AI knowledge (everyone).
    const knowledge = allocateScaleValues(
      rng,
      onboarders.length,
      profile.onboarding.o4Mean,
      1,
      10,
    );
    onboarders.forEach((respondent, index) => {
      emit(onboardingCycleId, respondent.department_id, "employee", "O4", {
        kind: "scale",
        value: required(knowledge[index], "O4 value"),
      });
    });

    // O5 — main use cases (tool users only).
    for (const respondent of onboardingUsers) {
      const count = 1 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
      emit(onboardingCycleId, respondent.department_id, "employee", "O5", {
        kind: "choices",
        values: pickDistinctWeighted(rng, profile.onboarding.o5Dist, count),
      });
    }

    participation.push({
      org_id: org.id,
      cycle_id: onboardingCycleId,
      template_key: "onboarding",
      week: isoWeek,
      invited: totalHeadcount,
      completed: onboarders.length,
    });
  }

  // ---- Monthly deep-dive + leadership (every 4th week of the window) ---------

  if (weekIndex % 4 === 3) {
    const monthly = profile.monthly;
    const monthlyCycleId = `monthly-${isoWeek}`;

    // ~70 % of this week's respondents per department (modelled as tool users
    // — the responses table has no person link, so these are fresh rows).
    const monthlyRespondents: DemoRespondent[] = [];
    for (const dept of departments) {
      const weeklyCount = respondents.filter(
        (r) => r.department_id === dept.id,
      ).length;
      if (weeklyCount === 0) continue;
      const count = Math.max(1, Math.round(weeklyCount * monthly.respondentShare));
      for (let i = 0; i < count; i++) {
        monthlyRespondents.push({ department_id: dept.id, nonUser: false });
      }
    }
    const monthlyCount = monthlyRespondents.length;

    const emitMonthlyScale = (
      code: string,
      mean: number,
      min: number,
      max: number,
    ): void => {
      const values = allocateScaleValues(rng, monthlyCount, mean, min, max);
      monthlyRespondents.forEach((respondent, index) => {
        emit(monthlyCycleId, respondent.department_id, "employee", code, {
          kind: "scale",
          value: required(values[index], `${code} value`),
        });
      });
    };

    const emitMonthlyText = (
      code: string,
      pool: readonly string[],
      rate: number,
    ): void => {
      for (const respondent of takeShare(rng, monthlyRespondents, rate)) {
        emit(monthlyCycleId, respondent.department_id, "employee", code, {
          kind: "text",
          value: pickFrom(rng, pool),
        });
      }
    };

    // M1.1 — hours saved this month (plausible 2–30 h).
    for (const respondent of monthlyRespondents) {
      emit(monthlyCycleId, respondent.department_id, "employee", "M1.1", {
        kind: "number",
        value: clampInt(monthly.m11BaseHours * (0.4 + 1.2 * rng()), 2, 30),
      });
    }
    emitMonthlyScale("M1.3", monthly.m13Mean, -5, 5);
    emitMonthlyText("M1.4", profile.snippets.helpful, monthly.textRate);

    // M2.1 — tool matrix over the org's ACTIVE tools.
    for (const respondent of monthlyRespondents) {
      emit(monthlyCycleId, respondent.department_id, "employee", "M2.1", {
        kind: "tool_matrix",
        tools: activeTools.map((tool) => ({
          tool: tool.tool_value,
          usefulness: clampInt(
            (monthly.toolUsefulness[tool.tool_value] ?? 5) + (rng() * 3 - 1.5),
            1,
            10,
          ),
          uses_per_week: Math.max(
            0,
            Math.round(
              (monthly.toolUsesPerWeek[tool.tool_value] ?? 2) * (0.5 + rng()),
            ),
          ),
        })),
      });
    }

    emitMonthlyScale("M3.1", monthly.m31Mean, 1, 10);

    // M3.2 — training wishes. The org's intended R4 topic (prompt_engineering
    // at SPAR) comes from an exact quota; every OTHER topic is HARD-CAPPED
    // below M32_TOPIC_CAP_SHARE so no accidental R4 can fire (per cycle, and
    // therefore also pooled over multiple cycles).
    const noneFlags = allocateByShares(rng, monthlyCount, [
      ["none", monthly.m32NoneRate],
      ["topics", 1 - monthly.m32NoneRate],
    ]);
    const promptFlags = allocateByShares(rng, monthlyCount, [
      ["yes", monthly.m32PromptRate],
      ["no", 1 - monthly.m32PromptRate],
    ]);
    const topicCap = Math.max(
      1,
      Math.ceil(monthlyCount * M32_TOPIC_CAP_SHARE) - 1,
    );
    const topicCounts = new Map<string, number>();
    const pickCappedTopic = (exclude: readonly string[]): string | null => {
      const open = monthly.m32TopicDist.filter(
        ([topic]) =>
          !exclude.includes(topic) && (topicCounts.get(topic) ?? 0) < topicCap,
      );
      if (open.length === 0) return null;
      const topic = pickWeighted(rng, open);
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      return topic;
    };
    monthlyRespondents.forEach((respondent, index) => {
      let values: string[];
      if (required(noneFlags[index], "M3.2 none flag") === "none") {
        values = ["none"];
      } else {
        const withPrompt =
          required(promptFlags[index], "M3.2 prompt flag") === "yes";
        values = withPrompt ? ["prompt_engineering"] : [];
        const extraCount = withPrompt
          ? (rng() < 0.4 ? 1 : 0)
          : 1 + (rng() < 0.35 ? 1 : 0);
        for (let extra = 0; extra < extraCount; extra++) {
          const topic = pickCappedTopic(values);
          if (topic) values.push(topic);
        }
        // Capacity is ~1.5× demand, so an empty pick is theoretical only —
        // still, a multi_choice answer must carry at least one value.
        if (values.length === 0) values = ["none"];
      }
      emit(monthlyCycleId, respondent.department_id, "employee", "M3.2", {
        kind: "choices",
        values,
      });
    });

    // M3.3 — course completed (mostly "no").
    const courseFlags = allocateByShares(rng, monthlyCount, [
      ["yes", monthly.m33YesRate],
      ["no", 1 - monthly.m33YesRate],
    ]);
    monthlyRespondents.forEach((respondent, index) => {
      const value = required(courseFlags[index], "M3.3 value");
      emit(
        monthlyCycleId,
        respondent.department_id,
        "employee",
        "M3.3",
        value === "yes"
          ? {
              kind: "choice",
              value,
              text: pickFrom(rng, COURSE_SNIPPETS),
              scale: 6 + Math.floor(rng() * 4),
            }
          : { kind: "choice", value },
      );
    });

    emitMonthlyScale("M4.1", monthly.m41Mean, 1, 10);

    const m42Values = allocateByShares(rng, monthlyCount, monthly.m42Dist);
    monthlyRespondents.forEach((respondent, index) => {
      emit(monthlyCycleId, respondent.department_id, "employee", "M4.2", {
        kind: "choice",
        value: required(m42Values[index], "M4.2 value"),
      });
    });

    emitMonthlyText("M4.3", profile.snippets.concern, 0.25);
    emitMonthlyText("M4.4", profile.snippets.opportunity, monthly.textRate);
    emitMonthlyScale("M5.1", monthly.m51Mean, 1, 10);
    emitMonthlyScale("M5.2", monthly.m52Mean, 1, 10);
    emitMonthlyText("M5.3", profile.snippets.wish, 0.25);
    emitMonthlyScale("M6.1", monthly.m61Mean, 0, 10);

    participation.push({
      org_id: org.id,
      cycle_id: monthlyCycleId,
      template_key: "monthly",
      week: isoWeek,
      invited: totalHeadcount,
      completed: monthlyCount,
    });

    // ---- Leadership: one lead per department + one org-level lead ------------

    const leadershipCycleId = `leadership-${isoWeek}`;
    const leadDepartments: (string | null)[] = [
      ...departments.map((dept) => dept.id),
      null,
    ];
    const leadCount = leadDepartments.length;
    const totalToolCost = activeTools.reduce(
      (sum, tool) => sum + tool.monthly_license_cost_eur,
      0,
    );

    const emitLeadScale = (code: string, mean: number): void => {
      const values = allocateScaleValues(rng, leadCount, mean, 1, 10);
      leadDepartments.forEach((departmentId, index) => {
        emit(leadershipCycleId, departmentId, "lead", code, {
          kind: "scale",
          value: required(values[index], `${code} value`),
        });
      });
    };

    // F1 — licence budget ≈ Σ tool costs ± 10 % (rounded to 10 €).
    for (const departmentId of leadDepartments) {
      emit(leadershipCycleId, departmentId, "lead", "F1", {
        kind: "number",
        value: Math.round((totalToolCost * (0.9 + 0.2 * rng())) / 10) * 10,
      });
    }
    emitLeadScale("F2", profile.leadership.f2Mean);
    for (const departmentId of takeShare(rng, leadDepartments, profile.leadership.textRate)) {
      emit(leadershipCycleId, departmentId, "lead", "F3", {
        kind: "text",
        value: pickFrom(rng, profile.snippets.leadSuccess),
      });
    }
    for (const departmentId of takeShare(rng, leadDepartments, profile.leadership.textRate)) {
      emit(leadershipCycleId, departmentId, "lead", "F4", {
        kind: "text",
        value: pickFrom(rng, profile.snippets.leadObstacle),
      });
    }
    // F5 — average hourly rate ≈ org default ± 15 %.
    for (const departmentId of leadDepartments) {
      emit(leadershipCycleId, departmentId, "lead", "F5", {
        kind: "number",
        value: Math.round(org.hourly_rate_default * (0.85 + 0.3 * rng())),
      });
    }
    emitLeadScale("F6", profile.leadership.f6Mean);
    emitLeadScale("F7", profile.leadership.f7Mean);

    participation.push({
      org_id: org.id,
      cycle_id: leadershipCycleId,
      template_key: "leadership",
      week: isoWeek,
      invited: leadCount,
      completed: leadCount,
    });
  }

  return { responses, participation };
}

/**
 * The full Phase 2 demo dataset: all three §16.3 orgs × all weeks of the
 * window. Callers typically pass 6 consecutive ISO weeks (SPEC.md §16.3);
 * any length works — onboarding lands in the first week, monthly/leadership
 * in every 4th week (weekIndex % 4 === 3). Because all trends are keyed by
 * absolute week index, appending weeks later (via `generateOrgWeek` with the
 * extended array — "Woche simulieren") produces rows consistent with the
 * original window.
 */
export function generateAllDemoData(args: { weeks: string[] }): GeneratedDemoData {
  const responses: NewSurveyResponse[] = [];
  const participation: ParticipationStat[] = [];
  for (const org of DEMO_ORGS) {
    const departments = DEMO_ORG_DEPARTMENTS.filter(
      (dept) => dept.org_id === org.id,
    );
    const headcounts = DEMO_ORG_HEADCOUNTS[org.id] ?? {};
    const toolSettings = DEMO_ORG_TOOL_SETTINGS.filter(
      (tool) => tool.org_id === org.id,
    );
    for (let weekIndex = 0; weekIndex < args.weeks.length; weekIndex++) {
      const generated = generateOrgWeek({
        org,
        departments,
        headcounts,
        toolSettings,
        weeks: args.weeks,
        weekIndex,
      });
      responses.push(...generated.responses);
      participation.push(...generated.participation);
    }
  }
  return { responses, participation };
}

/**
 * Heuristic (non-LLM) classification + AI-output normalizers.
 * Split from extract.ts so tests can import them without Ollama deps.
 */
import type { ThreatCategory, ThreatSeverity } from "../types.js";
import { findCountryInText } from "../geo/countries.js";

export const CATEGORY_HINTS: Array<[RegExp, ThreatCategory]> = [
  [/\bransom(ware|om)\b/i, "ransomware"],
  [/\bphish/i, "phishing"],
  [/\bleak|breach|expos|stolen data|data dump/i, "data_breach"],
  [/\bCVE-\d{4}-\d{4,7}\b|patch|vulnerab|zero-?day|exploit/i, "vulnerability"],
  [/\bmalware|trojan|botnet|stealer|backdoor|spyware/i, "malware"],
  [/\bAPT\d*|nation-state|state-sponsored/i, "apt"],
  [/\boutage|down|disrupt|incident|degraded|unavailable/i, "outage"],
];

export const SEVERITY_HINTS: Array<[RegExp, ThreatSeverity]> = [
  [/\bcritical\b|mass exploit|actively exploited|CVE-202[5-9]-\d{4,7}.*(exploit|ransom)/i, "critical"],
  [/\bhigh\b|ransomware|APT\d*|data breach/i, "high"],
  [/\bmedium\b|phishing campaign/i, "medium"],
];

/** Fuzzy-normalize a model-emitted category string into our enum. */
export function normalizeCategory(raw: string): ThreatCategory {
  const s = (raw || "").toLowerCase();
  if (s.includes("ransom")) return "ransomware";
  if (s.includes("phish")) return "phishing";
  if (s.includes("breach") || s.includes("leak") || s.includes("expos") || s.includes("dump")) return "data_breach";
  if (s.includes("vuln") || s.includes("cve") || s.includes("patch") || s.includes("zero-day")) return "vulnerability";
  if (s.includes("outage") || s.includes("down") || s.includes("disrupt") || s.includes("incident")) return "outage";
  if (s.includes("apt") || s.includes("nation-state") || s.includes("state-sponsored")) return "apt";
  if (s.includes("malware") || s.includes("trojan") || s.includes("botnet") || s.includes("stealer")) return "malware";
  return "other";
}

/** Fuzzy-normalize severity. */
export function normalizeSeverity(raw: string): ThreatSeverity {
  const s = (raw || "").toLowerCase();
  if (s.includes("critical") || s.includes("crit")) return "critical";
  if (s.includes("high") || s.includes("severe")) return "high";
  if (s.includes("low")) return "low";
  return "medium";
}

/** Known threat actors/gangs for heuristic (non-AI) detection. */
const KNOWN_ACTORS: Array<{ name: string; re: RegExp }> = [
  { name: "LockBit", re: /\blockbit\b/i },
  { name: "BlackCat/ALPHV", re: /\b(blackcat|alphv)\b/i },
  { name: "Cl0p", re: /\bcl0p\b|\bclop\b/i },
  { name: "REvil", re: /\brevil\b|\bsodinokibi\b/i },
  { name: "Conti", re: /\bconti\b/i },
  { name: "Hive", re: /\bhive ransomware\b|\b hive\b.*\bransom/i },
  { name: "Lazarus", re: /\blazarus\b/i },
  { name: "APT28", re: /\bapt[- ]?28\b|\bfancy bear\b/i },
  { name: "APT29", re: /\bapt[- ]?29\b|\bcozy bear\b/i },
  { name: "APT41", re: /\bapt[- ]?41\b/i },
  { name: "Scattered Spider", re: /\bscattered spider\b/i },
  { name: "Black Basta", re: /\bblack ?basta\b/i },
  { name: "Akira", re: /\bakira\b/i },
  { name: "KillNet", re: /\bkillnet\b/i },
  { name: "Anonymous Sudan", re: /\banonymous sudan\b/i },
  { name: "Volt Typhoon", re: /\bvolt typhoon\b/i },
  { name: "Sandworm", re: /\bsandworm\b/i },
  { name: "FIN7", re: /\bfin[- ]?7\b/i },
  { name: "UNC5325", re: /\bunc[- ]?5325\b/i },
  { name: "Medusa", re: /\bmedusa\b/i },
  { name: "Rhysida", re: /\brhysida\b/i },
  { name: "LockBit 3.0", re: /\blockbit ?3/i },
];

function detectActor(title: string, desc: string): string | undefined {
  const blob = `${title}. ${desc}`;
  for (const a of KNOWN_ACTORS) {
    if (a.re.test(blob)) return a.name;
  }
  // generic pattern: "XxxXxx gang/group" — skip, too noisy; rely on known list
  return undefined;
}

export function heuristicExtract(title: string, desc: string): {
  category: ThreatCategory;
  severity: ThreatSeverity;
  location?: string;
  actor?: string;
  summary: string;
} {
  const blob = `${title}. ${desc}`;
  let category: ThreatCategory = "other";
  for (const [re, cat] of CATEGORY_HINTS) {
    if (re.test(blob)) {
      category = cat;
      break;
    }
  }
  let severity: ThreatSeverity = "medium";
  for (const [re, sev] of SEVERITY_HINTS) {
    if (re.test(blob)) {
      severity = sev;
      break;
    }
  }
  const loc = findCountryInText(blob);
  return {
    category,
    severity,
    location: loc.country,
    actor: detectActor(title, desc),
    summary: (desc || title).slice(0, 160),
  };
}

// re-export geo helper used above (keeps single source of truth)
export { findCountryInText } from "../geo/countries.js";

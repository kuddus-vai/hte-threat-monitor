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

export function heuristicExtract(title: string, desc: string): {
  category: ThreatCategory;
  severity: ThreatSeverity;
  location?: string;
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
    summary: (desc || title).slice(0, 160),
  };
}

// re-export geo helper used above (keeps single source of truth)
export { findCountryInText } from "../geo/countries.js";

/**
 * AI entity extraction: Ollama turns raw threat headlines into strict JSON
 * {category, severity, location, summary}. A heuristic fallback covers
 * "AI_ENGINE=none" and Ollama parse failures so the pipeline never dies.
 */
import type { ThreatCategory, ThreatEvent, ThreatSeverity } from "../types.js";
import { config } from "../config.js";
import { ollamaChat } from "./ollama.js";
import { findCountryInText, resolveLocation } from "../geo/countries.js";

const SYSTEM_PROMPT = `You are a threat-intelligence triage engine. Analyze the given cybersecurity news item and respond with ONLY a compact JSON object — no markdown, no code fences, no commentary.

Schema:
{"category":"malware|ransomware|phishing|data_breach|vulnerability|outage|apt|other","severity":"low|medium|high|critical","location":"<country or city name, or empty string if unknown>","summary":"<1-2 sentence plain-language summary, max 140 chars>"}

Rules:
- severity: critical = active mass exploitation / nation-state / major outage; high = serious but limited; medium = notable; low = minor.
- category: prefer the most specific match (ransomware beats malware; data_breach for leaks).
- location: the country/region the event affects OR originates from; empty if not determinable.
- summary: plain language, no markdown, for a non-technical executive.`;

const CATEGORY_HINTS: Array<[RegExp, ThreatCategory]> = [
  [/\bransom(ware|om)\b/i, "ransomware"],
  [/\bphish/i, "phishing"],
  [/\bleak|breach|expos|stolen data|data dump/i, "data_breach"],
  [/\bCVE-\d{4}-\d{4,7}\b|patch|vulnerab|zero-?day|exploit/i, "vulnerability"],
  [/\bmalware|trojan|botnet|stealer|backdoor|spyware/i, "malware"],
  [/\bAPT\d*|nation-state|state-sponsored/i, "apt"],
  [/\boutage|down|disrupt|incident|degraded|unavailable/i, "outage"],
];

const SEVERITY_HINTS: Array<[RegExp, ThreatSeverity]> = [
  [/\bcritical\b|mass exploit|actively exploited|CVE-202[5-9]-\d{4,7}.*(exploit|ransom)/i, "critical"],
  [/\bhigh\b|ransomware|APT\d*|data breach/i, "high"],
  [/\bmedium\b|phishing campaign/i, "medium"],
];

/** Fuzzy-normalize a model-emitted category string into our enum. */
function normalizeCategory(raw: string): ThreatCategory {
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
function normalizeSeverity(raw: string): ThreatSeverity {
  const s = (raw || "").toLowerCase();
  if (s.includes("critical") || s.includes("crit")) return "critical";
  if (s.includes("high") || s.includes("severe")) return "high";
  if (s.includes("low")) return "low";
  return "medium";
}

function heuristicExtract(title: string, desc: string): {
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

function parseLooseJson(text: string): any {
  // strip code fences if the model wrapped them anyway
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Pure heuristic extraction — no LLM call. Used for items outside the AI window. */
export function aiExtractHeuristic(
  item: { title: string; description: string },
  base: Omit<ThreatEvent, "category" | "severity" | "summary" | "lat" | "lon" | "country" | "aiProcessed">,
): ThreatEvent {
  const fallback = heuristicExtract(item.title, item.description);
  const geo = resolveLocation(fallback.location || "");
  return { ...base, ...fallback, ...geo, aiProcessed: false };
}

/** Enrich a raw item into a fully-typed threat event using Ollama. */
export async function aiExtractEvent(
  item: { title: string; description: string },
  base: Omit<ThreatEvent, "category" | "severity" | "summary" | "lat" | "lon" | "country" | "aiProcessed">,
): Promise<ThreatEvent> {
  const fallback = heuristicExtract(item.title, item.description);

  if (config.aiEngine === "none") {
    const geo = resolveLocation(fallback.location || "");
    return { ...base, ...fallback, ...geo, aiProcessed: false };
  }

  try {
    const raw = await ollamaChat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Title: ${item.title}\nBody: ${item.description.slice(0, 800)}` },
    ]);
    const parsed = parseLooseJson(raw);
    const category = normalizeCategory(String(parsed.category ?? ""));
    const severity = normalizeSeverity(String(parsed.severity ?? ""));

    const location = String(parsed.location ?? "");
    const geo = resolveLocation(location);
    const summary = String(parsed.summary ?? "").slice(0, 200);

    return {
      ...base,
      category,
      severity,
      summary: summary || fallback.summary,
      ...(geo.country ? geo : {}),
      aiProcessed: true,
    };
  } catch (err) {
    // Fall back to heuristics so a slow/absent Ollama never breaks ingestion
    const geo = resolveLocation(fallback.location || "");
    return { ...base, ...fallback, ...geo, aiProcessed: false };
  }
}

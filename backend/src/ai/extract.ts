/**
 * AI entity extraction: Ollama turns raw threat headlines into strict JSON
 * {category, severity, location, summary}. A heuristic fallback covers
 * "AI_ENGINE=none" and Ollama parse failures so the pipeline never dies.
 */
import type { ThreatCategory, ThreatEvent, ThreatSeverity } from "../types.js";
import { config } from "../config.js";
import { ollamaChat } from "./ollama.js";
import { findCountryInText, resolveLocation } from "../geo/countries.js";
import {
  CATEGORY_HINTS,
  SEVERITY_HINTS,
  heuristicExtract,
  normalizeCategory,
  normalizeSeverity,
} from "./heuristics.js";

const SYSTEM_PROMPT = `You are a threat-intelligence triage engine. Analyze the given cybersecurity news item and respond with ONLY a compact JSON object — no markdown, no code fences, no commentary.

Schema:
{"category":"malware|ransomware|phishing|data_breach|vulnerability|outage|apt|other","severity":"low|medium|high|critical","location":"<country or city name, or empty string if unknown>","actor":"<threat actor/group/vendor name if identifiable, else empty string>","summary":"<1-2 sentence plain-language summary, max 140 chars>"}

Rules:
- severity: critical = active mass exploitation / nation-state / major outage; high = serious but limited; medium = notable; low = minor.
- category: prefer the most specific match (ransomware beats malware; data_breach for leaks).
- location: the country/region the event affects OR originates from; empty if not determinable.
- actor: the named threat group (e.g. LockBit, APT28, Lazarus), malware family, or affected vendor; empty if none named.
- summary: plain language, no markdown, for a non-technical executive.`;

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
    const actor = String(parsed.actor ?? "").trim().slice(0, 60) || undefined;

    return {
      ...base,
      category,
      severity,
      summary: summary || fallback.summary,
      actor,
      ...(geo.country ? geo : {}),
      aiProcessed: true,
    };
  } catch (err) {
    // Fall back to heuristics so a slow/absent Ollama never breaks ingestion
    const geo = resolveLocation(fallback.location || "");
    return { ...base, ...fallback, ...geo, aiProcessed: false };
  }
}

/**
 * Weekly AI executive summary — Ollama digests the last 7 days of events into
 * a brief board-ready report. Stored in Upstash (hte:weekly:v1), served via
 * /api/summary, regenerated when stale (default: every 24h).
 */
import type { ThreatFeed } from "../types.js";
import { config } from "../config.js";
import { ollamaChat } from "../ai/ollama.js";
import { cache } from "../cache/cache.js";

const WEEKLY_KEY = "hte:weekly:v1";
const WEEKLY_TTL = 60 * 60 * 24; // 24h cache — "weekly" but refreshed daily

export interface WeeklySummary {
  generatedAt: string;
  window: string;
  headline: string;
  topThreats: string[];
  actors: string[];
  recommendation: string;
  source: "ai" | "heuristic";
}

export async function getWeeklySummary(force = false): Promise<WeeklySummary | null> {
  // cached copy?
  if (!force && config.upstashUrl) {
    try {
      const res = await fetch(`${config.upstashUrl}/get/${WEEKLY_KEY}`, {
        headers: { authorization: `Bearer ${config.upstashToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      const data = (await res.json()) as { result?: string };
      if (data?.result) {
        const cached = JSON.parse(data.result) as WeeklySummary;
        // serve cached if fresh enough
        if (Date.now() - new Date(cached.generatedAt).getTime() < WEEKLY_TTL * 1000) {
          return cached;
        }
      }
    } catch {
      /* fall through to regenerate */
    }
  }

  const feed = await cache.get();
  if (!feed || feed.events.length === 0) return null;
  const summary = await generate(feed);
  if (config.upstashUrl) {
    try {
      const res = await fetch(`${config.upstashUrl}/set/${WEEKLY_KEY}`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.upstashToken}`, "content-type": "application/json" },
        body: JSON.stringify(summary),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        await fetch(`${config.upstashUrl}/expire/${WEEKLY_KEY}/${WEEKLY_TTL}`, {
          headers: { authorization: `Bearer ${config.upstashToken}` },
          signal: AbortSignal.timeout(5_000),
        });
      }
    } catch {
      /* non-fatal */
    }
  }
  return summary;
}

async function generate(feed: ThreatFeed): Promise<WeeklySummary> {
  const critical = feed.events.filter((e) => e.severity === "critical").slice(0, 8);
  const high = feed.events.filter((e) => e.severity === "high").slice(0, 5);
  const actors = [...new Set(feed.events.map((e) => e.actor).filter(Boolean))].slice(0, 5) as string[];
  const windowStart = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const windowEnd = new Date().toISOString().slice(0, 10);

  const digest = [...critical, ...high]
    .map((e) => `[${e.severity}] ${e.title}${e.actor ? ` (actor: ${e.actor})` : ""}`)
    .join("\n");

  let headline = `${feed.total} events tracked · ${critical.length} critical in current window`;
  let recommendation = "Monitor critical CVEs; patch internet-facing appliances (Progress, Metabase class).";
  let topThreats = critical.slice(0, 3).map((e) => e.title);
  let source: WeeklySummary["source"] = "heuristic";

  if (config.aiEngine === "ollama") {
    try {
      const raw = await ollamaChat([
        {
          role: "system",
          content:
            "You are a SOC director writing a one-paragraph executive weekly summary. Respond with ONLY JSON: {\"headline\":\"<1 sentence>\",\"topThreats\":[\"<2-4 short items>\"],\"recommendation\":\"<1-2 sentence actionable advice>\"}. No markdown.",
        },
        { role: "user", content: `Events this week:\n${digest.slice(0, 2400)}` },
      ]);
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        headline = String(parsed.headline ?? headline).slice(0, 300);
        if (Array.isArray(parsed.topThreats)) {
          topThreats = parsed.topThreats.map(String).slice(0, 4);
        }
        recommendation = String(parsed.recommendation ?? recommendation).slice(0, 400);
        source = "ai";
      }
    } catch {
      /* keep heuristic fallback */
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    window: `${windowStart} → ${windowEnd}`,
    headline,
    topThreats,
    actors,
    recommendation,
    source,
  };
}

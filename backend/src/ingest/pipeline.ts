/**
 * Ingestion pipeline: RSS sources (+ OTX when keyed) → AI enrichment → cache.
 * This is the server-side cron job body, reusable from both the local
 * scheduler and the /api/refresh endpoint.
 */
import type { RefreshResult, ThreatEvent, ThreatFeed } from "../types.js";
import { config } from "../config.js";
import { RSS_SOURCES, fetchRss } from "./rss.js";
import { fetchOtxPulses, otxPulseToEvent } from "./otx.js";
import { aiExtractEvent, aiExtractHeuristic } from "../ai/extract.js";
import { runAlerts } from "./alerts.js";
import { cache } from "../cache/cache.js";

const MAX_EVENTS = 120; // cap the feed so the globe stays snappy

// In-flight lock: concurrent refresh calls share one run instead of
// hammering Ollama with duplicate work (cold-cache race, cron overlap).
let inflight: Promise<RefreshResult> | null = null;

export function runRefresh(): Promise<RefreshResult> {
  if (!inflight) {
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function doRefresh(): Promise<RefreshResult> {
  const started = Date.now();
  const sourcesOk: string[] = [];
  const sourcesFailed: string[] = [];
  const rawItems: Array<{ source: string; title: string; description: string; url: string; publishedAt: string }> = [];

  // 1) RSS sources (keyless, in parallel)
  await Promise.allSettled(
    RSS_SOURCES.map(async (src) => {
      try {
        const items = await fetchRss(src, 15);
        for (const it of items) {
          rawItems.push({
            source: src.name,
            title: it.title,
            description: it.description,
            url: it.link,
            publishedAt: it.pubDate,
          });
        }
        sourcesOk.push(src.id);
      } catch {
        sourcesFailed.push(src.id);
      }
    }),
  );

  // 2) OTX pulses (only when a key is configured)
  if (config.otxApiKey) {
    try {
      const pulses = await fetchOtxPulses(config.otxApiKey);
      for (const p of pulses) {
        const ev = otxPulseToEvent(p);
        rawItems.push({
          source: ev.source,
          title: ev.title,
          description: ev.summary,
          url: ev.url,
          publishedAt: ev.publishedAt,
        });
      }
      sourcesOk.push("otx");
    } catch {
      sourcesFailed.push("otx");
    }
  }

  // 3) AI enrichment — bounded worker pool (Ollama is CPU-bound here).
  //    The newest AI_WINDOW items get LLM triage; the rest use fast heuristics.
  //    Small window keeps first-boot latency humane on CPU-only machines.
  //    (Measured: ~45s per 8B call on this machine, so window=4 ≈ 3 min.)
  const AI_WINDOW = 4;
  const CONCURRENCY = 1;
  const events: ThreatEvent[] = new Array(rawItems.length);
  let aiProcessed = 0;
  const toEnrich = rawItems.slice(0, AI_WINDOW);

  const worker = async (idx: number) => {
    const it = rawItems[idx];
    const ev = await aiExtractEvent(
      { title: it.title, description: it.description },
      {
        id: stableId(it.source, it.title),
        title: it.title,
        source: it.source,
        url: it.url,
        publishedAt: it.publishedAt,
      },
    );
    if (ev.aiProcessed) aiProcessed++;
    events[idx] = ev;
  };

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, toEnrich.length) }, async () => {
      while (next < toEnrich.length) {
        const i = next++;
        await worker(i);
      }
    }),
  );
  // items outside the AI window → heuristic only (no LLM call)
  for (let i = AI_WINDOW; i < rawItems.length; i++) {
    const it = rawItems[i];
    const ev = aiExtractHeuristic({ title: it.title, description: it.description }, {
      id: stableId(it.source, it.title),
      title: it.title,
      source: it.source,
      url: it.url,
      publishedAt: it.publishedAt,
    });
    events[i] = ev;
  }

  // 4) Sort newest-first, cap, and persist to cache
  events.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const capped = events.slice(0, MAX_EVENTS);
  const feed: ThreatFeed = {
    updatedAt: new Date().toISOString(),
    sourceCount: sourcesOk.length,
    total: capped.length,
    events: capped,
  };
  await cache.put(feed);

  // 5) Hourly trend snapshot (dedupe: one point per hour bucket)
  const hourBucket = new Date().toISOString().slice(0, 13) + ":00:00.000Z";
  const existing = await cache.trends();
  if (!existing.some((p) => p.ts === hourBucket)) {
    const sev = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const e of capped) if (sev[e.severity] !== undefined) sev[e.severity]++;
    await cache.pushTrend({
      ts: hourBucket,
      critical: sev.critical,
      high: sev.high,
      medium: sev.medium,
      low: sev.low,
      total: capped.length,
    });
  }

  // 6) Alert on NEW critical/high events (deduped, ntfy + optional Telegram)
  const alerted = await runAlerts(capped);

  return {
    ok: sourcesOk.length > 0,
    fetched: rawItems.length,
    stored: capped.length,
    aiProcessed,
    alerted,
    sourcesOk,
    sourcesFailed,
    durationMs: Date.now() - started,
    at: feed.updatedAt,
  };
}

function stableId(source: string, title: string): string {
  // sha-256-ish tiny hash (no crypto import needed for a cache key)
  let h = 2166136261;
  const s = `${source}:${title}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `ev-${(h >>> 0).toString(36)}`;
}

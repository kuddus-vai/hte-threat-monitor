/**
 * Cache abstraction: Upstash Redis REST (free tier) when configured,
 * otherwise a process-local in-memory store. The frontend ALWAYS reads
 * through here — never touches upstream APIs (avoids IP bans).
 */
import type { ThreatFeed, TrendPoint } from "../types.js";
import { config } from "../config.js";

const FEED_KEY = "hte:feed:v1";
const TREND_KEY = "hte:trends:v1"; // hourly severity snapshots (newest first)

interface CacheBackend {
  getFeed(): Promise<ThreatFeed | null>;
  setFeed(feed: ThreatFeed, ttlSeconds: number): Promise<void>;
  pushTrend(point: TrendPoint, max: number): Promise<void>;
  getTrends(): Promise<TrendPoint[]>;
}

class UpstashBackend implements CacheBackend {
  private async request<T>(path: string, body?: unknown): Promise<T> {
    const url = `${config.upstashUrl}${path}`;
    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${config.upstashToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async getFeed(): Promise<ThreatFeed | null> {
    // Upstash REST wraps values: {"result":"<json-string>"}
    const data = await this.request<{ result?: string }>(`/get/${FEED_KEY}`);
    const raw = data?.result;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ThreatFeed;
    } catch {
      return null;
    }
  }

  async setFeed(feed: ThreatFeed, ttlSeconds: number): Promise<void> {
    // Upstash REST: body = the JSON string of the value (single-encoded)
    const res = await fetch(`${config.upstashUrl}/set/${FEED_KEY}`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.upstashToken}`, "content-type": "application/json" },
      body: JSON.stringify(feed),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Upstash set HTTP ${res.status}`);
    await this.request(`/expire/${FEED_KEY}/${ttlSeconds}`);
  }

  /** LPUSH + LTRIM the trend point onto a capped list (newest first). */
  async pushTrend(point: TrendPoint, max: number): Promise<void> {
    // Direct fetch (like setFeed): Upstash stores the raw request body as the
    // value — single-encode, otherwise the point arrives double-quoted.
    const res = await fetch(`${config.upstashUrl}/lpush/${TREND_KEY}`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.upstashToken}`, "content-type": "application/json" },
      body: JSON.stringify(point),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Upstash lpush HTTP ${res.status}`);
    await this.request(`/ltrim/${TREND_KEY}/0/${max - 1}`);
    await this.request(`/expire/${TREND_KEY}/172800`); // keep 48h
  }

  /** LRANGE the trend list (index 0 = newest). */
  async getTrends(): Promise<TrendPoint[]> {
    const data = await this.request<{ result?: string[] }>(`/lrange/${TREND_KEY}/0/-1`);
    const items = data?.result ?? [];
    return items
      .map((s) => {
        try {
          return JSON.parse(s) as TrendPoint;
        } catch {
          return null;
        }
      })
      .filter((p): p is TrendPoint => p !== null);
  }
}

class InMemoryBackend implements CacheBackend {
  private feed: ThreatFeed | null = null;
  private expiresAt = 0;
  private trends: TrendPoint[] = [];

  async getFeed(): Promise<ThreatFeed | null> {
    if (this.feed && Date.now() < this.expiresAt) return this.feed;
    return null;
  }

  async setFeed(feed: ThreatFeed, ttlSeconds: number): Promise<void> {
    this.feed = feed;
    this.expiresAt = Date.now() + ttlSeconds * 1000;
  }

  async pushTrend(point: TrendPoint, max: number): Promise<void> {
    this.trends.unshift(point);
    if (this.trends.length > max) this.trends.length = max;
  }

  async getTrends(): Promise<TrendPoint[]> {
    return [...this.trends];
  }
}

const backend: CacheBackend =
  config.upstashUrl && config.upstashToken ? new UpstashBackend() : new InMemoryBackend();

export const cache = {
  /** Read the cached feed (never hits upstream). */
  async get(): Promise<ThreatFeed | null> {
    try {
      return await backend.getFeed();
    } catch {
      return null; // cache outage → miss, not crash
    }
  },
  /** Write the feed with a TTL slightly longer than the refresh interval. */
  async put(feed: ThreatFeed): Promise<void> {
    const ttl = Math.max(300, config.refreshIntervalMin * 60 * 2);
    try {
      await backend.setFeed(feed, ttl);
    } catch {
      /* cache write failure must never break ingestion */
    }
  },
  /** Record an hourly severity snapshot (capped list). */
  async pushTrend(point: TrendPoint): Promise<void> {
    try {
      await backend.pushTrend(point, 48);
    } catch {
      /* non-fatal */
    }
  },
  /** Read trend series (newest first). */
  async trends(): Promise<TrendPoint[]> {
    try {
      return await backend.getTrends();
    } catch {
      return [];
    }
  },
  backendKind: config.upstashUrl && config.upstashToken ? "upstash" : "memory",
};

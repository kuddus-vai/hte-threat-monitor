/**
 * Cache abstraction: Upstash Redis REST (free tier) when configured,
 * otherwise a process-local in-memory store. The frontend ALWAYS reads
 * through here — never touches upstream APIs (avoids IP bans).
 */
import type { ThreatFeed } from "../types.js";
import { config } from "../config.js";

const FEED_KEY = "hte:feed:v1";

interface CacheBackend {
  getFeed(): Promise<ThreatFeed | null>;
  setFeed(feed: ThreatFeed, ttlSeconds: number): Promise<void>;
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
    const raw = await this.request<string>(`/get/${FEED_KEY}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ThreatFeed;
    } catch {
      return null;
    }
  }

  async setFeed(feed: ThreatFeed, ttlSeconds: number): Promise<void> {
    await this.request(`/set/${FEED_KEY}`, JSON.stringify(feed));
    await this.request(`/expire/${FEED_KEY}/${ttlSeconds}`);
  }
}

class InMemoryBackend implements CacheBackend {
  private feed: ThreatFeed | null = null;
  private expiresAt = 0;

  async getFeed(): Promise<ThreatFeed | null> {
    if (this.feed && Date.now() < this.expiresAt) return this.feed;
    return null;
  }

  async setFeed(feed: ThreatFeed, ttlSeconds: number): Promise<void> {
    this.feed = feed;
    this.expiresAt = Date.now() + ttlSeconds * 1000;
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
  backendKind: config.upstashUrl && config.upstashToken ? "upstash" : "memory",
};

/*
 * Zero-dependency .env loader + typed config.
 * Reads .env from the repo root (one level up from backend/).
 *
 * Edge note: on Cloudflare Workers there is no fs; the Worker entrypoint
 * installs `process.env` from its bindings. Because static imports hoist
 * ABOVE the shim install, config values must be read LAZILY (getters),
 * not snapshotted at module-import time.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process?.env as Record<string, string>) };
  // Edge runtimes (Cloudflare Workers) have no real `process`/fs — they get a
  // shim from worker/index.ts (which sets __HTE_EDGE__ + process.env bindings).
  if (typeof process === "undefined") return env;
  if ((globalThis as any).__HTE_EDGE__) {
    return { ...(process.env as Record<string, string>) };
  }
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../.env"),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq === -1) continue;
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (k && env[k] === undefined) env[k] = v;
      }
    } catch {
      /* no .env at this candidate — fine */
    }
  }
  return env;
}

// Lazy snapshot: first ACCESS reads process.env (post-shim-install), then caches.
let _env: Record<string, string> | null = null;
function env(): Record<string, string> {
  _env ??= loadEnv();
  return _env;
}

export const config = {
  get port() { return Number(env().PORT || 8787); },
  get ollamaBaseUrl() { return env().OLLAMA_BASE_URL || "http://127.0.0.1:11434"; },
  get ollamaModel() { return env().OLLAMA_MODEL || "dolphin-llama3:8b"; },
  get aiEngine(): "ollama" | "none" { return (env().AI_ENGINE || "ollama") as "ollama" | "none"; },
  get otxApiKey() { return env().OTX_API_KEY || ""; },
  get upstashUrl() { return env().UPSTASH_REDIS_REST_URL || ""; },
  get upstashToken() { return env().UPSTASH_REDIS_REST_TOKEN || ""; },
  get refreshIntervalMin() { return Number(env().REFRESH_INTERVAL_MIN || 15); },
  get corsOrigin() { return env().CORS_ORIGIN || "http://localhost:5173"; },
  // Phase 3 alerts: ntfy.sh topic (zero-account) + optional Telegram
  get ntfyTopic() { return env().NTFY_TOPIC || ""; },
  get telegramBotToken() { return env().TELEGRAM_BOT_TOKEN || ""; },
  get telegramChatId() { return env().TELEGRAM_CHAT_ID || ""; },
};

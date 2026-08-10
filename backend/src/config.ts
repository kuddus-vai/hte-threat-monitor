/**
 * Zero-dependency .env loader + typed config.
 * Reads .env from the repo root (one level up from backend/).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
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

const env = loadEnv();

export const config = {
  port: Number(env.PORT || 8787),
  ollamaBaseUrl: env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  ollamaModel: env.OLLAMA_MODEL || "dolphin-llama3:8b",
  aiEngine: (env.AI_ENGINE || "ollama") as "ollama" | "none",
  otxApiKey: env.OTX_API_KEY || "",
  upstashUrl: env.UPSTASH_REDIS_REST_URL || "",
  upstashToken: env.UPSTASH_REDIS_REST_TOKEN || "",
  refreshIntervalMin: Number(env.REFRESH_INTERVAL_MIN || 15),
  corsOrigin: env.CORS_ORIGIN || "http://localhost:5173",
  // Phase 3 alerts: ntfy.sh topic (zero-account) + optional Telegram
  ntfyTopic: env.NTFY_TOPIC || "",
  telegramBotToken: env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: env.TELEGRAM_CHAT_ID || "",
};

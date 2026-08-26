/**
 * Edge env shim — MUST be the first import in worker/index.ts.
 *
 * Static ES imports are hoisted and executed in list order, so importing this
 * module before server.ts guarantees `process.env` exists when config.ts's
 * lazy getters first run. Values are filled by installEdgeEnv() at first fetch.
 */

export interface WorkerEnv {
  CORS_ORIGIN?: string;
  AI_ENGINE?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
  OTX_API_KEY?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  NTFY_TOPIC?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  ADSENSE_PUB_ID?: string;
}

let installed = false;

export function installEdgeEnv(e: WorkerEnv): void {
  if (installed) return;
  installed = true;
  const g = globalThis as any;
  g.__HTE_EDGE__ = true;
  g.process = {
    ...(g.process || {}),
    env: {
      PORT: "8787",
      CORS_ORIGIN: e.CORS_ORIGIN || "*",
      AI_ENGINE: e.AI_ENGINE || "none",
      OLLAMA_BASE_URL: e.OLLAMA_BASE_URL || "",
      OLLAMA_MODEL: e.OLLAMA_MODEL || "dolphin-llama3:8b",
      OTX_API_KEY: e.OTX_API_KEY || "",
      UPSTASH_REDIS_REST_URL: e.UPSTASH_REDIS_REST_URL || "",
      UPSTASH_REDIS_REST_TOKEN: e.UPSTASH_REDIS_REST_TOKEN || "",
      REFRESH_INTERVAL_MIN: "15",
      NTFY_TOPIC: e.NTFY_TOPIC || "",
      TELEGRAM_BOT_TOKEN: e.TELEGRAM_BOT_TOKEN || "",
      TELEGRAM_CHAT_ID: e.TELEGRAM_CHAT_ID || "",
    },
  };
}

// Pre-install an empty shim NOW (module-eval time) so that `typeof process`
// checks in config.ts don't throw before the real values arrive. Lazy getters
// re-read process.env on first ACCESS, which happens after installEdgeEnv().
const g = globalThis as any;
if (!g.process) {
  g.process = { env: {} as Record<string, string> };
}
if (!g.__HTE_EDGE__) g.__HTE_EDGE__ = true;

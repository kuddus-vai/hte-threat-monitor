/**
 * Cloudflare Workers entrypoint — zero-config edge deploy of the same handlers.
 *
 * Deploy:
 *   1. cd backend
 *   2. npx wrangler deploy   (first run registers a workers.dev subdomain)
 *
 * Notes:
 *   - Modules are imported dynamically on first fetch so we can install the
 *     process.env shim BEFORE config.ts loads (static imports are hoisted).
 *   - AI_ENGINE defaults to "none" on the edge (no local Ollama there); set
 *     OLLAMA_BASE_URL to a remote Ollama/Groq-compatible endpoint to enable AI.
 *   - Set secrets with: npx wrangler secret put <NAME>
 */
export interface Env {
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
}

type Handler = (req: Request, env: { corsOrigin: string; cacheKind: string }) => Promise<Response>;

interface Handlers {
  handleThreats: Handler;
  handleRefresh: Handler;
  handleHealth: Handler;
  handleStats: Handler;
  handleTrends: Handler;
  handleSummary: Handler;
}

let handlersPromise: Promise<Handlers> | null = null;

async function getHandlers(e: Env): Promise<Handlers> {
  if (!handlersPromise) {
    // Install the edge shim BEFORE importing src/server.js → config.ts
    (globalThis as any).__HTE_EDGE__ = true;
    (globalThis as any).process = {
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
    handlersPromise = import("../src/server.js") as unknown as Promise<Handlers>;
  }
  return handlersPromise;
}

export default {
  async fetch(request: Request, e: Env): Promise<Response> {
    const handlers = await getHandlers(e);
    const corsOrigin = e.CORS_ORIGIN || "*";
    const cacheKind =
      e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN ? "upstash" : "memory";
    const ctx = { corsOrigin, cacheKind };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": corsOrigin,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    const url = new URL(request.url);
    switch (url.pathname) {
      case "/api/threats":
        return handlers.handleThreats(request, ctx);
      case "/api/refresh":
        return handlers.handleRefresh(request, ctx);
      case "/api/health":
        return handlers.handleHealth(request, ctx);
      case "/api/stats":
        return handlers.handleStats(request, ctx);
      case "/api/trends":
        return handlers.handleTrends(request, ctx);
      case "/api/summary":
        return handlers.handleSummary(request, ctx);
    }

    // Static dashboard assets (frontend/dist) served from the same origin.
    // ASSETS binding is injected by wrangler via the `assets` config.
    const assets = (e as unknown as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
    if (assets) {
      return assets.fetch(request);
    }
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json", "access-control-allow-origin": corsOrigin },
    });
  },
};

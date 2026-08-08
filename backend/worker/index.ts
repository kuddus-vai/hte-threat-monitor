/**
 * Cloudflare Workers entrypoint — zero-config edge deploy of the same handlers.
 *
 * Deploy:
 *   1. cd backend
 *   2. npx wrangler deploy   (first run: npx wrangler init --no-bundle? just deploy)
 *
 * Notes:
 *   - Caches in-memory per isolate by default; set UPSTASH_REDIS_REST_URL/TOKEN
 *     secrets for a shared cache:  npx wrangler secret put UPSTASH_REDIS_REST_URL
 *   - Set OLLAMA_BASE_URL to a remote Ollama endpoint (e.g. groq/ollama tunnel)
 *     or leave AI_ENGINE=none for pure heuristic triage.
 *   - OTX_API_KEY optional secret.
 */
import { handleThreats, handleRefresh, handleHealth, handleStats } from "../src/server.js";

export interface Env {
  CORS_ORIGIN?: string;
  AI_ENGINE?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
  OTX_API_KEY?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

const env = (e: Env) => ({
  corsOrigin: e.CORS_ORIGIN || "*",
  cacheKind: e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN ? "upstash" : "memory",
});

export default {
  async fetch(request: Request, e: Env): Promise<Response> {
    const ctx = env(e);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": ctx.corsOrigin,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    const url = new URL(request.url);
    switch (url.pathname) {
      case "/api/threats":
        return handleThreats(request, ctx);
      case "/api/refresh":
        return handleRefresh(request, ctx);
      case "/api/health":
        return handleHealth(request, ctx);
      case "/api/stats":
        return handleStats(request, ctx);
      default:
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json", "access-control-allow-origin": ctx.corsOrigin },
        });
    }
  },
};

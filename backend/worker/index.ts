/**
 * Cloudflare Workers entrypoint — zero-config edge deploy of the same handlers.
 *
 * Deploy:
 *   1. cd backend
 *   2. npx wrangler deploy   (first run registers a workers.dev subdomain)
 *
 * Notes:
 *   - env-shim.ts MUST stay the first import: static imports hoist in order,
 *     so it installs `process.env` before server.ts/config.ts evaluate.
 *   - AI_ENGINE defaults to "none" on the edge (no local Ollama there).
 *   - Set secrets with: npx wrangler secret put <NAME>
 */
import { installEdgeEnv, type WorkerEnv } from "./env-shim.js";
import { getHandlers } from "../src/server.js";
import { adsTxt, robotsTxt, privacyPage, aboutPage } from "../src/static-pages.js";

export interface Env extends WorkerEnv {}

type Handler = (req: Request, env: { corsOrigin: string; cacheKind: string }, shell?: Response) => Promise<Response>;

export default {
  async fetch(request: Request, e: Env): Promise<Response> {
    installEdgeEnv(e); // idempotent; fills real secret values on first fetch

    const handlers = getHandlers();
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
      case "/sitemap.xml":
        return handlers.handleSitemap(request, ctx);
      case "/ads.txt":
        return new Response(adsTxt(e.ADSENSE_PUB_ID || "pub-0000000000000000"), {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      case "/robots.txt":
        return new Response(robotsTxt(url.origin), {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      case "/privacy":
        return new Response(privacyPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
      case "/about":
        return new Response(aboutPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // article route: /api/article/<id>
    if (url.pathname.startsWith("/api/article/")) {
      return handlers.handleArticle(request, ctx);
    }

    // crawlable article page: /article/<slug-or-id> — serve SPA shell with SEO meta
    if (url.pathname.startsWith("/article/")) {
      const assets = (e as unknown as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
      const shell = assets ? await assets.fetch(new Request(`${url.origin}/`, request)) : new Response("", { status: 404 });
      if (shell.ok) {
        return handlers.handleArticlePage(request, ctx, shell);
      }
      return shell;
    }

    // Static dashboard assets (frontend/dist) served from the same origin.
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

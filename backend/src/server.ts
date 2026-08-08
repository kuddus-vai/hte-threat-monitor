/**
 * HTTP layer. Handlers are written as plain (req, env) => Response functions
 * so they port to Cloudflare Workers / Vercel Edge Functions later.
 * The local dev server below is just a thin router around them.
 */
import type { ThreatFeed } from "./types.js";
import { cache } from "./cache/cache.js";
import { runRefresh } from "./ingest/pipeline.js";
import { ollamaHealth } from "./ai/ollama.js";
import { config } from "./config.js";

export interface Env {
  corsOrigin: string;
  cacheKind: string;
}

const corsHeaders = (env: Env): Record<string, string> => ({
  "access-control-allow-origin": env.corsOrigin,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
});

function json(data: unknown, status = 200, env: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(env) },
  });
}

/** GET /api/threats — always served from cache. Never touches upstream. */
export async function handleThreats(req: Request, env: Env): Promise<Response> {
  let feed = await cache.get();

  // Cold cache: trigger one refresh in the background, return what we have.
  if (!feed) {
    const refreshPromise = runRefresh().catch(() => undefined);
    feed = (await cache.get()) ?? emptyFeed();
    void refreshPromise;
  }

  // Severity filter: ?severity=critical,high
  const url = new URL(req.url);
  const sevParam = url.searchParams.get("severity");
  if (sevParam && feed.events.length > 0) {
    const allowed = new Set(sevParam.split(","));
    feed = { ...feed, events: feed.events.filter((e) => allowed.has(e.severity)) };
  }

  return json(feed, 200, env);
}

/** POST /api/refresh — manually trigger ingestion (also used by cron). */
export async function handleRefresh(_req: Request, env: Env): Promise<Response> {
  const result = await runRefresh();
  return json(result, result.ok ? 200 : 502, env);
}

/** GET /api/health — runtime status for ops. */
export async function handleHealth(_req: Request, env: Env): Promise<Response> {
  const [feed, ollamaUp] = await Promise.all([cache.get(), ollamaHealth()]);
  return json(
    {
      status: "ok",
      cache: env.cacheKind,
      ollama: ollamaUp,
      feed: feed
        ? { updatedAt: feed.updatedAt, total: feed.total, sourceCount: feed.sourceCount }
        : null,
    },
    200,
    env,
  );
}

/** GET /api/stats — severity/category counts for the dashboard. */
export async function handleStats(_req: Request, env: Env): Promise<Response> {
  const feed = (await cache.get()) ?? emptyFeed();
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const e of feed.events) {
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }
  return json({ total: feed.total, bySeverity, byCategory, updatedAt: feed.updatedAt }, 200, env);
}

function emptyFeed(): ThreatFeed {
  return { updatedAt: new Date().toISOString(), sourceCount: 0, total: 0, events: [] };
}

// ─── Local dev server (thin router; replaceable by edge adapter) ───────────
type LocalRouter = { handle(req: Request): Promise<Response> };

export function createDevServer(): LocalRouter {
  const env: Env = { corsOrigin: config.corsOrigin, cacheKind: cache.backendKind };
  const routes: Array<[RegExp, "GET" | "POST", (req: Request, e: Env) => Promise<Response>]> = [
    [/^\/api\/threats$/, "GET", handleThreats],
    [/^\/api\/refresh$/, "POST", handleRefresh],
    [/^\/api\/health$/, "GET", handleHealth],
    [/^\/api\/stats$/, "GET", handleStats],
  ];

  return {
    async handle(req: Request): Promise<Response> {
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders(env) });
      }
      const url = new URL(req.url);
      for (const [re, method, fn] of routes) {
        if (re.test(url.pathname) && method === req.method) {
          try {
            return await fn(req, env);
          } catch (err) {
            return json({ error: String(err) }, 500, env);
          }
        }
      }
      return json({ error: "not found" }, 404, env);
    },
  };
}


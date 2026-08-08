/**
 * Local dev server entrypoint (Node ≥ 20, native fetch).
 * npm run dev → tsx watch; npm start → tsx.
 */
import { createServer } from "node:http";
import { config } from "./config.js";
import { createDevServer } from "./server.js";
import { runRefresh } from "./ingest/pipeline.js";
import { ollamaHealth } from "./ai/ollama.js";

const app = createDevServer();

const server = createServer((req, res) => {
  // buffer the (tiny) request body so handlers get a real Request
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : body,
    });
    try {
      const response = await app.handle(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
});

async function bootstrap(): Promise<void> {
  const ollamaUp = await ollamaHealth();
  console.log(`🧠 Ollama: ${ollamaUp ? "connected ✅" : "DOWN ❌ (AI fallback = heuristics)"}`);
  console.log(`🗃️  Cache: ${config.upstashUrl ? "Upstash Redis (free tier)" : "in-memory (local dev)"}`);
  console.log(`🤖 AI engine: ${config.aiEngine} (${config.ollamaModel})`);

  // First refresh on boot so the dashboard has data immediately.
  console.log("⏳ Running initial ingestion...");
  const t0 = Date.now();
  const result = await runRefresh();
  console.log(
    `✅ Ingestion done in ${Date.now() - t0}ms: ${result.fetched} fetched, ` +
      `${result.stored} stored, ${result.aiProcessed} AI-processed, ` +
      `sources ok=[${result.sourcesOk.join(",")}] failed=[${result.sourcesFailed.join(",")}]`,
  );

  // Scheduled refresh loop (interval from env, default 15 min).
  const intervalMs = Math.max(1, config.refreshIntervalMin) * 60_000;
  setInterval(() => {
    runRefresh()
      .then((r) => console.log(`🔄 Refresh: ${r.stored} events (${r.durationMs}ms)`))
      .catch((e) => console.error(`❌ Refresh failed: ${e}`));
  }, intervalMs);
  console.log(`⏰ Scheduled refresh every ${intervalMs / 60_000} min`);
}

server.listen(config.port, () => {
  console.log(`🌍 HTE Threat Monitor backend on http://127.0.0.1:${config.port}`);
});
void bootstrap();

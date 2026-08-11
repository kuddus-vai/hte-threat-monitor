/**
 * Pre-warm article cache — generates AI articles for the top events NOW so
 * user clicks load instantly (no 30-120s Ollama wait on first visit).
 *
 * Usage: npx tsx scripts/prewarm-articles.ts [limit]
 */
import { cache } from "../src/cache/cache.js";
import { getArticle } from "../src/ingest/article.js";

const LIMIT = Number(process.argv[2] ?? 10);

async function main(): Promise<void> {
  const feed = await cache.get();
  if (!feed || feed.events.length === 0) {
    console.log("no feed yet — run after ingestion");
    process.exit(1);
  }

  // priority: critical → high → recent
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  const top = [...feed.events]
    .sort((a, b) => {
      const r = (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
      return r !== 0 ? r : (a.publishedAt < b.publishedAt ? 1 : -1);
    })
    .slice(0, LIMIT);

  let ok = 0;
  const t0 = Date.now();
  for (const e of top) {
    try {
      const a = await getArticle(e, feed.events, false);
      const cached = a.aiGenerated ? "AI" : "fallback";
      console.log(`[${cached}] ${a.severity.padEnd(8)} ${a.seoTitle.slice(0, 60)}`);
      ok++;
    } catch (err) {
      console.log(`[FAIL] ${e.id}: ${String(err).slice(0, 80)}`);
    }
  }
  console.log(`\nprewarmed ${ok}/${top.length} articles in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

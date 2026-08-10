/**
 * Article pipeline — turns a threat event into an ORIGINAL AI-written article
 * (facts from the event summary; text generated fresh by Ollama — never copies
 * the source article). Cached in Upstash (hte:article:v1:<id>) so each event
 * generates once. Legal: attribution + one source link; original wording.
 */
import type { ThreatEvent } from "../types.js";
import { config } from "../config.js";
import { ollamaChat } from "../ai/ollama.js";
import { cache } from "../cache/cache.js";

export interface Article {
  id: string;
  seoTitle: string;
  description: string;
  body: string; // markdown-ish paragraphs
  category: string;
  severity: string;
  country?: string;
  actor?: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  generatedAt: string;
  aiGenerated: boolean;
  jsonLd: Record<string, unknown>;
}

const key = (id: string) => `hte:article:v1:${id}`;

export async function readCachedArticle(id: string): Promise<Article | null> {
  if (!config.upstashUrl) return null;
  try {
    const res = await fetch(`${config.upstashUrl}/get/${key(id)}`, {
      headers: { authorization: `Bearer ${config.upstashToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json()) as { result?: string };
    return data?.result ? (JSON.parse(data.result) as Article) : null;
  } catch {
    return null;
  }
}

async function readCached(id: string): Promise<Article | null> {
  return readCachedArticle(id);
}

async function writeCached(article: Article): Promise<void> {
  if (!config.upstashUrl) return;
  try {
    const res = await fetch(`${config.upstashUrl}/set/${key(article.id)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.upstashToken}`, "content-type": "application/json" },
      body: JSON.stringify(article),
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      await fetch(`${config.upstashUrl}/expire/${key(article.id)}/172800`, {
        headers: { authorization: `Bearer ${config.upstashToken}` },
        signal: AbortSignal.timeout(5_000),
      });
    }
  } catch {
    /* non-fatal */
  }
}

function fallbackBody(e: ThreatEvent): string {
  const country = e.country ? ` The incident is associated with ${e.country}.` : "";
  const actor = e.actor ? ` Threat actor ${e.actor} has been linked to this activity.` : "";
  return [
    `${e.summary}${country}${actor}`,
    `The event was reported by ${e.source} and has been classified as a ${e.severity}-severity ${e.category.replace("_", " ")} incident.`,
    `Organizations exposed to this threat class should review their defensive posture, verify patch levels on affected systems, and monitor for indicators of compromise linked to this activity.`,
    `This briefing is generated automatically by the HTE Threat Monitor from publicly reported information. For full technical detail, refer to the original report linked below.`,
  ].join("\n\n");
}

const SYSTEM_PROMPT = `You are a cybersecurity journalist writing a concise, factual article from a threat-event brief. Write ORIGINAL prose — do not quote or reproduce any source text. Output ONLY JSON:
{"seoTitle":"<60-70 char, keyword-rich headline>","description":"<<140 char meta description>","body":"<3-5 short paragraphs separated by \\n\\n, 300-500 words total, plain text, no markdown headers>"}`;

/** Generate (or fetch cached) article for an event. */
export async function getArticle(
  e: ThreatEvent,
  related: ThreatEvent[],
  force = false,
): Promise<Article> {
  const cached = force ? null : await readCached(e.id);
  if (cached) return cached;

  let aiGenerated = false;
  let seoTitle = `${e.severity} ${e.category.replace("_", " ")} — ${e.title.slice(0, 70)}`;
  let description = e.summary.slice(0, 140);
  let body = fallbackBody(e);

  if (config.aiEngine === "ollama") {
    try {
      const raw = await ollamaChat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Event: ${e.title}\nBrief: ${e.summary}\nCategory: ${e.category}\nSeverity: ${e.severity}\nCountry: ${e.country ?? "unknown"}\nActor: ${e.actor ?? "unknown"}\nSource: ${e.source}`,
          },
        ],
        { timeoutMs: 120_000 },
      );
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const p = JSON.parse(raw.slice(start, end + 1));
        seoTitle = String(p.seoTitle ?? seoTitle).slice(0, 100);
        description = String(p.description ?? description).slice(0, 200);
        body = String(p.body ?? body).slice(0, 3000);
        aiGenerated = true;
      }
    } catch {
      /* keep fallback */
    }
  }

  const relatedIds = related.filter((r) => r.id !== e.id).slice(0, 4).map((r) => r.id);
  const article: Article = {
    id: e.id,
    seoTitle,
    description,
    body,
    category: e.category,
    severity: e.severity,
    country: e.country,
    actor: e.actor,
    source: e.source,
    sourceUrl: e.url,
    publishedAt: e.publishedAt,
    generatedAt: new Date().toISOString(),
    aiGenerated,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: seoTitle,
      description,
      datePublished: e.publishedAt,
      author: { "@type": "Organization", name: "High Tech Enterprise" },
      publisher: { "@type": "Organization", name: "High Tech Enterprise" },
      mainEntityOfPage: { "@type": "WebPage" },
      about: { "@type": "Thing", name: e.category.replace("_", " ") },
      mentions: relatedIds.map((id) => ({ "@type": "Thing", identifier: id })),
    },
  };
  await writeCached(article);
  return article;
}

/** Sitemap URLs from the current feed. */
export async function sitemapUrls(base: string): Promise<string[]> {
  const feed = await cache.get();
  const events = feed?.events ?? [];
  const urls = events.map((e) => `${base}/#/article/${encodeURIComponent(e.id)}`);
  urls.unshift(`${base}/`);
  return urls.slice(0, 500);
}

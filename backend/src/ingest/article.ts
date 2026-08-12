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
import { articleSlug } from "../slug.js";

export interface Article {
  id: string;
  slug: string;
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
  faq: Array<{ q: string; a: string }>; // GEO/AEO answer-format Q&A
}

const key = (id: string) => `hte:article:v2:${id}`;

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
  const rawTitle = e.title.slice(0, 70);
  // avoid "critical critical …" when the source title already carries severity
  const sevWord = e.severity.charAt(0).toUpperCase() + e.severity.slice(1);
  const hasSevPrefix = new RegExp(`^${sevWord}\\b`, "i").test(e.title);
  let seoTitle = hasSevPrefix
    ? rawTitle
    : `${e.severity} ${e.category.replace("_", " ")} — ${rawTitle}`;
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
  const slug = articleSlug(e.title, e.id);
  // GEO/AEO: answer-format Q&A built from the event facts (deterministic, original wording)
  const faq: Array<{ q: string; a: string }> = [
    {
      q: `What is the ${e.category.replace("_", " ")} incident reported by ${e.source}?`,
      a: `${e.summary.slice(0, 220)} The threat was classified as ${e.severity}-severity and affects entities associated with ${e.country || "multiple regions"}.`,
    },
    {
      q: `What should organizations do about this ${e.category.replace("_", " ")} threat?`,
      a: "Verify patch levels on affected systems, monitor for indicators of compromise, review exposure to the affected attack surface, and follow the mitigation guidance in the original report linked on this page.",
    },
  ];
  const article: Article = {
    id: e.id,
    slug,
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
    faq,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: seoTitle,
      description,
      datePublished: e.publishedAt,
      author: { "@type": "Organization", name: "High Tech Enterprise" },
      publisher: { "@type": "Organization", name: "High Tech Enterprise" },
      mainEntityOfPage: { "@type": "WebPage", "@id": `/article/${slug}` },
      url: `/article/${slug}`,
      about: { "@type": "Thing", name: e.category.replace("_", " ") },
      mentions: relatedIds.length
        ? [
            { "@type": "Thing", name: e.actor || e.category.replace("_", " "), identifier: e.actor || undefined },
            ...relatedIds.map((id) => ({ "@type": "Thing", identifier: id })),
          ]
        : undefined,
      speaksAbout: faq.map((f) => ({ "@type": "Question", name: f.q })),
    },
  };
  // Fire-and-forget cache write: NEVER block the response on Upstash.
  // A slow/hanging cache must not leave the user staring at an empty shell.
  void writeCached(article).catch(() => {});
  return article;
}

/** Find the event matching an /article/<segment> — segment = slug OR raw event id. */
export async function resolveArticleSegment(segment: string): Promise<{ event: ThreatEvent; related: ThreatEvent[] } | null> {
  const feed = await cache.get();
  const events = feed?.events ?? [];
  const hashSegment = decodeURIComponent(segment);
  const find = (e: ThreatEvent) =>
    e.id === hashSegment || articleSlug(e.title, e.id) === hashSegment || articleSlug(e.title, e.id) === hashSegment.replace(/-[a-z0-9]{6}$/, "");
  const event = events.find(find);
  if (!event) return null;
  const related = events
    .filter((r) => r.id !== event.id && (r.category === event.category || r.country === event.country))
    .slice(0, 6);
  return { event, related };
}

/** Sitemap URLs (SEO slugs) from the current feed. */
export async function sitemapUrls(base: string): Promise<string[]> {
  const feed = await cache.get();
  const events = feed?.events ?? [];
  const urls = events.map((e) => `${base}/article/${articleSlug(e.title, e.id)}`);
  urls.unshift(`${base}/`);
  return urls.slice(0, 500);
}

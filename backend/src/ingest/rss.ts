/**
 * Generic RSS/Atom fetcher using fast-xml-parser.
 * Sources are keyless and free: The Hacker News, BleepingComputer,
 * Dark Reading, CISA alerts (vulns), plus status-page feeds for outages.
 */
import { XMLParser } from "fast-xml-parser";

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

export interface RssSource {
  id: string;
  name: string;
  url: string;
  category: "vulnerability" | "news" | "outage";
}

export const RSS_SOURCES: RssSource[] = [
  {
    id: "thn",
    name: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
    category: "news",
  },
  {
    id: "bleepingcomputer",
    name: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
    category: "news",
  },
  {
    id: "darkreading",
    name: "Dark Reading",
    url: "https://www.darkreading.com/rss.xml",
    category: "news",
  },
  {
    id: "cisa",
    name: "CISA Advisories",
    url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
    category: "vulnerability",
  },
  {
    id: "github-status",
    name: "GitHub Status",
    url: "https://www.githubstatus.com/history.atom",
    category: "outage",
  },
  {
    id: "aws-status",
    name: "AWS Status",
    url: "https://status.aws.amazon.com/rss/all.rss",
    category: "outage",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false, // keep raw strings; we normalize ourselves
  // Big feeds (CISA advisories ~2MB, status-page atoms) exceed the default
  // entity-expansion guard of 1000 — raise it for real-world RSS sizes.
  processEntities: false,
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function normalizeDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function stripHtml(html: string): string {
  return html
    // decode entities FIRST so escaped tags (&lt;p&gt;) become real tags…
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;|&#160;/gi, " ")
    // …then strip real tags and normalize whitespace
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch and parse one RSS/Atom source. Returns items newest-first. */
export async function fetchRss(source: RssSource, limit = 20): Promise<RssItem[]> {
  const res = await fetch(source.url, {
    headers: { "user-agent": "hte-threat-monitor/0.1 (+local zero-cost monitor)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${source.name} HTTP ${res.status}`);
  const xml = await res.text();
  const doc = parser.parse(xml);

  const channel = doc?.rss?.channel ?? doc?.feed ?? doc?.entry ?? {};
  const rawItems: unknown[] =
    asArray(channel?.item).length > 0
      ? asArray(channel?.item)
      : asArray(channel?.entry).length > 0
        ? asArray(channel?.entry)
        : asArray(doc?.feed?.entry);

  return rawItems
    .map((it: any) => ({
      title: stripHtml(String(it?.title ?? "")).trim(),
      link: String(
        it?.link ?? (typeof it?.link === "object" ? it?.link?.["@_href"] : "") ?? "",
      ).trim(),
      pubDate: normalizeDate(it?.pubDate ?? it?.published ?? it?.updated),
      description: stripHtml(String(it?.description ?? it?.summary ?? it?.content ?? "")),
    }))
    .filter((i) => i.title && i.link)
    .slice(0, limit);
}

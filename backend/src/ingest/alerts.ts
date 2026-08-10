/**
 * Alert engine — pushes NEW critical/high events to ntfy.sh (zero-account,
 * free) and optionally a Telegram bot. Dedupes via an Upstash set of seen IDs
 * so each event alerts exactly once.
 */
import type { ThreatEvent } from "../types.js";
import { config } from "../config.js";

const SEEN_KEY = "hte:alerted:v1";

async function seenIds(): Promise<Set<string>> {
  if (!config.upstashUrl) return new Set();
  try {
    const res = await fetch(`${config.upstashUrl}/smembers/${SEEN_KEY}`, {
      headers: { authorization: `Bearer ${config.upstashToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json()) as { result?: string[] };
    return new Set(data?.result ?? []);
  } catch {
    return new Set();
  }
}

async function markSeen(ids: string[]): Promise<void> {
  if (!config.upstashUrl || ids.length === 0) return;
  try {
    const res = await fetch(`${config.upstashUrl}/sadd/${SEEN_KEY}`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.upstashToken}`, "content-type": "application/json" },
      body: JSON.stringify(ids),
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      await fetch(`${config.upstashUrl}/expire/${SEEN_KEY}/604800`, {
        headers: { authorization: `Bearer ${config.upstashToken}` },
        signal: AbortSignal.timeout(5_000),
      });
    }
  } catch {
    /* non-fatal */
  }
}

async function ntfyPush(title: string, body: string, tags: string, url: string): Promise<void> {
  if (!config.ntfyTopic) return;
  try {
    await fetch(`https://ntfy.sh/${config.ntfyTopic}`, {
      method: "POST",
      headers: {
        title: `🚨 HTE ALERT: ${title.slice(0, 60)}`,
        tags: tags,
        click: url,
        priority: "high",
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* non-fatal */
  }
}

async function telegramPush(title: string, body: string, url: string): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;
  try {
    const text = `🚨 <b>${escapeTg(title)}</b>\n${escapeTg(body)}\n<a href="${url}">Open</a>`;
    await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegramChatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* non-fatal */
  }
}

function escapeTg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Called after each refresh. Alerts once per new critical/high event.
 * Returns how many alerts were fired.
 */
export async function runAlerts(events: ThreatEvent[]): Promise<number> {
  const fresh = events.filter((e) => e.severity === "critical" || e.severity === "high");
  if (fresh.length === 0) return 0;

  const seen = await seenIds();
  const newOnes = fresh.filter((e) => !seen.has(e.id));
  if (newOnes.length === 0) return 0;

  let fired = 0;
  for (const e of newOnes.slice(0, 10)) {
    const tag = e.category === "ransomware" ? "skull" : e.category === "data_breach" ? "warning" : "rotating_light";
    const body = `${e.title}\n\n${e.summary.slice(0, 180)}${e.country ? `\n🌍 ${e.country}` : ""}${e.actor ? `\n🎭 ${e.actor}` : ""}\n${e.source}`;
    await ntfyPush(e.title, body, tag, e.url);
    await telegramPush(e.title, `${e.summary.slice(0, 180)}${e.country ? `\n🌍 ${e.country}` : ""} · ${e.source}`, e.url);
    fired++;
  }

  await markSeen(newOnes.map((e) => e.id));
  return fired;
}

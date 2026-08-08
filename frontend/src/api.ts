import type { ThreatEvent, ThreatFeed } from "../../backend/src/types";

export const SEV_COLORS: Record<string, string> = {
  critical: "#f43f5e",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

export const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export async function fetchFeed(): Promise<ThreatFeed> {
  const res = await fetch("/api/threats");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ThreatFeed;
}

export async function fetchHealth(): Promise<{ status: string; cache: string; ollama: boolean; feed: unknown }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as never;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + fmtTime(iso);
}

export function withCoords(events: ThreatEvent[]): ThreatEvent[] {
  return events.filter((e) => e.lat !== undefined && e.lon !== undefined);
}

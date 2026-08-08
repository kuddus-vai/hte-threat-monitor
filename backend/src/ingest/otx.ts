/**
 * AlienVault OTX (Open Threat Exchange) client — free community API.
 * Requires OTX_API_KEY; when absent the pipeline simply skips OTX.
 * Docs: https://otx.alienvault.com/api
 */
import type { ThreatEvent } from "../types.js";

export interface OtxPulse {
  id: string;
  name: string;
  description: string;
  created: string;
  modified: string;
  indicator_count: number;
  references?: string[];
  tags?: string[];
  adversary?: string;
}

export async function fetchOtxPulses(apiKey: string, limit = 15): Promise<OtxPulse[]> {
  if (!apiKey) return [];
  const url = `https://otx.alienvault.com/api/v1/pulses/subscribed?limit=${limit}&page=1`;
  const res = await fetch(url, {
    headers: { "X-OTX-API-KEY": apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OTX HTTP ${res.status}`);
  const data = (await res.json()) as { results?: OtxPulse[] };
  return data.results ?? [];
}

export function otxPulseToEvent(p: OtxPulse): ThreatEvent {
  return {
    id: `otx-${p.id}`,
    title: p.name,
    summary: (p.description || "").slice(0, 400),
    category: "other",
    severity: "medium",
    source: "AlienVault OTX",
    url: `https://otx.alienvault.com/pulse/${p.id}`,
    publishedAt: new Date(p.created).toISOString(),
    aiProcessed: false,
  };
}

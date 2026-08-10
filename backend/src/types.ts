/**
 * Shared threat-domain types for the whole monorepo.
 * Backend produces these; frontend consumes them.
 */

export type ThreatSeverity = "low" | "medium" | "high" | "critical";

export type ThreatCategory =
  | "malware"
  | "ransomware"
  | "phishing"
  | "data_breach"
  | "vulnerability"
  | "outage"
  | "apt"
  | "other";

export interface ThreatEvent {
  id: string;
  title: string;
  summary: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  source: string;
  url: string;
  publishedAt: string; // ISO
  country?: string; // ISO-3166 alpha-2 if inferred
  city?: string;
  lat?: number;
  lon?: number;
  actor?: string; // threat actor / group / vendor if identifiable
  aiProcessed: boolean; // true when Ollama extracted the fields
}

export interface ThreatFeed {
  updatedAt: string; // ISO of last successful refresh
  sourceCount: number;
  total: number;
  events: ThreatEvent[];
}

export interface TrendPoint {
  ts: string; // ISO hour bucket
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface TrendSeries {
  points: TrendPoint[];
  updatedAt: string;
}

export interface RefreshResult {
  ok: boolean;
  fetched: number;
  stored: number;
  aiProcessed: number;
  alerted: number;
  sourcesOk: string[];
  sourcesFailed: string[];
  durationMs: number;
  at: string;
}

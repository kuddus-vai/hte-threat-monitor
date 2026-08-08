/**
 * Unit tests for the core pipeline pieces (no test framework — plain asserts,
 * run with: npx tsx backend/test/run-tests.ts)
 */
import { resolveLocation, findCountryInText } from "../src/geo/countries.js";
import { heuristicExtract } from "../src/ai/heuristics.js";
import { normalizeSeverity, normalizeCategory } from "../src/ai/heuristics.js";

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── geo resolution ──────────────────────────────────────────
console.log("\n🌍 resolveLocation");
{
  const r = resolveLocation("Germany");
  assert(eq(r, { country: "DE", lat: 51.1657, lon: 10.4515 }), "country name → DE");
  const r2 = resolveLocation("London");
  assert(r2.country === "GB" && r2.lat === 51.5074, "city → GB/London", JSON.stringify(r2));
  const r3 = resolveLocation("IN");
  assert(r3.country === "IN", "alpha-2 code → IN");
  const r4 = resolveLocation("Germany and France");
  assert(r4.country === "DE" || r4.country === "FR", "multi-location split", JSON.stringify(r4));
  const r5 = resolveLocation("");
  assert(eq(r5, {}), "empty → {}");
  const r6 = resolveLocation("UnknownPlaceXYZ");
  assert(eq(r6, {}), "unknown → {}");
  const r7 = resolveLocation("Dhaka");
  assert(r7.country === "BD", "city → BD", JSON.stringify(r7));
}

console.log("\n🔍 findCountryInText");
{
  const r = findCountryInText("A ransomware gang hit hospitals in France");
  assert(r.country === "FR", "finds France in free text", JSON.stringify(r));
  const r2 = findCountryInText("No location mentioned here");
  assert(eq(r2, {}), "no match → {}", JSON.stringify(r2));
}

// ── heuristics ──────────────────────────────────────────────
console.log("\n🧠 heuristicExtract");
{
  const r = heuristicExtract(
    "New ransomware gang hits hospitals",
    "LockBit-style encryptors deployed against three hospitals, ransom demanded",
  );
  assert(r.category === "ransomware", "ransomware category", r.category);
  assert(r.severity === "high", "ransomware severity=high", r.severity);

  const r2 = heuristicExtract("CVE-2026-1234 zero-day exploited", "Actively exploited in the wild");
  assert(r2.category === "vulnerability", "CVE → vulnerability", r2.category);
  assert(r2.severity === "critical", "actively exploited → critical", r2.severity);

  const r3 = heuristicExtract("Phishing campaign targets bank customers", "Fake login pages");
  assert(r3.category === "phishing", "phishing category", r3.category);
}

// ── normalizers (AI output → enum) ─────────────────────────
console.log("\n🔧 normalizeSeverity / normalizeCategory");
{
  assert(normalizeSeverity("High") === "high", "High → high");
  assert(normalizeSeverity("CRITICAL") === "critical", "CRITICAL → critical");
  assert(normalizeSeverity("Moderate") === "medium", "Moderate → medium");
  assert(normalizeSeverity("") === "medium", "empty → medium");
  assert(normalizeCategory("Ransomware Attack") === "ransomware", "Ransomware Attack → ransomware");
  assert(normalizeCategory("Data Breach") === "data_breach", "Data Breach → data_breach");
  assert(normalizeCategory("Zero-day exploit") === "vulnerability", "Zero-day → vulnerability");
  assert(normalizeCategory("Weird Thing") === "other", "unknown → other");
}

console.log(`\n${"=".repeat(40)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

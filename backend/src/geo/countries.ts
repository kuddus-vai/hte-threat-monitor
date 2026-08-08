/**
 * Lightweight country-name/code → coordinates resolution.
 * Used to map AI-inferred locations to map points. Covers the countries
 * that dominate threat-intel reporting; extends trivially.
 */

interface Country {
  name: string;
  code: string;
  lat: number;
  lon: number;
}

const COUNTRIES: Country[] = [
  { name: "united states", code: "US", lat: 39.8283, lon: -98.5795 },
  { name: "usa", code: "US", lat: 39.8283, lon: -98.5795 },
  { name: "america", code: "US", lat: 39.8283, lon: -98.5795 },
  { name: "canada", code: "CA", lat: 56.1304, lon: -106.3468 },
  { name: "mexico", code: "MX", lat: 23.6345, lon: -102.5528 },
  { name: "brazil", code: "BR", lat: -14.235, lon: -51.9253 },
  { name: "argentina", code: "AR", lat: -38.4161, lon: -63.6167 },
  { name: "colombia", code: "CO", lat: 4.5709, lon: -74.2973 },
  { name: "united kingdom", code: "GB", lat: 55.3781, lon: -3.436 },
  { name: "uk", code: "GB", lat: 55.3781, lon: -3.436 },
  { name: "britain", code: "GB", lat: 55.3781, lon: -3.436 },
  { name: "england", code: "GB", lat: 52.3555, lon: -1.1743 },
  { name: "france", code: "FR", lat: 46.2276, lon: 2.2137 },
  { name: "germany", code: "DE", lat: 51.1657, lon: 10.4515 },
  { name: "netherlands", code: "NL", lat: 52.1326, lon: 5.2913 },
  { name: "belgium", code: "BE", lat: 50.5039, lon: 4.4699 },
  { name: "switzerland", code: "CH", lat: 46.8182, lon: 8.2275 },
  { name: "austria", code: "AT", lat: 47.5162, lon: 14.5501 },
  { name: "italy", code: "IT", lat: 41.8719, lon: 12.5674 },
  { name: "spain", code: "ES", lat: 40.4637, lon: -3.7492 },
  { name: "portugal", code: "PT", lat: 39.3999, lon: -8.2245 },
  { name: "sweden", code: "SE", lat: 60.1282, lon: 18.6435 },
  { name: "norway", code: "NO", lat: 60.472, lon: 8.4689 },
  { name: "denmark", code: "DK", lat: 56.2639, lon: 9.5018 },
  { name: "finland", code: "FI", lat: 61.9241, lon: 25.7482 },
  { name: "poland", code: "PL", lat: 51.9194, lon: 19.1451 },
  { name: "ukraine", code: "UA", lat: 48.3794, lon: 31.1656 },
  { name: "russia", code: "RU", lat: 61.524, lon: 105.3188 },
  { name: "belarus", code: "BY", lat: 53.7098, lon: 27.9534 },
  { name: "romania", code: "RO", lat: 45.9432, lon: 24.9668 },
  { name: "czech republic", code: "CZ", lat: 49.8175, lon: 15.473 },
  { name: "czechia", code: "CZ", lat: 49.8175, lon: 15.473 },
  { name: "greece", code: "GR", lat: 39.0742, lon: 21.8243 },
  { name: "turkey", code: "TR", lat: 38.9637, lon: 35.2433 },
  { name: "israel", code: "IL", lat: 31.0461, lon: 34.8516 },
  { name: "saudi arabia", code: "SA", lat: 23.8859, lon: 45.0792 },
  { name: "uae", code: "AE", lat: 23.4241, lon: 53.8478 },
  { name: "united arab emirates", code: "AE", lat: 23.4241, lon: 53.8478 },
  { name: "iran", code: "IR", lat: 32.4279, lon: 53.688 },
  { name: "iraq", code: "IQ", lat: 33.2232, lon: 43.6793 },
  { name: "india", code: "IN", lat: 20.5937, lon: 78.9629 },
  { name: "pakistan", code: "PK", lat: 30.3753, lon: 69.3451 },
  { name: "bangladesh", code: "BD", lat: 23.685, lon: 90.3563 },
  { name: "china", code: "CN", lat: 35.8617, lon: 104.1954 },
  { name: "japan", code: "JP", lat: 36.2048, lon: 138.2529 },
  { name: "south korea", code: "KR", lat: 35.9078, lon: 127.7669 },
  { name: "north korea", code: "KP", lat: 40.3399, lon: 127.5101 },
  { name: "taiwan", code: "TW", lat: 23.6978, lon: 120.9605 },
  { name: "hong kong", code: "HK", lat: 22.3193, lon: 114.1694 },
  { name: "singapore", code: "SG", lat: 1.3521, lon: 103.8198 },
  { name: "malaysia", code: "MY", lat: 4.2105, lon: 101.9758 },
  { name: "indonesia", code: "ID", lat: -0.7893, lon: 113.9213 },
  { name: "vietnam", code: "VN", lat: 14.0583, lon: 108.2772 },
  { name: "thailand", code: "TH", lat: 15.87, lon: 100.9925 },
  { name: "philippines", code: "PH", lat: 12.8797, lon: 121.774 },
  { name: "australia", code: "AU", lat: -25.2744, lon: 133.7751 },
  { name: "new zealand", code: "NZ", lat: -40.9006, lon: 174.886 },
  { name: "nigeria", code: "NG", lat: 9.082, lon: 8.6753 },
  { name: "south africa", code: "ZA", lat: -30.5595, lon: 22.9375 },
  { name: "egypt", code: "EG", lat: 26.8206, lon: 30.8025 },
  { name: "kenya", code: "KE", lat: -0.0236, lon: 37.9062 },
  { name: "morocco", code: "MA", lat: 31.7917, lon: -7.0926 },
];

// Also match 2-letter country codes directly (US, IN, DE, ...)
const byCode = new Map<string, Country>();
for (const c of COUNTRIES) byCode.set(c.code, c);

/** Find coordinates for a location string (country name, code, or city hint). */
export function resolveLocation(text: string): { country?: string; lat?: number; lon?: number } {
  if (!text) return {};

  // try full string, then split on common multi-location separators
  const parts = text
    .split(/,|\band\b|&|;|\//i)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of [text, ...parts]) {
    const t = part.toLowerCase();
    if (!t) continue;

    // exact alpha-2 code
    if (/^[a-z]{2}$/.test(t)) {
      const c = byCode.get(t.toUpperCase());
      if (c) return { country: c.code, lat: c.lat, lon: c.lon };
    }

    for (const c of COUNTRIES) {
      if (t === c.name || t.includes(c.name) || c.name.includes(t)) {
        return { country: c.code, lat: c.lat, lon: c.lon };
      }
    }
  }
  return {};
}

/** Best-effort: scan free text for any known country mention. */
export function findCountryInText(text: string): { country?: string; lat?: number; lon?: number } {
  const t = (text || "").toLowerCase();
  let best: Country | undefined;
  for (const c of COUNTRIES) {
    if (t.includes(c.name) && (c.name.length > (best?.name.length || 0))) {
      best = c;
    }
  }
  if (!best) return {};
  return { country: best.code, lat: best.lat, lon: best.lon };
}

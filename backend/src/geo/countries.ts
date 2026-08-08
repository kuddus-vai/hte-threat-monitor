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

// Major cities — the AI frequently names a city instead of a country.
interface City { name: string; country: string; lat: number; lon: number; }
const CITIES: City[] = [
  { name: "washington dc", country: "US", lat: 38.9072, lon: -77.0369 },
  { name: "washington", country: "US", lat: 38.9072, lon: -77.0369 },
  { name: "new york", country: "US", lat: 40.7128, lon: -74.006 },
  { name: "san francisco", country: "US", lat: 37.7749, lon: -122.4194 },
  { name: "los angeles", country: "US", lat: 34.0522, lon: -118.2437 },
  { name: "chicago", country: "US", lat: 41.8781, lon: -87.6298 },
  { name: "austin", country: "US", lat: 30.2672, lon: -97.7431 },
  { name: "seattle", country: "US", lat: 47.6062, lon: -122.3321 },
  { name: "london", country: "GB", lat: 51.5074, lon: -0.1278 },
  { name: "manchester", country: "GB", lat: 53.4808, lon: -2.2426 },
  { name: "paris", country: "FR", lat: 48.8566, lon: 2.3522 },
  { name: "berlin", country: "DE", lat: 52.52, lon: 13.405 },
  { name: "munich", country: "DE", lat: 48.1351, lon: 11.582 },
  { name: "amsterdam", country: "NL", lat: 52.3676, lon: 4.9041 },
  { name: "brussels", country: "BE", lat: 50.8503, lon: 4.3517 },
  { name: "zurich", country: "CH", lat: 47.3769, lon: 8.5417 },
  { name: "geneva", country: "CH", lat: 46.2044, lon: 6.1432 },
  { name: "vienna", country: "AT", lat: 48.2082, lon: 16.3738 },
  { name: "rome", country: "IT", lat: 41.9028, lon: 12.4964 },
  { name: "milan", country: "IT", lat: 45.4642, lon: 9.19 },
  { name: "madrid", country: "ES", lat: 40.4168, lon: -3.7038 },
  { name: "barcelona", country: "ES", lat: 41.3874, lon: 2.1686 },
  { name: "lisbon", country: "PT", lat: 38.7223, lon: -9.1393 },
  { name: "stockholm", country: "SE", lat: 59.3293, lon: 18.0686 },
  { name: "oslo", country: "NO", lat: 59.9139, lon: 10.7522 },
  { name: "copenhagen", country: "DK", lat: 55.6761, lon: 12.5683 },
  { name: "helsinki", country: "FI", lat: 60.1699, lon: 24.9384 },
  { name: "warsaw", country: "PL", lat: 52.2297, lon: 21.0122 },
  { name: "kyiv", country: "UA", lat: 50.4501, lon: 30.5234 },
  { name: "kiev", country: "UA", lat: 50.4501, lon: 30.5234 },
  { name: "moscow", country: "RU", lat: 55.7558, lon: 37.6173 },
  { name: "st petersburg", country: "RU", lat: 59.9311, lon: 30.3609 },
  { name: "minsk", country: "BY", lat: 53.9006, lon: 27.559 },
  { name: "bucharest", country: "RO", lat: 44.4268, lon: 26.1025 },
  { name: "prague", country: "CZ", lat: 50.0755, lon: 14.4378 },
  { name: "athens", country: "GR", lat: 37.9838, lon: 23.7275 },
  { name: "istanbul", country: "TR", lat: 41.0082, lon: 28.9784 },
  { name: "ankara", country: "TR", lat: 39.9334, lon: 32.8597 },
  { name: "tel aviv", country: "IL", lat: 32.0853, lon: 34.7818 },
  { name: "jerusalem", country: "IL", lat: 31.7683, lon: 35.2137 },
  { name: "riyadh", country: "SA", lat: 24.7136, lon: 46.6753 },
  { name: "dubai", country: "AE", lat: 25.2048, lon: 55.2708 },
  { name: "tehran", country: "IR", lat: 35.6892, lon: 51.389 },
  { name: "baghdad", country: "IQ", lat: 33.3152, lon: 44.3661 },
  { name: "new delhi", country: "IN", lat: 28.6139, lon: 77.209 },
  { name: "delhi", country: "IN", lat: 28.6139, lon: 77.209 },
  { name: "mumbai", country: "IN", lat: 19.076, lon: 72.8777 },
  { name: "bengaluru", country: "IN", lat: 12.9716, lon: 77.5946 },
  { name: "bangalore", country: "IN", lat: 12.9716, lon: 77.5946 },
  { name: "hyderabad", country: "IN", lat: 17.385, lon: 78.4867 },
  { name: "kolkata", country: "IN", lat: 22.5726, lon: 88.3639 },
  { name: "chennai", country: "IN", lat: 13.0827, lon: 80.2707 },
  { name: "islamabad", country: "PK", lat: 33.6844, lon: 73.0479 },
  { name: "karachi", country: "PK", lat: 24.8607, lon: 67.0011 },
  { name: "dhaka", country: "BD", lat: 23.8103, lon: 90.4125 },
  { name: "beijing", country: "CN", lat: 39.9042, lon: 116.4074 },
  { name: "shanghai", country: "CN", lat: 31.2304, lon: 121.4737 },
  { name: "shenzhen", country: "CN", lat: 22.5431, lon: 114.0579 },
  { name: "hong kong", country: "HK", lat: 22.3193, lon: 114.1694 },
  { name: "tokyo", country: "JP", lat: 35.6762, lon: 139.6503 },
  { name: "osaka", country: "JP", lat: 34.6937, lon: 135.5023 },
  { name: "seoul", country: "KR", lat: 37.5665, lon: 126.978 },
  { name: "pyongyang", country: "KP", lat: 39.0392, lon: 125.7625 },
  { name: "taipei", country: "TW", lat: 25.033, lon: 121.5654 },
  { name: "singapore", country: "SG", lat: 1.3521, lon: 103.8198 },
  { name: "kuala lumpur", country: "MY", lat: 3.139, lon: 101.6869 },
  { name: "jakarta", country: "ID", lat: -6.2088, lon: 106.8456 },
  { name: "hanoi", country: "VN", lat: 21.0278, lon: 105.8342 },
  { name: "ho chi minh city", country: "VN", lat: 10.8231, lon: 106.6297 },
  { name: "bangkok", country: "TH", lat: 13.7563, lon: 100.5018 },
  { name: "manila", country: "PH", lat: 14.5995, lon: 120.9842 },
  { name: "sydney", country: "AU", lat: -33.8688, lon: 151.2093 },
  { name: "melbourne", country: "AU", lat: -37.8136, lon: 144.9631 },
  { name: "canberra", country: "AU", lat: -35.2809, lon: 149.13 },
  { name: "auckland", country: "NZ", lat: -36.8509, lon: 174.7645 },
  { name: "lagos", country: "NG", lat: 6.5244, lon: 3.3792 },
  { name: "abuja", country: "NG", lat: 9.0765, lon: 7.3986 },
  { name: "johannesburg", country: "ZA", lat: -26.2041, lon: 28.0473 },
  { name: "cape town", country: "ZA", lat: -33.9249, lon: 18.4241 },
  { name: "cairo", country: "EG", lat: 30.0444, lon: 31.2357 },
  { name: "nairobi", country: "KE", lat: -1.2921, lon: 36.8219 },
  { name: "casablanca", country: "MA", lat: 33.5731, lon: -7.5898 },
  { name: "sao paulo", country: "BR", lat: -23.5505, lon: -46.6333 },
  { name: "rio de janeiro", country: "BR", lat: -22.9068, lon: -43.1729 },
  { name: "buenos aires", country: "AR", lat: -34.6037, lon: -58.3816 },
  { name: "bogota", country: "CO", lat: 4.711, lon: -74.0721 },
  { name: "mexico city", country: "MX", lat: 19.4326, lon: -99.1332 },
  { name: "toronto", country: "CA", lat: 43.6532, lon: -79.3832 },
  { name: "ottawa", country: "CA", lat: 45.4215, lon: -75.6972 },
  { name: "vancouver", country: "CA", lat: 49.2827, lon: -123.1207 },
];

/** Find coordinates for a location string (city, country name, code). */
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

    // city match first (more specific)
    for (const c of CITIES) {
      if (t === c.name || t.includes(c.name)) {
        return { country: c.country, lat: c.lat, lon: c.lon };
      }
    }

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

/** Best-effort: scan free text for any known country or city mention. */
export function findCountryInText(text: string): { country?: string; lat?: number; lon?: number } {
  const t = (text || "").toLowerCase();
  let best: { country: string; lat: number; lon: number; len: number } | undefined;

  for (const c of COUNTRIES) {
    if (t.includes(c.name) && (c.name.length > (best?.len || 0))) {
      best = { country: c.code, lat: c.lat, lon: c.lon, len: c.name.length };
    }
  }
  // cities are more specific than countries — prefer the longest mention
  for (const c of CITIES) {
    if (t.includes(c.name) && (c.name.length > (best?.len || 0))) {
      best = { country: c.country, lat: c.lat, lon: c.lon, len: c.name.length };
    }
  }

  if (!best) return {};
  return { country: best.country, lat: best.lat, lon: best.lon };
}

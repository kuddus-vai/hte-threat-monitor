import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ThreatEvent } from "../../backend/src/types";
import { SEV_COLORS } from "./api";

/**
 * 2D tactical map (World Monitor style) — Leaflet + CartoDB dark tiles.
 * Default view. The 3D globe stays available via the toggle.
 */

let map: L.Map | null = null;
let markers: L.CircleMarker[] = [];
let arcLines: L.Polyline[] = [];
let labelMarkers: L.Marker[] = [];

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function initMap2d(el: HTMLElement): void {
  if (map) return;
  map = L.map(el, { zoomControl: true, attributionControl: true, minZoom: 2, maxZoom: 12 }).setView([20, 10], 2);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
}

export function updateMap2d(events: ThreatEvent[], opts: { points: boolean; arcs: boolean; labels: boolean }): void {
  if (!map) return;
  // clear
  markers.forEach((m) => m.remove());
  arcLines.forEach((l) => l.remove());
  labelMarkers.forEach((m) => m.remove());
  markers = [];
  arcLines = [];
  labelMarkers = [];

  const withCoords = events.filter((e) => e.lat !== undefined && e.lon !== undefined);

  if (opts.points) {
    for (const e of withCoords.slice(0, 120)) {
      const c = SEV_COLORS[e.severity] ?? "#888";
      const m = L.circleMarker([e.lat as number, e.lon as number], {
        radius: e.severity === "critical" ? 6 : e.severity === "high" ? 5 : 4,
        color: c,
        weight: 1,
        fillColor: c,
        fillOpacity: 0.75,
      });
      m.bindPopup(popupHtml(e));
      m.addTo(map!);
      markers.push(m);
    }
  }

  if (opts.arcs) {
    const pairs = computePairs(withCoords);
    for (const p of pairs.slice(0, 40)) {
      const line = L.polyline(p, { color: "rgba(56,189,248,0.55)", weight: 1.2, dashArray: "4 6", opacity: 0.7 }).addTo(map!);
      arcLines.push(line);
    }
  }

  if (opts.labels) {
    const seen = new Set<string>();
    for (const e of withCoords) {
      if (!e.country || seen.has(e.country)) continue;
      seen.add(e.country);
      const mk = L.marker([e.lat as number, e.lon as number], {
        icon: L.divIcon({
          className: "map2d-label",
          html: `<span>${e.country}</span>`,
          iconSize: [60, 14],
        }),
      });
      mk.addTo(map!);
      labelMarkers.push(mk);
    }
  }
}

export function resizeMap2d(): void {
  map?.invalidateSize();
}

/** geodesic-ish arc between same-actor/category country pairs */
function computePairs(events: ThreatEvent[]): Array<[number, number][]> {
  const out: Array<[number, number][]> = [];
  const pushChain = (evs: ThreatEvent[]) => {
    const byCountry = new Map<string, ThreatEvent>();
    for (const e of evs) if (e.country && !byCountry.has(e.country)) byCountry.set(e.country, e);
    const list = [...byCountry.values()];
    if (list.length < 2) return;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;
      const mid: [number, number] = [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2];
      out.push([
        [a.lat, a.lon],
        [mid[0] + 4, mid[1]],
        [b.lat, b.lon],
      ]);
    }
  };
  const byActor = new Map<string, ThreatEvent[]>();
  const byCat = new Map<string, ThreatEvent[]>();
  for (const e of events) {
    if (e.actor) (byActor.get(e.actor) ?? byActor.set(e.actor, []).get(e.actor)!).push(e);
    (byCat.get(e.category) ?? byCat.set(e.category, []).get(e.category)!).push(e);
  }
  for (const evs of byActor.values()) pushChain(evs);
  for (const evs of byCat.values()) pushChain(evs);
  return out;
}

function popupHtml(e: ThreatEvent): string {
  return `<div style="max-width:240px;font-family:system-ui,sans-serif;color:#111">
    <div style="font-weight:800;color:${SEV_COLORS[e.severity]};text-transform:uppercase;font-size:11px">${e.severity} · ${e.category.replace("_", " ")}</div>
    <div style="font-weight:600;margin:3px 0">${escapeHtml(e.title.slice(0, 80))}</div>
    <div style="font-size:11px;color:#555">${e.country ?? "unknown"} · ${e.source}</div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

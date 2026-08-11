import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ThreatEvent } from "../../backend/src/types";
import { SEV_COLORS } from "./api";

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
};

/**
 * 2D tactical map — MapLibre GL (same engine as World Monitor).
 * Raster dark basemap (free CARTO tiles, no key) + custom marker/arc layers.
 */

let map: maplibregl.Map | null = null;
let markerLayers: maplibregl.Marker[] = [];
let arcSourceId = "arcs";
let ringSourceId = "rings";

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export interface Map2dOptions {
  points: boolean;
  arcs: boolean;
  labels: boolean;
  rings: boolean;
  ransomware: boolean;
  apt: boolean;
  breach: boolean;
  vuln: boolean;
  outage: boolean;
  critical: boolean;
}

const ZONE_STYLE: Record<string, { color: string; glyph: string }> = {
  ransomware: { color: "#ff3333", glyph: "⬢" },
  apt: { color: "#a855f7", glyph: "▲" },
  breach: { color: "#ff7a45", glyph: "▣" },
  vuln: { color: "#eab308", glyph: "⚠" },
  outage: { color: "#9ca3af", glyph: "✕" },
  critical: { color: "#ff5555", glyph: "◎" },
};

export function initMap2d(el: HTMLElement): void {
  if (map) return;
  map = new maplibregl.Map({
    container: el,
    style: {
      version: 8,
      sources: {
        carto: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          ],
          tileSize: 256,
          attribution: TILE_ATTR,
          maxzoom: 19,
        },
        arcs: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        rings: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      },
      layers: [
        { id: "carto", type: "raster", source: "carto" },
        {
          id: "ring-layer",
          type: "line",
          source: "rings",
          paint: {
            "line-color": ["get", "color"],
            "line-width": 1,
            "line-opacity": 0.5,
            "line-dasharray": [3, 4],
          },
        },
        {
          id: "arc-layer",
          type: "line",
          source: "arcs",
          paint: { "line-color": "#38bdf8", "line-width": 1.2, "line-opacity": 0.6, "line-dasharray": [4, 6] },
        },
      ],
    },
    center: [10, 20],
    zoom: 1.8,
    attributionControl: { compact: true },
    maxZoom: 14,
    minZoom: 1.5,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  arcSourceId = "arcs";
  ringSourceId = "rings";
}

export function updateMap2d(events: ThreatEvent[], opts: Map2dOptions): void {
  if (!map) return;
  markerLayers.forEach((m) => m.remove());
  markerLayers = [];

  const withCoords = events.filter((e) => e.lat !== undefined && e.lon !== undefined);

  if (opts.points) {
    for (const e of withCoords.slice(0, 150)) {
      markerLayers.push(makeMarker([e.lon as number, e.lat as number], SEV_COLORS[e.severity] ?? "#888", "●", popupHtml(e)));
    }
  }

  const zoneFilter: Array<[keyof Map2dOptions, (e: ThreatEvent) => boolean, string]> = [
    ["ransomware", (e) => e.category === "ransomware", "ransomware"],
    ["apt", (e) => !!e.actor, "apt"],
    ["breach", (e) => e.category === "data_breach", "breach"],
    ["vuln", (e) => e.category === "vulnerability", "vuln"],
    ["outage", (e) => e.category === "outage", "outage"],
    ["critical", (e) => e.severity === "critical", "critical"],
  ];
  for (const [key, filter, zone] of zoneFilter) {
    if (!opts[key]) continue;
    const style = ZONE_STYLE[zone];
    for (const e of withCoords.filter(filter).slice(0, 60)) {
      markerLayers.push(makeMarker([e.lon as number, e.lat as number], style.color, style.glyph, popupHtml(e)));
    }
  }

  // rings — dashed circles around critical/high
  const m = map;
  if (opts.rings && m.getSource(ringSourceId)) {
    const ringFeatures: GeoFeature[] = withCoords
      .filter((x) => x.severity === "critical" || x.severity === "high")
      .slice(0, 40)
      .map((e) => ({
        type: "Feature" as const,
        properties: { color: e.severity === "critical" ? "#ff3333" : "#ffaa00" },
        geometry: circleGeoJSON([e.lon as number, e.lat as number], 1.4),
      }));
    (m.getSource(ringSourceId) as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: ringFeatures,
    });
  } else if (m.getSource(ringSourceId)) {
    (m.getSource(ringSourceId) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
  }

  // arcs — campaign polylines
  if (opts.arcs && m.getSource(arcSourceId)) {
    const pairs = computePairs(withCoords);
    const features: GeoFeature[] = pairs.slice(0, 40).map((pts) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: pts },
    }));
    (m.getSource(arcSourceId) as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
  } else if (m.getSource(arcSourceId)) {
    (m.getSource(arcSourceId) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
  }

  // labels — country text markers
  if (opts.labels) {
    const seen = new Set<string>();
    for (const e of withCoords) {
      if (!e.country || seen.has(e.country)) continue;
      seen.add(e.country);
      markerLayers.push(makeLabel([e.lon as number, e.lat as number], e.country));
    }
  }
}

export function resizeMap2d(): void {
  map?.resize();
}

function makeMarker(lngLat: [number, number], color: string, glyph: string, popup: string): maplibregl.Marker {
  const el = document.createElement("div");
  el.className = "map2d-marker";
  el.innerHTML = `<span style="color:${color}">${glyph}</span>`;
  const mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map!);
  if (popup) mk.setPopup(new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(popup));
  return mk;
}

function makeLabel(lngLat: [number, number], text: string): maplibregl.Marker {
  const el = document.createElement("div");
  el.className = "map2d-label";
  el.innerHTML = `<span>${text}</span>`;
  return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map!);
}

/** approximate circle polygon in lon/lat degrees (radiusDeg ~ 1.2 ≈ 130km) */
function circleGeoJSON(center: [number, number], radiusDeg: number): { type: "Polygon"; coordinates: Array<Array<[number, number]>> } {
  const pts: Array<[number, number]> = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([center[0] + Math.cos(a) * radiusDeg, center[1] + Math.sin(a) * radiusDeg * 0.6]);
  }
  return { type: "Polygon", coordinates: [pts] };
}

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
      const mid: [number, number] = [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2 + 4];
      out.push([
        [a.lon, a.lat],
        [mid[0], mid[1]],
        [b.lon, b.lat],
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

import type { GlobeInstance } from "globe.gl";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import type { ThreatEvent } from "../../backend/src/types";
import { SEV_COLORS, SEV_RANK } from "./api";

let globe: GlobeInstance | null = null;

export async function initGlobe(el: HTMLElement): Promise<GlobeInstance> {
  // dynamic import keeps the ~2MB three.js bundle out of the initial chunk
  const { default: Globe } = await import("globe.gl");
  // WebGL guard — never silently blank: show a visible fallback message
  try {
    const test = document.createElement("canvas");
    const gl = test.getContext("webgl2") ?? test.getContext("webgl");
    if (!gl) throw new Error("WebGL unavailable");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8899aa;font-size:14px;text-align:center;padding:20px">
      🌐 3D globe unavailable (WebGL off).<br/>Event list is still live in the sidebar →</div>`;
    throw new Error("WebGL unavailable");
  }
  const topology = worldAtlas as unknown as { objects: { countries: never } };
  const countries = feature(topology, topology.objects.countries);

  globe = new Globe(el, { animateIn: true })
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#38bdf8")
    .atmosphereAltitude(0.16)
    .hexPolygonsData(countries.features as never[])
    .hexPolygonResolution(3)
    .hexPolygonMargin(0.72)
    .hexPolygonColor(() => "rgba(28, 48, 88, 0.5)")
    .pointsData([])
    .pointLat("lat")
    .pointLng("lon")
    .pointColor((d: any) => SEV_COLORS[(d as ThreatEvent).severity] ?? "#888")
    .pointAltitude((d: any) => 0.04 + SEV_RANK[(d as ThreatEvent).severity] * 0.014)
    .pointRadius((d: any) => 0.35 + SEV_RANK[(d as ThreatEvent).severity] * 0.13)
    .pointsMerge(true)
    .pointLabel((d: any) => tooltipHtml(d as ThreatEvent))
    .ringsData([])
    .ringColor(() => (t: number) => `rgba(56,189,248,${1 - t})`)
    .ringMaxRadius(5)
    .ringPropagationSpeed(1.2)
    .ringRepeatPeriod(900);

  // gentle auto-rotation, pauses on interaction
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.6;

  // fit globe into viewport
  const resize = () => globe?.width(el.clientWidth).height(el.clientHeight);
  resize();
  window.addEventListener("resize", resize);

  return globe;
}

export function updateGlobe(events: ThreatEvent[]): void {
  if (!globe) return;
  lastEvents = events;
  const withCoords = events.filter((e) => e.lat !== undefined && e.lon !== undefined);
  if (layers.points) globe.pointsData(withCoords);
  if (layers.rings) {
    globe.ringsData(
      withCoords.filter((e) => e.severity === "critical" || e.severity === "high"),
    );
  }
  if (layers.arcs) {
    updateArcs(events);
  } else {
    globe.arcsData([]);
  }
}

// ── Phase 5: view mode + layer visibility ────────────────
const layers = { points: true, arcs: true, rings: true };
let threeDMode = true;
let lastEvents: ThreatEvent[] = [];

export function setGlobeMode(threeD: boolean): void {
  threeDMode = threeD;
  if (!globe) return;
  // globe.gl exposes .perspective() → THREE.PerspectiveCamera
  const cam = (globe as unknown as { perspective: () => { fov: number } }).perspective();
  if (cam) cam.fov = threeD ? 60 : 0; // 0 fov = orthographic (2D)
  globe.controls().autoRotate = threeD;
}

export function setLayer(name: keyof typeof layers, on: boolean): void {
  layers[name] = on;
  updateGlobe(lastEvents);
}

/** Arc pairs: same actor (or same category) active in 2+ countries → campaign trail. */
function computeArcs(events: ThreatEvent[]): Array<{ startLat: number; startLng: number; endLat: number; endLng: number }> {
  const arcs: Array<{ startLat: number; startLng: number; endLat: number; endLng: number }> = [];
  const pushChain = (label: string, evs: ThreatEvent[]) => {
    const byCountry = new Map<string, ThreatEvent>();
    for (const e of evs) if (!byCountry.has(e.country!)) byCountry.set(e.country!, e);
    const countries = [...byCountry.values()];
    if (countries.length < 2) return;
    for (let i = 0; i < countries.length - 1 && arcs.length < 24; i++) {
      const a = countries[i];
      const b = countries[i + 1];
      if (a.country === b.country) continue;
      arcs.push({ startLat: a.lat!, startLng: a.lon!, endLat: b.lat!, endLng: b.lon! });
    }
    void label;
  };

  // 1) same actor across countries (APT campaigns)
  const byActor = new Map<string, ThreatEvent[]>();
  for (const e of events) {
    if (e.actor && e.country && e.lat !== undefined && e.lon !== undefined) {
      const arr = byActor.get(e.actor) ?? [];
      arr.push(e);
      byActor.set(e.actor, arr);
    }
  }
  for (const [actor, evs] of byActor) pushChain(actor, evs);

  // 2) fallback: same category across countries (breach/outage clusters)
  if (arcs.length === 0) {
    const byCat = new Map<string, ThreatEvent[]>();
    for (const e of events) {
      if (e.country && e.lat !== undefined && e.lon !== undefined) {
        const arr = byCat.get(e.category) ?? [];
        arr.push(e);
        byCat.set(e.category, arr);
      }
    }
    for (const [cat, evs] of byCat) pushChain(cat, evs);
  }
  return arcs;
}

export function updateArcs(events: ThreatEvent[]): void {
  if (!globe) return;
  const arcs = computeArcs(events);
  globe.arcsData(arcs);
  globe.arcStartLat("startLat");
  globe.arcStartLng("startLng");
  globe.arcEndLat("endLat");
  globe.arcEndLng("endLng");
  globe.arcColor(() => ["rgba(244,63,94,0.7)", "rgba(56,189,248,0.4)"]);
  globe.arcAltitude(0.35);
  globe.arcStroke(0.4);
  globe.arcDashLength(0.5);
  globe.arcDashGap(0.25);
  globe.arcDashAnimateTime(2500);
}

function tooltipHtml(e: ThreatEvent): string {
  return `
  <div style="max-width:260px;font-family:system-ui,sans-serif">
    <div style="font-weight:800;color:${SEV_COLORS[e.severity]};text-transform:uppercase;font-size:11px;letter-spacing:1px">
      ${e.severity} · ${e.category.replace("_", " ")}
    </div>
    <div style="font-weight:600;margin:3px 0">${escapeHtml(e.title)}</div>
    <div style="font-size:11px;color:#9fb0d0">${escapeHtml(e.summary.slice(0, 140))}</div>
    <div style="font-size:10px;color:#38bdf8;margin-top:4px">${e.country ?? "location unknown"} · ${e.source}</div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

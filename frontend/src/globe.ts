import type { GlobeInstance } from "globe.gl";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import type { ThreatEvent } from "../../backend/src/types";
import { SEV_COLORS, SEV_RANK } from "./api";

let globe: GlobeInstance | null = null;

export async function initGlobe(el: HTMLElement): Promise<GlobeInstance> {
  // dynamic import keeps the ~2MB three.js bundle out of the initial chunk
  const { default: Globe } = await import("globe.gl");
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
  const withCoords = events.filter((e) => e.lat !== undefined && e.lon !== undefined);
  globe.pointsData(withCoords);
  globe.ringsData(
    withCoords.filter((e) => e.severity === "critical" || e.severity === "high").slice(0, 60),
  );
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

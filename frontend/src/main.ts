import "./style.css";
import type { ThreatEvent, ThreatFeed, TrendPoint } from "../../backend/src/types";
import { initGlobe, updateGlobe, setGlobeMode, setLayer } from "./globe";
import { initMap2d, updateMap2d, resizeMap2d } from "./map2d";
import { SEV_COLORS, fetchFeed, fetchHealth, fmtDate, fmtTime } from "./api";
import { renderAdSlot } from "./ads";
import { articleSlug } from "../../backend/src/slug";

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

let feed: ThreatFeed = { updatedAt: "", sourceCount: 0, total: 0, events: [] };
let activeSev = "all";
let activeCat = "all";
let activeCountry = "";
let activeHours = "all";
let activeSource = "all";
let searchQuery = "";

initGlobe($("#globe")).catch((err) => {
  console.error("globe init failed:", err);
});

// ── map mode: 2D (default, Leaflet) vs 3D (globe.gl) ─────
let mapMode3D = false;
function setMapMode(threeD: boolean): void {
  mapMode3D = threeD;
  const globeEl = $("#globe");
  const mapEl = $("#map2d");
  if (threeD) {
    mapEl.classList.add("hidden");
    globeEl.classList.remove("hidden");
    setGlobeMode(true);
    resizeGlobe();
  } else {
    globeEl.classList.add("hidden");
    mapEl.classList.remove("hidden");
    if (!mapEl.dataset.ready) {
      initMap2d(mapEl);
      mapEl.dataset.ready = "1";
    }
    resizeMap2d();
    updateMap2d(filteredEvents(), map2dOpts());
  }
}
let layerState = {
  points: true,
  arcs: true,
  rings: true,
  labels: true,
  zones: true,
  ransomware: true,
  apt: true,
  breach: true,
  vuln: true,
  outage: true,
  critical: true,
};
const map2dOpts = () => ({
  points: layerState.points,
  arcs: layerState.arcs,
  labels: layerState.labels,
  rings: layerState.rings,
  zones: layerState.zones,
  ransomware: layerState.ransomware,
  apt: layerState.apt,
  breach: layerState.breach,
  vuln: layerState.vuln,
  outage: layerState.outage,
  critical: layerState.critical,
});
function resizeGlobe(): void {
  // re-fit the 3D globe after its container becomes visible
  setTimeout(() => {
    const g = (globalThis as unknown as { __globeResize?: () => void }).__globeResize;
    g?.();
  }, 50);
}

// ── unified filter pipeline ──────────────────────────────
function filteredEvents(): ThreatEvent[] {
  return feed.events.filter((e) => {
    if (activeSev !== "all" && e.severity !== activeSev) return false;
    if (activeCat !== "all" && e.category !== activeCat) return false;
    if (activeCountry && e.country !== activeCountry) return false;
    if (activeSource !== "all" && e.source !== activeSource) return false;
    if (activeHours !== "all") {
      const cutoff = Date.now() - Number(activeHours) * 3_600_000;
      if (new Date(e.publishedAt).getTime() < cutoff) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = `${e.title} ${e.summary} ${e.actor ?? ""} ${e.source} ${e.country ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ── DEFCON-style threat level (severity mix) ────────────
function computeThreatLevel(): number {
  const n = feed.events.length;
  if (!n) return 5;
  const crit = feed.events.filter((e) => e.severity === "critical").length;
  const high = feed.events.filter((e) => e.severity === "high").length;
  const ratio = (crit * 3 + high * 1.5) / n;
  if (ratio >= 1.2 || crit >= 12) return 1;
  if (ratio >= 0.8 || crit >= 6) return 2;
  if (ratio >= 0.45 || crit >= 3) return 3;
  if (crit >= 1 || high >= 5) return 4;
  return 5;
}
const DEFCON_LABEL: Record<number, string> = {
  1: "DEFCON 1 — CRITICAL",
  2: "DEFCON 2 — SEVERE",
  3: "DEFCON 3 — ELEVATED",
  4: "DEFCON 4 — GUARDED",
  5: "DEFCON 5 — NORMAL",
};
function renderThreatLevel(): void {
  const el = $("#threat-level");
  const lvl = computeThreatLevel();
  el.textContent = `⚡ ${DEFCON_LABEL[lvl]}`;
  el.className = `threat-level tl-${lvl}`;
}

// ── worsening / improving badge (critical: last 24h vs previous 24h) ──
function renderTrendBadge(): void {
  const now = Date.now();
  const last24 = feed.events.filter((e) => {
    const t = new Date(e.publishedAt).getTime();
    return e.severity === "critical" && t >= now - 24 * 3_600_000;
  }).length;
  const prev24 = feed.events.filter((e) => {
    const t = new Date(e.publishedAt).getTime();
    return e.severity === "critical" && t >= now - 48 * 3_600_000 && t < now - 24 * 3_600_000;
  }).length;
  const badge = $("#trend-badge");
  if (last24 > prev24) {
    badge.textContent = `↑ WORSENING +${last24 - prev24}`;
    badge.className = "trend-badge tb-up";
  } else if (last24 < prev24) {
    badge.textContent = `↓ IMPROVING -${prev24 - last24}`;
    badge.className = "trend-badge tb-down";
  } else {
    badge.textContent = "→ STABLE";
    badge.className = "trend-badge tb-flat";
  }
  badge.classList.remove("hidden");
}

// ── sidebar feed ─────────────────────────────────────────
function renderAll(): void {
  renderFeed();
  renderStats();
  renderTicker();
  renderCountryChips();
  renderOutages();
  renderLatestArticles();
  if (mapMode3D) {
    updateGlobe(filteredEvents());
  } else {
    updateMap2d(filteredEvents(), map2dOpts());
  }
}

// ── LATEST REPORTS — real <a href> links (crawlable + clickable) ──
function renderLatestArticles(): void {
  const box = $("#latest-list");
  if (!box) return;
  const recent = [...feed.events].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, 6);
  box.innerHTML = recent
    .map(
      (e) =>
        `<li><a href="/article/${articleSlug(e.title, e.id)}"><span class="la-sev" style="color:${SEV_COLORS[e.severity]}">${e.severity.toUpperCase()}</span>${escapeHtml(e.title.slice(0, 60))}</a></li>`,
    )
    .join("");
}

function renderFeed(): void {
  const events = filteredEvents();
  const list = $("#feed-list");
  list.innerHTML = "";

  if (events.length === 0) {
    list.innerHTML = '<li class="empty">No events match the current filters…</li>';
    return;
  }

  for (const e of events.slice(0, 60)) {
    const li = document.createElement("li");
    li.className = `feed-item ${e.severity}`;
    li.innerHTML = `
      <div class="meta">
        <span class="sev-pill">${e.severity}</span>
        <span>${e.category.replace("_", " ")}</span>
        <span>·</span>
        <span>${e.source}</span>
        <span style="margin-left:auto">${fmtTime(e.publishedAt)}</span>
      </div>
      <div class="t">${escapeHtml(e.title)}</div>
      <div class="s">${escapeHtml(e.summary.slice(0, 130))}</div>
      <div class="loc">
        ${e.country ? `<span class="loc-chip" data-country="${e.country}">📍 ${e.country}</span>` : ""}
        ${e.actor ? `<span class="actor-badge">🎭 ${escapeHtml(e.actor)}</span>` : ""}
      </div>
    `;
    li.addEventListener("click", (ev) => {
      const chip = (ev.target as HTMLElement).closest(".loc-chip") as HTMLElement | null;
      if (chip) {
        setCountry(chip.dataset.country ?? "");
        return;
      }
      // Phase 4: open internal article page — keeps users on-site (SEO slug URL)
      history.pushState({}, "", `/article/${articleSlug(e.title, e.id)}`);
      route();
    });
    list.appendChild(li);
  }
}

function renderStats(): void {
  const by = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const e of feed.events) if (by[e.severity] !== undefined) by[e.severity]++;
  $("#st-crit").textContent = String(by.critical);
  $("#st-high").textContent = String(by.high);
  $("#st-med").textContent = String(by.medium);
  $("#st-low").textContent = String(by.low);
  $("#feed-count").textContent = String(filteredEvents().length);
}

// ── country chips ────────────────────────────────────────
function renderCountryChips(): void {
  const counts = new Map<string, number>();
  for (const e of feed.events) {
    if (e.country) counts.set(e.country, (counts.get(e.country) ?? 0) + 1);
  }
  const countries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const box = $("#country-chips");
  box.innerHTML = "";
  for (const [cc, n] of countries) {
    const chip = document.createElement("span");
    chip.className = `chip${cc === activeCountry ? " active" : ""}`;
    chip.textContent = `${cc} ${n}`;
    chip.title = "Filter by country";
    chip.addEventListener("click", () => setCountry(cc === activeCountry ? "" : cc));
    box.appendChild(chip);
  }
}

function setCountry(cc: string): void {
  activeCountry = cc;
  renderCountryChips();
  const events = filteredEvents();
  updateGlobe(events);
  renderFeed();
}

// ── trend chart (SVG, zero-dep) ──────────────────────────
async function loadTrends(): Promise<void> {
  try {
    const res = await fetch("/api/trends");
    if (!res.ok) return;
    const data = (await res.json()) as { points: TrendPoint[] };
    const points = data.points.slice(0, 24).reverse(); // newest last → left-to-right
    const box = $("#trend-chart");
    const svg = $("#trend-svg");
    if (points.length === 0) {
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");
    const W = 340;
    const H = 90;
    const PAD = 4;
    const max = Math.max(1, ...points.map((p) => p.total));
    const stepX = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
    const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

    const series: Array<[keyof TrendPoint, string]> = [
      ["critical", "#f43f5e"],
      ["high", "#f97316"],
      ["medium", "#eab308"],
      ["low", "#22c55e"],
    ];
    let grid = "";
    for (let i = 0; i <= 3; i++) {
      const gy = PAD + (i * (H - PAD * 2)) / 3;
      grid += `<line class="grid-line" x1="${PAD}" y1="${gy}" x2="${W - PAD}" y2="${gy}"/>`;
    }
    let areas = "";
    for (const [key, color] of series) {
      const pts = points.map((p, i) => `${PAD + i * stepX},${y(Number(p[key]))}`).join(" ");
      areas += `<polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" points="${pts}"/>`;
      // area fill under critical only (visual weight)
      if (key === "critical") {
        const fillPts = `${PAD},${H - PAD} ${pts} ${W - PAD},${H - PAD}`;
        areas += `<polygon fill="${color}" fill-opacity="0.12" points="${fillPts}"/>`;
      }
    }
    svg.innerHTML = grid + areas;
  } catch {
    /* keep chart hidden on failure */
  }
}

// ── weekly exec brief ────────────────────────────────
async function loadSummary(): Promise<void> {
  try {
    const res = await fetch("/api/summary");
    if (!res.ok) return;
    const s = (await res.json()) as {
      headline: string;
      topThreats: string[];
      recommendation: string;
      source: string;
    };
    const card = $("#summary-card");
    card.classList.remove("hidden");
    $("#summary-headline").textContent = s.headline;
    const srcEl = document.getElementById("summary-src");
    if (srcEl) srcEl.textContent = s.source === "ai" ? "AI GEN" : "HEURISTIC";
    $("#summary-threats").innerHTML = s.topThreats.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
    $("#summary-rec").textContent = `💡 ${s.recommendation}`;
  } catch {
    /* keep hidden */
  }
}

// ── ticker ───────────────────────────────────────────────
function renderTicker(): void {
  const track = $("#ticker-track");
  const items = feed.events.slice(0, 24);
  if (items.length === 0) {
    track.innerHTML = '<span class="tick-item">Waiting for intelligence…</span>';
    return;
  }
  const html = items
    .map(
      (e) =>
        `<span class="tick-item"><span class="sev ${e.severity}">${e.severity.toUpperCase()}</span> — ${escapeHtml(
          e.title,
        )}</span>`,
    )
    .join("");
  // duplicate content so the -50% translate loops seamlessly
  track.innerHTML = html + html;
}

// ── outage strip (infra status) ────────────────────────
function renderOutages(): void {
  const strip = $("#outage-strip");
  const outages = feed.events.filter((e) => e.category === "outage").slice(0, 4);
  if (outages.length === 0) {
    strip.classList.add("hidden");
    return;
  }
  strip.classList.remove("hidden");
  $("#outage-list").innerHTML = outages
    .map(
      (e) =>
        `<div class="outage-item ${e.severity}">
          <span class="o-dot"></span>
          <span class="o-title">${escapeHtml(e.title.slice(0, 60))}</span>
          <span>${e.source.split(" ")[0]}</span>
        </div>`,
    )
    .join("");
}

// ── filters & controls ───────────────────────────────────
function bindFilters(): void {
  $("#filters").addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest(".fbtn") as HTMLButtonElement | null;
    if (!btn) return;
    document.querySelectorAll(".fbtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeSev = btn.dataset.sev ?? "all";
    const events = filteredEvents();
    updateGlobe(events);
    renderFeed();
  });

  $("#cat-filter").addEventListener("change", (ev) => {
    activeCat = (ev.target as HTMLSelectElement).value;
    const events = filteredEvents();
    updateGlobe(events);
    renderFeed();
  });

  $("#search-box").addEventListener("input", (ev) => {
    searchQuery = (ev.target as HTMLInputElement).value.trim();
    const events = filteredEvents();
    updateGlobe(events);
    renderFeed();
  });

  $("#export-btn").addEventListener("click", exportCsv);

  // Phase 5: time range filters
  $("#time-row").addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest(".tbtn") as HTMLButtonElement | null;
    if (!btn) return;
    document.querySelectorAll(".tbtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeHours = btn.dataset.hours ?? "all";
    renderAll();
  });

  // Phase 5: source tabs (LIVE NEWS style)
  $("#source-tabs").addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest(".stab") as HTMLButtonElement | null;
    if (!btn) return;
    document.querySelectorAll(".stab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeSource = btn.dataset.source ?? "all";
    renderAll();
  });

  // Phase 5: globe 2D/3D + layer toggles
  $("#toggle-3d").addEventListener("click", () => {
    setMapMode(true);
    $("#toggle-3d").classList.add("active");
    $("#toggle-2d").classList.remove("active");
  });
  $("#toggle-2d").addEventListener("click", () => {
    setMapMode(false);
    $("#toggle-2d").classList.add("active");
    $("#toggle-3d").classList.remove("active");
  });
  $("#layer-points").addEventListener("click", (ev) => {
    (ev.target as HTMLButtonElement).classList.toggle("active");
    layerState.points = !layerState.points;
    if (mapMode3D) setLayer("points", layerState.points);
    else updateMap2d(filteredEvents(), map2dOpts());
  });
  $("#layer-arcs").addEventListener("click", (ev) => {
    (ev.target as HTMLButtonElement).classList.toggle("active");
    layerState.arcs = !layerState.arcs;
    if (mapMode3D) setLayer("arcs", layerState.arcs);
    else updateMap2d(filteredEvents(), map2dOpts());
  });
  $("#layer-rings").addEventListener("click", (ev) => {
    (ev.target as HTMLButtonElement).classList.toggle("active");
    layerState.rings = !layerState.rings;
    if (mapMode3D) setLayer("rings", layerState.rings);
    else updateMap2d(filteredEvents(), map2dOpts());
  });

  // Phase 5.5: checkbox layers panel
  const globeLayers = ["points", "arcs", "rings", "labels"] as const;
  const bindLayerChk = (sel: string, name: keyof typeof layerState) => {
    $(sel).addEventListener("change", (ev) => {
      const on = (ev.target as HTMLInputElement).checked;
      layerState[name] = on;
      if (mapMode3D && (globeLayers as readonly string[]).includes(name)) {
        setLayer(name as "points" | "arcs" | "rings" | "labels", on);
      } else {
        updateMap2d(filteredEvents(), map2dOpts());
      }
    });
  };
  bindLayerChk("#ly-points", "points");
  bindLayerChk("#ly-arcs", "arcs");
  bindLayerChk("#ly-rings", "rings");
  bindLayerChk("#ly-zones", "zones");
  bindLayerChk("#ly-rans", "ransomware");
  bindLayerChk("#ly-apt", "apt");
  bindLayerChk("#ly-breach", "breach");
  bindLayerChk("#ly-vuln", "vuln");
  bindLayerChk("#ly-outage", "outage");
  bindLayerChk("#ly-crit", "critical");
  $("#ly-grid").addEventListener("change", (ev) => {
    const on = (ev.target as HTMLInputElement).checked;
    $("#globe").classList.toggle("grid-on", on);
    $("#map2d").classList.toggle("grid-on", on);
  });

  // mobile panel toggles
  $("#mob-layers").addEventListener("click", () => {
    const lp = $("#left-panel");
    lp.classList.toggle("mob-open");
    $("#sidebar").classList.remove("mob-open");
  });
  $("#mob-feed").addEventListener("click", () => {
    const sb = $("#sidebar");
    sb.classList.toggle("mob-open");
    $("#left-panel").classList.remove("mob-open");
  });

  // Phase 5.5: share + fullscreen
  $("#share-btn").addEventListener("click", () => {
    const url = new URL(location.href);
    url.hash = "#/";
    void navigator.clipboard?.writeText(url.href).then(() => {
      const b = $("#share-btn");
      b.textContent = "✓";
      setTimeout(() => (b.textContent = "🔗"), 1200);
    });
  });
  $("#fullscreen-btn").addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  });
}

function exportCsv(): void {
  const rows = filteredEvents().map((e) =>
    [
      e.publishedAt,
      e.severity,
      e.category,
      e.country ?? "",
      e.actor ?? "",
      `"${e.title.replace(/"/g, '""')}"`,
      `"${e.summary.replace(/"/g, '""')}"`,
      e.url,
      e.source,
    ].join(","),
  );
  const header = "publishedAt,severity,category,country,actor,title,summary,url,source";
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hte-threats-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── data loop ────────────────────────────────────────────
async function refresh(): Promise<void> {
  try {
    feed = await fetchFeed();
    const events = filteredEvents();
    if (mapMode3D) updateGlobe(events);
    else updateMap2d(events, map2dOpts());
    renderFeed();
    renderLatestArticles();
    renderStats();
    renderTicker();
    renderCountryChips();
    renderOutages();
    renderThreatLevel();
    renderTrendBadge();
    const fs = $("#footer-status");
    if (fs) fs.textContent = `${feed.sourceCount} sources · Upstash · ${feed.total} events tracked`;
    const st = $("#status-stats");
    if (st) {
      const crit = feed.events.filter((e) => e.severity === "critical").length;
      const high = feed.events.filter((e) => e.severity === "high").length;
      const med = feed.events.filter((e) => e.severity === "medium").length;
      const low = feed.events.filter((e) => e.severity === "low").length;
      st.textContent = `${crit} critical · ${high} high · ${med} medium · ${low} low`;
    }
    const leftCounts: Record<string, string> = { "#st-crit-lp": "critical", "#st-high-lp": "high", "#st-med-lp": "medium", "#st-low-lp": "low" };
    for (const [sel, sev] of Object.entries(leftCounts)) {
      const el = $(sel);
      if (el) el.textContent = String(feed.events.filter((e) => e.severity === sev).length);
    }
    $(".sh-time").textContent = new Date().toUTCString().replace("GMT", "UTC");
    $("#updated-at").textContent = `UPDATED ${fmtDate(feed.updatedAt)} · ${feed.sourceCount} SOURCES`;
  } catch (err) {
    $("#status-text").textContent = `feed error: ${String(err)}`;
  }
}

async function checkHealth(): Promise<void> {
  try {
    const h = await fetchHealth();
    const dot = $("#status-dot");
    const txt = $("#status-text");
    dot.classList.toggle("off", h.status !== "ok");
    txt.textContent = `${h.status.toUpperCase()} · ${h.cache.toUpperCase()} CACHE${h.ollama ? " · AI ONLINE" : " · AI OFF"}`;
  } catch {
    /* keep last state */
  }
}

bindFilters();

// ── services modal (mother site) ───────────────
function bindServicesModal(): void {
  const modal = $("#services-modal");
  const open = () => modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  $("#services-btn").addEventListener("click", open);
  $("#modal-close").addEventListener("click", close);
  $("#modal-backdrop").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}
bindServicesModal();

// ── Phase 4: article router (hash-based SPA) ─────────────
interface ArticlePayload {
  id: string;
  slug?: string;
  seoTitle: string;
  description: string;
  faq?: Array<{ q: string; a: string }>;
  body: string;
  category: string;
  severity: string;
  country?: string;
  actor?: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  aiGenerated: boolean;
  jsonLd: Record<string, unknown>;
}

function showDashboard(): void {
  $("#article-view").classList.add("hidden");
  $("#globe").classList.toggle("hidden", !mapMode3D);
  $("#map2d").classList.toggle("hidden", mapMode3D);
  $("#topbar").classList.remove("hidden");
  $("#sub-header").classList.remove("hidden");
  $("#left-panel").classList.remove("hidden");
  $("#sidebar").classList.remove("hidden");
  $("#ticker").classList.remove("hidden");
  $("#legend").classList.remove("hidden");
  $("#app-footer").classList.remove("hidden");
}

async function showArticle(id: string): Promise<void> {
  // hide chrome, show article shell
  $("#globe").classList.add("hidden");
  $("#map2d").classList.add("hidden");
  $("#topbar").classList.add("hidden");
  $("#sub-header").classList.add("hidden");
  $("#left-panel").classList.add("hidden");
  $("#sidebar").classList.add("hidden");
  $("#ticker").classList.add("hidden");
  $("#legend").classList.add("hidden");
  $("#app-footer").classList.add("hidden");
  const view = $("#article-view");
  view.classList.remove("hidden");
  view.scrollTop = 0;
  // immediate content from LOCAL feed data — never a blank shell, even offline
  // (segment is an SEO slug OR the raw event id — resolve both)
  const localEvent =
    feed.events.find((e) => e.id === id) ?? feed.events.find((e) => articleSlug(e.title, e.id) === id);
  if (localEvent) {
    $("#a-sev").textContent = localEvent.severity;
    $("#a-sev").className = `sev-pill ${localEvent.severity}`;
    $("#a-cat").textContent = localEvent.category.replace("_", " ");
    $("#a-source").textContent = localEvent.source;
    $("#a-date").textContent = fmtDate(localEvent.publishedAt);
    $("#a-title").textContent = localEvent.title.slice(0, 100);
    $("#a-sub").textContent = localEvent.summary.slice(0, 160);
    $("#a-body").innerHTML = `<p>${escapeHtml(localEvent.summary)}</p><p class="loading">⏳ Expanding briefing…</p>`;
    $("#a-source-link").setAttribute("href", localEvent.url);
  } else {
    // event not in local feed — show loading placeholder while the API answers
    $("#a-title").textContent = "Loading briefing…";
    $("#a-sub").textContent = "Generating the report — one moment";
    $("#a-body").innerHTML = "<p class=\"loading\">⏳ Building article…</p>";
    $("#a-related").innerHTML = "";
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000); // never hang the shell
    const res = await fetch(`/api/article/${encodeURIComponent(id)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const a = (await res.json()) as ArticlePayload;

    $("#a-sev").textContent = a.severity;
    $("#a-sev").className = `sev-pill ${a.severity}`;
    $("#a-cat").textContent = a.category.replace("_", " ");
    $("#a-source").textContent = a.source;
    $("#a-date").textContent = fmtDate(a.publishedAt);
    $("#a-title").textContent = a.seoTitle;
    $("#a-sub").textContent = a.description;
    $("#a-body").innerHTML = a.body
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");
    $("#a-attribution").textContent = `Reported by ${a.source} · ${a.aiGenerated ? "AI-generated briefing" : "Auto briefing"} · HTE Threat Monitor`;
    $("#a-source-link").setAttribute("href", a.sourceUrl);

    // GEO/AEO: Key Takeaways + FAQ block (answer-engine + snippet ready)
    const faqBox = document.createElement("div");
    faqBox.className = "a-faq";
    const faqs = Array.isArray(a.faq) && a.faq.length ? a.faq : [];
    if (faqs.length) {
      faqBox.innerHTML = `<h3>⚡ KEY FACTS</h3>${faqs
        .map((f) => `<div class="a-faq-item"><b>${escapeHtml(f.q)}</b><p>${escapeHtml(f.a)}</p></div>`)
        .join("")}`;
      $("#a-body").appendChild(faqBox);
    }

    // Ad slots (top + mid)
    renderAdSlot($("#ad-slot-top"), a.category);
    renderAdSlot($("#ad-slot-mid"), a.category);

    // related events (same category)
    const feed2 = await fetchFeed();
    const related = feed2.events.filter((e) => e.category === a.category && e.id !== a.id).slice(0, 4);
    const box = $("#a-related");
    box.innerHTML = related.length ? "<h3>RELATED EVENTS</h3>" : "";
    for (const r of related) {
      const item = document.createElement("div");
      item.className = "related-item";
      item.innerHTML = `<span class="r-sev ${r.severity}">${r.severity.toUpperCase()}</span> ${escapeHtml(r.title.slice(0, 90))}`;
      item.addEventListener("click", () => {
        history.pushState({}, "", `/article/${articleSlug(r.title, r.id)}`);
        route();
      });
      box.appendChild(item);
    }

    // JSON-LD for SEO
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify(a.jsonLd);
    document.head.appendChild(ld);
    document.title = `${a.seoTitle} | HTE Threat Monitor`;
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "AbortError";
    // never dead-end: timeout or 404 both fall back to the latest reports
    const msg = timedOut
      ? "The briefing took too long to generate. Showing the latest reports instead:"
      : `This report has rotated out of the live feed${String(err).includes("404") ? "" : ` (${String(err)})`}.`;
    const feed3 = await fetchFeed().catch(() => null);
    const recent = (feed3?.events ?? []).slice(0, 5);
    $("#a-body").innerHTML = `<p>${escapeHtml(msg)}</p>`;
    $("#a-sub").textContent = "Browse the latest briefings below:";
    $("#a-title").textContent = "Report expired";
    const box = $("#a-related");
    box.innerHTML = "<h3>LATEST REPORTS</h3>";
    for (const r of recent) {
      const item = document.createElement("div");
      item.className = "related-item";
      item.innerHTML = `<span class="r-sev ${r.severity}">${r.severity.toUpperCase()}</span> ${escapeHtml(r.title.slice(0, 90))}`;
      item.addEventListener("click", () => {
        location.hash = `#/article/${encodeURIComponent(r.id)}`;
      });
      box.appendChild(item);
    }
  }
}

function route(): void {
  // SEO-friendly path (/article/:id) OR hash (#/article/:id)
  const pathMatch = location.pathname.match(/^\/article\/(.+)$/);
  const hashMatch = location.hash.match(/^#\/article\/(.+)$/);
  const m = pathMatch ?? hashMatch;
  if (m) {
    void showArticle(decodeURIComponent(m[1]));
  } else {
    showDashboard();
    document.title = "HTE Cyber Threat & Tech Monitor";
    // normalize back to the dashboard root (clear any /article/ path)
    if (/^\/article\//.test(location.pathname)) {
      history.replaceState({}, "", "/");
    }
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("popstate", route);
$("#article-back").addEventListener("click", () => {
  history.pushState({}, "", "/");
  route();
});
$("#article-map").addEventListener("click", () => {
  history.pushState({}, "", "/");
  route();
});
void route();
try {
  setMapMode(false); // 2D tactical map is the default view
} catch (err) {
  console.error("map init error (app continues):", err);
}

void refresh();
void checkHealth();
void loadTrends();
void loadSummary();
setInterval(() => void refresh(), 60_000);
setInterval(() => void loadTrends(), 5 * 60_000);
setInterval(() => void checkHealth(), 30_000);
setInterval(() => void loadSummary(), 30 * 60_000);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

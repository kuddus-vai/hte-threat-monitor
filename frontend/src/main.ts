import "./style.css";
import type { ThreatEvent, ThreatFeed } from "../../backend/src/types";
import { initGlobe, updateGlobe } from "./globe";
import { SEV_COLORS, fetchFeed, fetchHealth, fmtDate, fmtTime } from "./api";

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

let feed: ThreatFeed = { updatedAt: "", sourceCount: 0, total: 0, events: [] };
let activeSev = "all";

initGlobe($("#globe")).catch((err) => {
  console.error("globe init failed:", err);
});

// ── sidebar feed ─────────────────────────────────────────
function renderFeed(): void {
  const events = activeSev === "all" ? feed.events : feed.events.filter((e) => e.severity === activeSev);
  const list = $("#feed-list");
  list.innerHTML = "";

  if (events.length === 0) {
    list.innerHTML = '<li class="empty">No events for this filter yet…</li>';
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
        ${e.country ? `📍 ${e.country}` : ""}
        ${e.actor ? `<span class="actor-badge">🎭 ${escapeHtml(e.actor)}</span>` : ""}
      </div>
    `;
    li.addEventListener("click", () => window.open(e.url, "_blank"));
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
  $("#feed-count").textContent = String(feed.total);
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

// ── filters ──────────────────────────────────────────────
function bindFilters(): void {
  $("#filters").addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest(".fbtn") as HTMLButtonElement | null;
    if (!btn) return;
    document.querySelectorAll(".fbtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeSev = btn.dataset.sev ?? "all";
    const events = activeSev === "all" ? feed.events : feed.events.filter((e) => e.severity === activeSev);
    updateGlobe(events);
    renderFeed();
  });
}

// ── data loop ────────────────────────────────────────────
async function refresh(): Promise<void> {
  try {
    feed = await fetchFeed();
    const events = activeSev === "all" ? feed.events : feed.events.filter((e) => e.severity === activeSev);
    updateGlobe(events);
    renderFeed();
    renderStats();
    renderTicker();
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

void refresh();
void checkHealth();
setInterval(() => void refresh(), 60_000);
setInterval(() => void checkHealth(), 30_000);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

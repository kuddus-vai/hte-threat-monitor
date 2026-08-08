# 🛰️ HTE Cyber Threat & Tech Monitoring Dashboard

Real-time global cyber-threat & tech-intelligence dashboard for high-tech enterprise
clients. Built on a **100% zero-cost stack** — no paid APIs, no expensive clouds.
Heavily inspired by the concepts of `koala73/worldmonitor` (AGPL-3.0 — this is an
independent, customized SaaS variant; no code is copied).

## ✨ What it does

- 🌍 **3D globe** (globe.gl) plots threats, breaches, and outages by inferred country
- 🧠 **Local AI triage** (Ollama) turns raw headlines into structured intel:
  `{category, severity, location, summary}` — strict-JSON system prompt
- 📡 **Keyless ingestion**: The Hacker News, BleepingComputer, Dark Reading, CISA
  advisories, GitHub & AWS status pages (+ AlienVault OTX when an API key is set)
- 🗃️ **Cache-first architecture**: the browser only ever reads the cache
  (Upstash Redis free tier, or in-memory for local dev) — never hits upstream
- 🎛️ Severity filters (CRIT/HIGH/MED/LOW), intel sidebar, live headline ticker

## 🏗️ Stack

| Layer | Choice | Cost |
|-------|--------|------|
| Frontend | Vanilla TypeScript + Vite + globe.gl (WebGL) | Free |
| Backend | Node.js, serverless-style handlers (`(req, env) => Response`) | Free |
| AI engine | Ollama local (`dolphin-llama3:8b`) — strict JSON extraction | Free |
| Cache | Upstash Redis REST (free tier) or in-memory fallback | Free |
| Sources | RSS feeds + CISA + OTX community API | Free |

## 🚀 Quick start

```bash
cp .env.example .env     # optionally fill OTX/Upstash keys
npm install
npm run dev              # backend :8787 + frontend :5173 (concurrently)
```

Open http://localhost:5173 — the backend ingests on boot, then refreshes every
`REFRESH_INTERVAL_MIN` minutes (default 15).

### Manual refresh / cron

```bash
npm run refresh          # one-shot ingest (exit 0 on success)
crontab -e               # every 15 min:
*/15 * * * * cd /home/kuddus/projects/hte-threat-monitor && /usr/bin/npm run refresh -s >> /tmp/hte-refresh.log 2>&1
```

## 🔌 API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/threats?severity=critical,high` | GET | Feed from cache (never upstream) |
| `/api/stats` | GET | Severity/category counts |
| `/api/health` | GET | Cache kind, Ollama status, feed freshness |
| `/api/refresh` | POST | Trigger ingestion (deduped by in-flight lock) |

## 🗺️ Edge deployment (future)

Handlers in `backend/src/server.ts` are pure `(req, env) => Response` — port to
Cloudflare Workers (`export default { fetch }`) or Vercel Edge Functions without
rewriting logic. The in-memory cache becomes Upstash once `.env` keys are set.

## 🚫 Constraints honored

- No paid LLMs — Ollama local only
- No heavy relational DB — Redis/in-memory cache only (real-time monitor, not archive)
- No secrets in the frontend — all upstream calls server-side
- No synchronous upstream polling from the client — cache reads only
- AGPL-3.0 respected — independent implementation of the concept

/**
 * Standalone refresh entrypoint for cron:
 *   npm run refresh -w backend
 * Fetches sources, AI-enriches, writes cache, exits.
 */
import { runRefresh } from "../src/ingest/pipeline.js";

const r = await runRefresh();
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);

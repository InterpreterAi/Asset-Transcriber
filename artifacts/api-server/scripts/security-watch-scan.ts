/**
 * Read-only Security Watch scan: prints the cases the detector would raise, writes nothing.
 * Usage: DATABASE_URL=... pnpm --filter @workspace/api-server security:scan [--all] [--json]
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSecurity, loadSecurityData, scopeIps } from "../src/lib/security-watch/detector.js";
import { memoryGeoCache, resolveGeo } from "../src/lib/security-watch/geo.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(path.resolve(here, "../../../lib/db/package.json"));
const { Pool } = requireFromDb("pg") as typeof import("pg");

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  max: 3,
  options: "-c default_transaction_read_only=on",
});

const showAll = process.argv.includes("--all");
const asJson = process.argv.includes("--json");

try {
  const data = await loadSecurityData(pool);
  const geo = await resolveGeo(scopeIps(data), memoryGeoCache(), 2000, 6);
  const cases = analyzeSecurity(data, geo).filter((c) => showAll || c.confidence !== "low");
  if (asJson) {
    console.log(JSON.stringify(cases, null, 2));
  } else {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const c of analyzeSecurity(data, geo)) counts[c.confidence]++;
    console.log(`Users: ${data.users.length} · IPs located: ${geo.size} · cases: high ${counts.high}, medium ${counts.medium}, low ${counts.low}\n`);
    for (const c of cases) {
      console.log(`[${c.confidence.toUpperCase()} ${c.score}] ${c.summary}`);
      for (const s of c.signals) console.log(`   +${s.points}  ${s.text}`);
      for (const s of c.counterSignals) console.log(`   ${s.points}  ${s.text}`);
      console.log("");
    }
  }
} finally {
  await pool.end();
}

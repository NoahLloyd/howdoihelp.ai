/**
 * Deprecated compatibility wrapper.
 *
 * AISafety.com data is no longer scraped from Airtable or HTML. Use
 * scripts/sync-aisafety.ts, which mirrors the official public API directly
 * into resources.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { run as runAisafetySync } from "../sync-aisafety";

export async function run(opts: { dryRun?: boolean; programs?: boolean } = {}) {
  const collection = opts.programs ? "training" : "events";
  console.log(
    `Deprecated gather-aisafety wrapper: running AISafety API ${collection} sync instead.`,
  );
  await runAisafetySync({
    dryRun: opts.dryRun,
    collections: [collection],
  });
}

if (process.argv[1]?.endsWith("/scripts/gatherers/gather-aisafety.ts")) {
  run({
    dryRun: process.argv.includes("--dry-run"),
    programs: process.argv.includes("--programs"),
  }).catch((err) => {
    console.error("Fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

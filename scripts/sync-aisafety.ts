/**
 * sync-aisafety.ts
 *
 * Mirrors the official public AISafety.com API into the local `resources`
 * table. Supabase is treated as a cache; product traffic continues to read
 * from howdoihelp.ai's normalized resources/API.
 *
 * Usage:
 *   npx tsx scripts/sync-aisafety.ts --dry-run
 *   npx tsx scripts/sync-aisafety.ts --collection communities --collection events
 *   npx tsx scripts/sync-aisafety.ts --collection communities,events,training
 *   npx tsx scripts/sync-aisafety.ts --dry-run --retire-legacy
 *   npx tsx scripts/sync-aisafety.ts --retire-legacy --max-retirements 250
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  AISAFETY_COLLECTIONS,
  assertAisafetyCollection,
  type AisafetyCollection,
} from "./lib/aisafety-api";
import { runAisafetySync, type SyncAisafetyOptions } from "./lib/aisafety-sync";

export { runAisafetySync as run } from "./lib/aisafety-sync";
export type { SyncAisafetyOptions } from "./lib/aisafety-sync";

function parseCliArgs(argv: string[]): SyncAisafetyOptions {
  const collections: AisafetyCollection[] = [];
  let maxRetirements: number | undefined;
  let timeoutMs: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--collection") {
      for (const value of String(argv[++i] || "").split(",")) {
        if (value.trim()) collections.push(assertAisafetyCollection(value.trim()));
      }
      continue;
    }
    if (arg.startsWith("--collection=")) {
      for (const value of arg.slice("--collection=".length).split(",")) {
        if (value.trim()) collections.push(assertAisafetyCollection(value.trim()));
      }
      continue;
    }
    if (arg === "--max-retirements" || arg === "--max-retirement" || arg === "--max-retire") {
      maxRetirements = parseNonNegativeInt(argv[++i], arg);
      continue;
    }
    if (arg.startsWith("--max-retirements=")) {
      maxRetirements = parseNonNegativeInt(arg.slice("--max-retirements=".length), "--max-retirements");
      continue;
    }
    if (arg === "--timeout-ms") {
      timeoutMs = parseNonNegativeInt(argv[++i], arg);
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parseNonNegativeInt(arg.slice("--timeout-ms=".length), "--timeout-ms");
      continue;
    }
  }

  return {
    dryRun: argv.includes("--dry-run"),
    retireLegacy: argv.includes("--retire-legacy"),
    collections: collections.length ? collections : [...AISAFETY_COLLECTIONS],
    maxRetirements,
    timeoutMs,
  };
}

function parseNonNegativeInt(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} requires a non-negative integer.`);
  }
  return parsed;
}

if (process.argv[1]?.endsWith("/scripts/sync-aisafety.ts")) {
  runAisafetySync(parseCliArgs(process.argv.slice(2))).catch((err) => {
    console.error("Fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

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

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  AISAFETY_COLLECTIONS,
  assertAisafetyCollection,
  fetchAisafetyCollections,
  planAisafetySync,
  type AisafetyCollection,
  type AisafetyFetchOptions,
  type AisafetySyncPlan,
  type ExistingResource,
  type PlannedMissingRow,
  type PlannedRetirementRow,
} from "./lib/aisafety-api";

const DEFAULT_MAX_RETIREMENTS = 200;
const WRITE_BATCH_SIZE = 100;
const UPDATE_BATCH_SIZE = 50;

export interface SyncAisafetyOptions extends AisafetyFetchOptions {
  dryRun?: boolean;
  collections?: AisafetyCollection[];
  retireLegacy?: boolean;
  maxRetirements?: number;
}

export async function run(options: SyncAisafetyOptions = {}): Promise<AisafetySyncPlan> {
  const dryRun = Boolean(options.dryRun);
  const collections = options.collections?.length ? options.collections : [...AISAFETY_COLLECTIONS];
  const maxRetirements = options.maxRetirements ?? DEFAULT_MAX_RETIREMENTS;

  console.log(`AISafety API sync ${dryRun ? "(DRY RUN)" : "(LIVE)"}`);
  console.log(`Collections: ${collections.join(", ")}`);
  if (options.retireLegacy) {
    console.log(`Legacy retirement: enabled (max ${maxRetirements}${dryRun ? ", dry-run report only" : ""})`);
  }

  console.log("\nFetching and validating AISafety API responses...");
  const responses = await fetchAisafetyCollections(collections, options);
  for (const response of responses) {
    console.log(`  OK ${response.collection}: ${response.data.length} records`);
  }

  console.log("\nFetching existing resources from Supabase...");
  const supabase = getDb();
  const existingResources = await fetchExistingResources(supabase);
  console.log(`  Loaded ${existingResources.length} resources`);

  const plan = planAisafetySync({
    collections,
    responses,
    existingResources,
    retireLegacy: options.retireLegacy,
  });

  printPlan(plan, { dryRun, maxRetirements });

  if (dryRun) {
    console.log("\nDry run complete. No database writes were performed.");
    return plan;
  }

  if (plan.retirements.length > maxRetirements) {
    throw new Error(
      `Refusing to retire ${plan.retirements.length} legacy rows; max is ${maxRetirements}. ` +
        "Re-run with --max-retirements after reviewing a dry-run report.",
    );
  }

  console.log("\nWriting AISafety cache rows...");
  await upsertSeenRows(supabase, plan);

  console.log("Applying missing-row tombstones...");
  await applyMissingRows(supabase, plan.missing);

  if (options.retireLegacy) {
    console.log("Applying explicit legacy retirement...");
    await applyRetirements(supabase, plan.retirements);
  }

  console.log("\nAISafety API sync complete.");
  return plan;
}

function getDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key);
}

async function fetchExistingResources(supabase: SupabaseClient): Promise<ExistingResource[]> {
  const rows: ExistingResource[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + 999);

    if (error) {
      throw new Error(`Supabase resources fetch failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as ExistingResource[]));
    if (data.length < 1000) break;
    from += 1000;
  }

  return rows;
}

async function upsertSeenRows(supabase: SupabaseClient, plan: AisafetySyncPlan): Promise<void> {
  const rows = plan.seen.map((seen) => seen.row);
  for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
    const batch = rows.slice(i, i + WRITE_BATCH_SIZE);
    const { error } = await supabase.from("resources").upsert(batch, { onConflict: "id" });
    if (error) {
      throw new Error(`Supabase upsert failed for AISafety rows ${i + 1}-${i + batch.length}: ${error.message}`);
    }
    console.log(`  Upserted ${i + batch.length}/${rows.length}`);
  }
}

async function applyMissingRows(supabase: SupabaseClient, rows: PlannedMissingRow[]): Promise<void> {
  await applyResourceUpdates(
    supabase,
    rows.map((row) => ({ id: row.existing.id, update: row.update })),
    "missing-row update",
  );
}

async function applyRetirements(supabase: SupabaseClient, rows: PlannedRetirementRow[]): Promise<void> {
  await applyResourceUpdates(
    supabase,
    rows.map((row) => ({ id: row.existing.id, update: row.update })),
    "legacy retirement",
  );
}

async function applyResourceUpdates(
  supabase: SupabaseClient,
  rows: Array<{ id: string; update: Record<string, unknown> }>,
  label: string,
): Promise<void> {
  if (rows.length === 0) {
    console.log("  None");
    return;
  }

  for (let i = 0; i < rows.length; i += UPDATE_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPDATE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (row) => {
        const { error } = await supabase.from("resources").update(row.update).eq("id", row.id);
        return { id: row.id, error };
      }),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw new Error(`Supabase ${label} failed for ${failed.id}: ${failed.error.message}`);
    }
    console.log(`  Applied ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
  }
}

function printPlan(
  plan: AisafetySyncPlan,
  options: { dryRun: boolean; maxRetirements: number },
): void {
  const { summary } = plan;
  console.log("\nPlan summary:");
  console.log(`  Created:          ${summary.created}`);
  console.log(`  Updated:          ${summary.updated}`);
  console.log(`  Unchanged:        ${summary.unchanged}`);
  console.log(`  Missing seen:     ${summary.missing}`);
  console.log(`  Disabled missing: ${summary.disabledMissing}`);
  console.log(`  Takeovers:        ${summary.takeovers}`);
  console.log(`  Legacy retired:   ${summary.retiredLegacy}`);

  if (plan.retirements.length > 0) {
    const flag = plan.retirements.length > options.maxRetirements ? "EXCEEDS LIMIT" : "within limit";
    console.log(`  Retirement limit: ${plan.retirements.length}/${options.maxRetirements} (${flag})`);
  }

  if (plan.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of plan.warnings) console.log(`  - ${warning}`);
  }

  const takeovers = plan.seen.filter((row) => row.takeover).slice(0, 20);
  if (takeovers.length > 0) {
    console.log("\nTakeovers planned:");
    for (const row of takeovers) {
      console.log(
        `  - ${row.existing!.id}: ${row.existing!.source || "null"}:${row.existing!.source_id || "null"} ` +
          `-> aisafety:${row.mapped.canonicalSourceId} (${row.matchReason})`,
      );
    }
    if (plan.summary.takeovers > takeovers.length) {
      console.log(`  ... ${plan.summary.takeovers - takeovers.length} more`);
    }
  }

  if (plan.retirements.length > 0) {
    console.log("\nLegacy rows to retire:");
    for (const row of plan.retirements.slice(0, 20)) {
      console.log(`  - ${row.existing.id}: ${row.existing.title} (${row.existing.source})`);
    }
    if (plan.retirements.length > 20) {
      console.log(`  ... ${plan.retirements.length - 20} more`);
    }
  }
}

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
  run(parseCliArgs(process.argv.slice(2))).catch((err) => {
    console.error("Fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

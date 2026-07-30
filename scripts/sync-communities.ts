/**
 * sync-communities.ts
 *
 * Fetches communities from:
 *   1. EA Forum           (GraphQL – ~449 local groups)
 *   2. LessWrong          (GraphQL – ~240 local groups)
 *   3. PauseAI            (GitHub JSON – ~96 chapters + ~28 adjacent)
 *
 * Then deduplicates by normalized URL (or name+location),
 * and inserts into the `community_candidates` staging table for AI evaluation.
 *
 * AISafety.com communities are mirrored directly into resources by
 * scripts/sync-aisafety.ts using the official public API.
 *
 * Usage:
 *   npx tsx scripts/sync-communities.ts              # live sync
 *   npx tsx scripts/sync-communities.ts --dry-run    # show what would change
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { insertCommunityCandidates, type GatheredCommunity } from "./lib/insert-community-candidates";

// ─── Types ─────────────────────────────────────────────────

interface CommunityEntry {
  title: string;
  description: string;
  url: string;
  source_org: string;
  location: string;
  source: string;
  source_id: string;
}

interface ForumGroup {
  _id: string;
  name: string;
  location?: string;
  contents?: { plaintextDescription?: string };
  website?: string;
  facebookLink?: string;
  isOnline?: boolean;
}

interface ForumGroupsResponse {
  data?: {
    localgroups?: {
      results?: ForumGroup[];
    };
  };
}

interface PauseAICommunity {
  name?: string;
  parent_name?: string;
  link?: string;
}

interface PauseAIResponse {
  communities?: PauseAICommunity[];
}

// ─── URL normalization ─────────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip www, trailing slash, query params, hash
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

// ─── 1. EA Forum ───────────────────────────────────────────

async function fetchEAForumGroups(): Promise<CommunityEntry[]> {
  console.log("📡 Fetching EA Forum groups...");

  const query = `{
    localgroups(input: { terms: { limit: 2000 } }) {
      results {
        _id
        name
        location
        contents { plaintextDescription }
        website
        facebookLink
        types
        mongoLocation
        isOnline
      }
    }
  }`;

  const res = await fetch("https://forum.effectivealtruism.org/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const json = (await res.json()) as ForumGroupsResponse;
  const groups = json?.data?.localgroups?.results || [];
  console.log(`   → ${groups.length} groups`);

  return groups.map((g) => ({
    title: g.name,
    description: (g.contents?.plaintextDescription || "").slice(0, 500),
    url: g.website || g.facebookLink || `https://forum.effectivealtruism.org/groups/${g._id}`,
    source_org: "EA Forum",
    location: g.isOnline ? "Online" : (g.location || "Global"),
    source: "ea-forum",
    source_id: g._id,
  }));
}

// ─── 2. LessWrong ──────────────────────────────────────────

async function fetchLessWrongGroups(): Promise<CommunityEntry[]> {
  console.log("📡 Fetching LessWrong groups...");

  const query = `{
    localgroups(input: { terms: { limit: 2000 } }) {
      results {
        _id
        name
        location
        contents { plaintextDescription }
        website
        facebookLink
        types
        mongoLocation
        isOnline
      }
    }
  }`;

  const res = await fetch("https://www.lesswrong.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const json = (await res.json()) as ForumGroupsResponse;
  const groups = json?.data?.localgroups?.results || [];
  console.log(`   → ${groups.length} groups`);

  return groups.map((g) => ({
    title: g.name,
    description: (g.contents?.plaintextDescription || "").slice(0, 500),
    url: g.website || g.facebookLink || `https://www.lesswrong.com/groups/${g._id}`,
    source_org: "LessWrong",
    location: g.isOnline ? "Online" : (g.location || "Global"),
    source: "lesswrong",
    source_id: g._id,
  }));
}

// ─── 3. PauseAI ────────────────────────────────────────────

const PAUSEAI_BASE =
  "https://raw.githubusercontent.com/PauseAI/pauseai-website/main/src/routes/communities";

async function fetchPauseAIGroups(): Promise<CommunityEntry[]> {
  console.log("📡 Fetching PauseAI groups from GitHub...");

  const [mainRes, adjRes] = await Promise.all([
    fetch(`${PAUSEAI_BASE}/pauseai-communities.json`),
    fetch(`${PAUSEAI_BASE}/adjacent-communities.json`),
  ]);

  const mainData = (await mainRes.json()) as PauseAIResponse;
  const adjData = (await adjRes.json()) as PauseAIResponse;

  const pauseaiComms = mainData.communities || [];
  const adjacentComms = adjData.communities || [];

  console.log(`   → ${pauseaiComms.length} PauseAI chapters + ${adjacentComms.length} adjacent`);

  const entries: CommunityEntry[] = [];

  for (const c of pauseaiComms) {
    const city = c.name || "Unknown";
    const country = c.parent_name || "";
    const locationStr = country ? `${city}, ${country}` : city;

    // Build the best URL we can: their link field, or fallback to pauseai.info
    let url = "https://pauseai.info/communities";
    if (c.link && !c.link.startsWith("$$")) {
      url = c.link;
    }

    entries.push({
      title: `PauseAI ${city}`,
      description: `PauseAI local chapter in ${locationStr}. Join the movement advocating for responsible AI development.`,
      url,
      source_org: "PauseAI",
      location: locationStr,
      source: "pauseai",
      source_id: `pauseai-${city.toLowerCase().replace(/\s+/g, "-")}-${(country || "").toLowerCase().replace(/\s+/g, "-")}`,
    });
  }

  for (const c of adjacentComms) {
    if (!c.name || !c.link || c.link.startsWith("$$")) continue;
    entries.push({
      title: c.name,
      description: `AI safety community listed on PauseAI.`,
      url: c.link,
      source_org: "PauseAI (adjacent)",
      location: "Global", // adjacent communities don't always have location
      source: "pauseai",
      source_id: `pauseai-adj-${c.name.toLowerCase().replace(/\s+/g, "-")}`,
    });
  }

  return entries;
}

// ─── Deduplication ─────────────────────────────────────────

function deduplicateCommunities(all: CommunityEntry[]): CommunityEntry[] {
  const byUrl = new Map<string, CommunityEntry>();
  const bySourceId = new Map<string, CommunityEntry>();

  // Priority: ea-forum > pauseai > lesswrong
  const priority: Record<string, number> = {
    "ea-forum": 3,
    "pauseai": 2,
    "lesswrong": 1,
  };

  for (const entry of all) {
    const normalUrl = normalizeUrl(entry.url);
    const existing = byUrl.get(normalUrl) || bySourceId.get(entry.source_id);

    if (existing) {
      // Keep the one with higher priority
      const existingPri = priority[existing.source] || 0;
      const newPri = priority[entry.source] || 0;
      if (newPri > existingPri) {
        // Replace with higher priority source
        byUrl.set(normalUrl, entry);
        bySourceId.set(entry.source_id, entry);
      }
    } else {
      byUrl.set(normalUrl, entry);
      bySourceId.set(entry.source_id, entry);
    }
  }

  return Array.from(byUrl.values());
}

// ─── Insert to community_candidates ─────────────────────────

async function syncToDatabase(communities: CommunityEntry[], dryRun = false) {
  console.log(`\n📦 Inserting ${communities.length} communities into candidates table...`);

  if (dryRun) {
    for (const comm of communities) {
      console.log(`   ➕ CANDIDATE: "${comm.title}" (${comm.source}) - ${comm.url}`);
    }
    console.log(`\n✅ Dry run complete: ${communities.length} communities would be inserted as candidates.`);
    return;
  }

  // Convert CommunityEntry to GatheredCommunity format
  const gathered: GatheredCommunity[] = communities.map((c) => ({
    title: c.title,
    description: c.description,
    url: c.url,
    source: c.source,
    source_id: c.source_id,
    source_org: c.source_org,
    location: c.location,
  }));

  const result = await insertCommunityCandidates(gathered);

  console.log(`\n✅ Sync complete:`);
  console.log(`   ${result.inserted} new candidates inserted`);
  console.log(`   ${result.skipped} duplicates skipped`);
  console.log(`   ${result.errors} errors`);
}

// ─── Exported run function ──────────────────────────────────

export async function run(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  console.log(`🔄 Community Sync - ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   ${new Date().toISOString()}\n`);

  const [eaGroups, lwGroups, pauseaiGroups] = await Promise.all([
    fetchEAForumGroups().catch((err) => {
      console.error("❌ EA Forum fetch failed:", err.message);
      return [] as CommunityEntry[];
    }),
    fetchLessWrongGroups().catch((err) => {
      console.error("❌ LessWrong fetch failed:", err.message);
      return [] as CommunityEntry[];
    }),
    fetchPauseAIGroups().catch((err) => {
      console.error("❌ PauseAI fetch failed:", err.message);
      return [] as CommunityEntry[];
    }),
  ]);

  console.log(`\n📊 Totals before dedup:`);
  console.log(`   EA Forum:    ${eaGroups.length}`);
  console.log(`   LessWrong:   ${lwGroups.length}`);
  console.log(`   PauseAI:     ${pauseaiGroups.length}`);
  console.log(`   Raw total:   ${eaGroups.length + lwGroups.length + pauseaiGroups.length}`);

  const all = [...eaGroups, ...lwGroups, ...pauseaiGroups];
  const deduped = deduplicateCommunities(all);

  console.log(`   After dedup: ${deduped.length}`);

  await syncToDatabase(deduped, dryRun);
}

// CLI entrypoint
if (process.argv[1]?.endsWith('/scripts/sync-communities.ts')) {
  run({ dryRun: process.argv.includes("--dry-run") }).catch((err) => {
    console.error("💥 Fatal error:", err);
    process.exit(1);
  });
}

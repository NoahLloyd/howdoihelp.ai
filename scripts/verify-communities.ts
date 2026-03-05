/**
 * verify-communities.ts
 *
 * Automated verification & activity scoring for community resources.
 *
 * For each community, this script:
 *   1. Checks if the URL is reachable (HEAD → GET fallback)
 *   2. Assigns an activity_score based on multiple signals:
 *      - URL reachability
 *      - Platform type (Discord, Meetup, Facebook → likely active)
 *      - Description quality / length
 *      - Source reliability (EA Forum groups with IDs → likely real)
 *   3. Updates the DB with url_status, activity_score, verified_at, verification_notes
 *
 * Usage:
 *   npx tsx scripts/verify-communities.ts              # verify all unverified
 *   npx tsx scripts/verify-communities.ts --all        # re-verify everything
 *   npx tsx scripts/verify-communities.ts --dry-run    # preview without writing
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

// ─── Config ────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY_ALL = process.argv.includes("--all");
const CONCURRENCY = 15; // parallel HTTP checks
const TIMEOUT_MS = 8000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE env vars - check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── URL Check ─────────────────────────────────────────────

interface UrlCheckResult {
  status: "reachable" | "dead" | "redirect";
  httpCode: number;
  finalUrl?: string;
  notes: string[];
}

async function checkUrl(url: string): Promise<UrlCheckResult> {
  const notes: string[] = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "howdoihelp.ai community-verifier/1.0",
        Accept: "text/html,*/*",
      },
    });

    clearTimeout(timeout);

    const finalUrl = res.url;
    const redirected = finalUrl !== url && new URL(finalUrl).hostname !== new URL(url).hostname;

    if (res.ok) {
      if (redirected) {
        notes.push(`Redirected to ${new URL(finalUrl).hostname}`);
        return { status: "redirect", httpCode: res.status, finalUrl, notes };
      }
      return { status: "reachable", httpCode: res.status, notes };
    }

    // Some servers don't support HEAD - try GET
    if (res.status === 405 || res.status === 403) {
      const getRes = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
        headers: {
          "User-Agent": "howdoihelp.ai community-verifier/1.0",
          Accept: "text/html,*/*",
        },
      });

      if (getRes.ok) {
        return { status: "reachable", httpCode: getRes.status, notes };
      }
      notes.push(`GET returned ${getRes.status}`);
      return { status: "dead", httpCode: getRes.status, notes };
    }

    notes.push(`HTTP ${res.status}`);
    return { status: "dead", httpCode: res.status, notes };
  } catch (err: any) {
    if (err.name === "AbortError" || err.code === "ABORT_ERR") {
      notes.push("Timeout");
    } else {
      notes.push(err.message?.slice(0, 80) || "Unknown error");
    }
    return { status: "dead", httpCode: 0, notes };
  }
}

// ─── Activity Scoring ──────────────────────────────────────

interface ScoringInput {
  url: string;
  urlCheck: UrlCheckResult;
  title: string;
  description: string;
  source: string;
  source_org: string;
  source_id: string;
  location: string;
}

function scoreActivity(input: ScoringInput): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  // ── 1. URL reachability (0.0–0.3) ──
  if (input.urlCheck.status === "reachable") {
    score += 0.3;
  } else if (input.urlCheck.status === "redirect") {
    score += 0.2;
    notes.push("URL redirects");
  } else {
    score += 0;
    notes.push("URL unreachable");
  }

  // ── 2. Platform signal (0.0–0.25) ──
  const url = input.url.toLowerCase();
  const domain = (() => {
    try { return new URL(url).hostname; } catch { return ""; }
  })();

  // Active-leaning platforms
  if (domain.includes("meetup.com")) {
    score += 0.25;
    notes.push("Meetup (likely active)");
  } else if (domain.includes("discord.gg") || domain.includes("discord.com")) {
    score += 0.2;
    notes.push("Discord server");
  } else if (domain.includes("facebook.com") && url.includes("/groups/")) {
    score += 0.2;
    notes.push("Facebook group");
  } else if (domain.includes("slack.com")) {
    score += 0.15;
    notes.push("Slack workspace");
  } else if (domain.includes("t.me")) {
    score += 0.15;
    notes.push("Telegram");
  } else if (domain.includes("whatsapp.com")) {
    score += 0.15;
    notes.push("WhatsApp group");
  } else if (
    domain.includes("linkedin.com") ||
    domain.includes("reddit.com") ||
    domain.includes("facebook.com")
  ) {
    score += 0.1;
  } else if (
    domain.includes("forum.effectivealtruism.org") ||
    domain.includes("lesswrong.com")
  ) {
    // Forum group page - it's an index page, not a standalone community
    score += 0.1;
    notes.push("Forum group page");
  } else if (domain.includes("instagram.com")) {
    score += 0.05;
  } else if (
    // Has its own website domain → committed community
    !domain.includes("google.com") &&
    !domain.includes("linktr.ee") &&
    !domain.includes("github.com")
  ) {
    score += 0.2;
    notes.push("Own website");
  } else {
    score += 0.05;
  }

  // ── 3. Description quality (0.0–0.2) ──
  const desc = input.description || "";
  if (desc.length > 200) {
    score += 0.2;
  } else if (desc.length > 80) {
    score += 0.15;
  } else if (desc.length > 20) {
    score += 0.08;
  } else {
    score += 0.02;
    notes.push("Minimal description");
  }

  // ── 4. Source reliability (0.0–0.15) ──
  if (input.source === "ea-forum" || input.source === "lesswrong") {
    // Groups that have a proper ID on a curated platform
    score += 0.15;
  } else if (input.source === "pauseai") {
    score += 0.1;
  } else {
    // aisafety.com scrape - less reliable
    score += 0.05;
  }

  // ── 5. Location specificity (0.0–0.1) ──
  if (input.location && input.location !== "Global" && input.location !== "Online") {
    // Has a real location → more likely a real local group
    score += 0.1;
  } else if (input.location === "Online") {
    score += 0.05;
  }

  // Clamp to [0, 1]
  score = Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;

  return { score, notes };
}

// ─── Batch processor ───────────────────────────────────────

async function processBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;

  async function next(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log(`🔍 Community Verification - ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`   ${new Date().toISOString()}\n`);

  // Fetch communities to verify
  let query = supabase
    .from("resources")
    .select("id, title, url, description, source, source_org, source_id, location, activity_score, url_status")
    .eq("category", "communities")
    .eq("enabled", true);

  if (!VERIFY_ALL) {
    query = query.eq("url_status", "unknown");
  }

  const { data: communities, error } = await query;

  if (error) {
    console.error("❌ Failed to fetch communities:", error.message);
    process.exit(1);
  }

  console.log(`📋 ${communities.length} communities to verify\n`);

  if (communities.length === 0) {
    console.log("✅ Nothing to verify.");
    return;
  }

  // Process in batches
  let verified = 0;
  let dead = 0;
  let reachable = 0;

  const results = await processBatch(
    communities,
    async (comm: any) => {
      const urlCheck = await checkUrl(comm.url);
      const { score, notes } = scoreActivity({
        url: comm.url,
        urlCheck,
        title: comm.title,
        description: comm.description || "",
        source: comm.source || "manual",
        source_org: comm.source_org || "",
        source_id: comm.source_id || "",
        location: comm.location || "Global",
      });

      const allNotes = [...urlCheck.notes, ...notes].join("; ");

      verified++;

      if (urlCheck.status === "reachable" || urlCheck.status === "redirect") {
        reachable++;
      } else {
        dead++;
      }

      // Progress
      if (verified % 50 === 0 || verified === communities.length) {
        process.stdout.write(
          `\r   Checked ${verified}/${communities.length} (${reachable} OK, ${dead} dead)`
        );
      }

      return {
        id: comm.id,
        title: comm.title,
        url_status: urlCheck.status,
        activity_score: score,
        verification_notes: allNotes,
        verified_at: new Date().toISOString(),
      };
    },
    CONCURRENCY
  );

  console.log("\n");

  // Write results
  if (DRY_RUN) {
    // Show summary
    const sorted = [...results].sort((a, b) => a.activity_score - b.activity_score);
    console.log("Bottom 10 (lowest activity score):");
    for (const r of sorted.slice(0, 10)) {
      console.log(
        `   ${r.activity_score.toFixed(2)} | ${r.url_status.padEnd(9)} | ${r.title.slice(0, 40).padEnd(40)} | ${r.verification_notes}`
      );
    }
    console.log("\nTop 10 (highest activity score):");
    for (const r of sorted.slice(-10)) {
      console.log(
        `   ${r.activity_score.toFixed(2)} | ${r.url_status.padEnd(9)} | ${r.title.slice(0, 40).padEnd(40)} | ${r.verification_notes}`
      );
    }
  } else {
    console.log("📦 Writing results to database...");

    // Batch updates (Supabase doesn't support bulk update, so we do chunks)
    let updated = 0;
    let failed = 0;

    for (const r of results) {
      const { error } = await supabase
        .from("resources")
        .update({
          url_status: r.url_status,
          activity_score: r.activity_score,
          verification_notes: r.verification_notes,
          verified_at: r.verified_at,
        })
        .eq("id", r.id);

      if (error) {
        failed++;
        if (failed <= 3) console.error(`   ❌ ${r.title}: ${error.message}`);
      } else {
        updated++;
      }
    }

    console.log(`\n✅ Updated ${updated} communities (${failed} errors)`);
  }

  // Summary
  console.log("\n📊 Summary:");
  console.log(`   Total checked:  ${verified}`);
  console.log(`   Reachable:      ${reachable}`);
  console.log(`   Dead/timeout:   ${dead}`);

  const scores = results.map((r) => r.activity_score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const high = scores.filter((s) => s >= 0.7).length;
  const mid = scores.filter((s) => s >= 0.4 && s < 0.7).length;
  const low = scores.filter((s) => s < 0.4).length;

  console.log(`   Avg score:      ${avg.toFixed(2)}`);
  console.log(`   High (≥0.7):    ${high}`);
  console.log(`   Mid (0.4–0.7):  ${mid}`);
  console.log(`   Low (<0.4):     ${low}`);
}

main().catch((err) => {
  console.error("💥 Fatal:", err);
  process.exit(1);
});

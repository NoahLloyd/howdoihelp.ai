/**
 * One-time script to fix:
 * 1. Incorrect min_minutes on events (all defaulted to 60 min)
 * 2. source_org: "Other" on communities from AISafety.com
 *
 * Usage: npx tsx scripts/fix-times-and-sources.ts [--dry-run]
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Event time estimates by type ─────────────────────────────
const EVENT_TIMES: Record<string, number> = {
  meetup: 120,     // 2 hours
  social: 120,     // 2 hours
  talk: 90,        // 1.5 hours
  workshop: 240,   // 4 hours (half day)
  conference: 480, // full day
  hackathon: 480,  // full day
  course: 1800,    // multi-week commitment
  fellowship: 2400, // multi-week commitment
  program: 2400,   // multi-week commitment
  retreat: 1440,   // multi-day
  other: 120,      // default to meetup
};

// ─── Platform detection for community URLs ────────────────────
function detectPlatformOrg(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("discord.gg") || host.includes("discord.com")) return "Discord";
    if (host.includes("reddit.com")) return "Reddit";
    if (host.includes("t.me") || host.includes("telegram.org")) return "Telegram";
    if (host.includes("meetup.com")) return "Meetup";
    if (host.includes("facebook.com")) return "Facebook";
    if (host.includes("linkedin.com")) return "LinkedIn";
    if (host.includes("slack.com")) return "Slack";
    if (host.includes("instagram.com")) return "Instagram";
    if (host.includes("groups.google.com")) return "Google Groups";
    if (host.includes("substack.com")) return "Substack";
    if (host.includes("dcard.tw")) return "Dcard";
    if (host.includes("gather.town")) return "Gather Town";
    if (host.includes("campuslabs.com")) return "Campus Labs";
    if (host.includes("docs.google.com") || host.includes("forms.gle")) return "Google Forms";
    if (host.includes("airtable.com")) return "Airtable";
    if (host.includes("lesswrong.com")) return "LessWrong";
    if (host.includes("effectivealtruism.org") || host.includes("forum.effectivealtruism.org")) return "EA Forum";
    if (host.includes("alignmentforum.org")) return "Alignment Forum";
    if (host.includes("linktr.ee")) return null; // can't extract org from linktree
    if (host.includes("bit.ly")) return null; // can't extract from short URLs
    return null;
  } catch {
    return null;
  }
}

/**
 * For communities with their own website, we don't try to derive an org name
 * from the domain (produces ugly results). Instead we use the community title
 * as the source_org — the favicon from the URL will provide the visual identity.
 */

/**
 * For communities with source_org "Other", derive a better org name.
 * Priority:
 *   1. Well-known org domains → curated name
 *   2. Platform URLs → use platform name as source, keep original title prominent
 *   3. Org website → derive from domain
 *   4. Fall back to keeping "Other"
 */
const KNOWN_COMMUNITY_DOMAINS: Record<string, string> = {
  "bluedot.org": "BlueDot Impact",
  "safeaigermany.org": "Safe AI Germany",
  "newspeak.house": "Newspeak House",
  "monoid.ru": "Monoid",
  "far.ai": "FAR.AI",
  "manifund.org": "Manifund",
};

function deriveCommunityOrg(title: string, url: string): string {
  // Check known domains first
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, name] of Object.entries(KNOWN_COMMUNITY_DOMAINS)) {
      if (host === domain || host.endsWith(`.${domain}`)) return name;
    }
  } catch { /* continue */ }

  // Check if it's a platform URL — these are genuinely useful to show
  const platform = detectPlatformOrg(url);
  if (platform) return platform;

  // For communities with their own websites, extract a clean name from the title.
  // Strip common suffixes like parenthetical acronyms.
  const cleanTitle = title
    .replace(/\s*\([^)]+\)\s*$/, "") // remove trailing (ACRONYM)
    .replace(/\s*→\s*$/, "")          // remove trailing arrow
    .replace(/&amp;/g, "&")           // decode HTML entities
    .replace(/&#x27;/g, "'")
    .trim();

  if (cleanTitle && cleanTitle !== "Other") return cleanTitle;

  return "Other"; // give up
}

async function fixEventTimes() {
  console.log("\n=== FIXING EVENT TIMES ===\n");

  const { data: events, error } = await supabase
    .from("resources")
    .select("id, title, event_type, min_minutes")
    .eq("enabled", true)
    .eq("status", "approved")
    .eq("category", "events");

  if (error) {
    console.error("Error fetching events:", error);
    return;
  }

  let updated = 0;
  for (const event of events!) {
    // Skip the manually set ones (organize event = 300 min, attend event = 60 min are seed data)
    if (!event.event_type) continue;

    const newTime = EVENT_TIMES[event.event_type] || EVENT_TIMES.other;
    if (newTime === event.min_minutes) continue;

    console.log(
      `  ${event.event_type.padEnd(12)} ${String(event.min_minutes).padStart(5)} → ${String(newTime).padStart(5)}  ${event.title}`
    );

    if (!DRY_RUN) {
      const { error: updateErr } = await supabase
        .from("resources")
        .update({ min_minutes: newTime })
        .eq("id", event.id);
      if (updateErr) console.error(`  ERROR updating ${event.id}:`, updateErr);
    }
    updated++;
  }

  console.log(`\n  ${updated} events ${DRY_RUN ? "would be" : ""} updated`);
}

async function fixProgramTimes() {
  console.log("\n=== FIXING PROGRAM TIMES ===\n");

  const { data: programs, error } = await supabase
    .from("resources")
    .select("id, title, source_org, min_minutes, description")
    .eq("enabled", true)
    .eq("status", "approved")
    .eq("category", "programs");

  if (error) {
    console.error("Error fetching programs:", error);
    return;
  }

  let updated = 0;
  for (const prog of programs!) {
    // Only fix the blanket 1200 min from AISafety.com scraper
    if (prog.source_org !== "AISafety.com") continue;
    if (prog.min_minutes !== 1200) continue;

    // Estimate based on title keywords
    const t = prog.title.toLowerCase();
    let newTime = 2400; // default for fellowships

    if (t.includes("bootcamp") || t.includes("ml4good")) {
      newTime = 2400; // ~1 week intensive (5 days)
    } else if (t.includes("course") || t.includes("seminar") || t.includes("introduction")) {
      newTime = 1800; // multi-week part-time
    } else if (t.includes("incubator") || t.includes("accelerator")) {
      newTime = 3600; // multi-week program
    } else if (t.includes("fellowship") || t.includes("intern")) {
      newTime = 4800; // multi-month
    }

    if (newTime === prog.min_minutes) continue;

    console.log(
      `  ${String(prog.min_minutes).padStart(5)} → ${String(newTime).padStart(5)}  ${prog.title}`
    );

    if (!DRY_RUN) {
      const { error: updateErr } = await supabase
        .from("resources")
        .update({ min_minutes: newTime })
        .eq("id", prog.id);
      if (updateErr) console.error(`  ERROR updating ${prog.id}:`, updateErr);
    }
    updated++;
  }

  console.log(`\n  ${updated} programs ${DRY_RUN ? "would be" : ""} updated`);
}

async function fixCommunitySourceOrgs() {
  console.log("\n=== FIXING COMMUNITY source_org ===\n");

  const { data: communities, error } = await supabase
    .from("resources")
    .select("id, title, source_org, url")
    .eq("enabled", true)
    .eq("status", "approved")
    .eq("category", "communities")
    .eq("source_org", "Other");

  if (error) {
    console.error("Error fetching communities:", error);
    return;
  }

  let updated = 0;
  let unchanged = 0;

  for (const comm of communities!) {
    const newOrg = deriveCommunityOrg(comm.title, comm.url);

    if (newOrg === "Other") {
      unchanged++;
      console.log(`  SKIP  ${comm.title} | ${comm.url}`);
      continue;
    }

    console.log(`  Other → ${newOrg.padEnd(20)}  ${comm.title}`);

    if (!DRY_RUN) {
      const { error: updateErr } = await supabase
        .from("resources")
        .update({ source_org: newOrg })
        .eq("id", comm.id);
      if (updateErr) console.error(`  ERROR updating ${comm.id}:`, updateErr);
    }
    updated++;
  }

  console.log(`\n  ${updated} updated, ${unchanged} unchanged ${DRY_RUN ? "(dry run)" : ""}`);
}

async function main() {
  if (DRY_RUN) console.log("🔍 DRY RUN - no changes will be made\n");

  await fixEventTimes();
  await fixProgramTimes();
  await fixCommunitySourceOrgs();

  console.log("\nDone!");
}

main();

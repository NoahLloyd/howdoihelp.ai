/**
 * Seed script - loads resources from data/resources.ts into Supabase.
 *
 * Usage:  npx tsx scripts/seed.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { resources } from "../src/data/resources";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log(`Seeding ${resources.length} resources…`);

  const rows = resources.map((resource) => ({
    id: resource.id,
    title: resource.title,
    description: resource.description,
    url: resource.url,
    source_org: resource.source_org,
    category: resource.category,
    location: resource.location,
    min_minutes: resource.min_minutes,
    ev_general: resource.ev_general,
    ev_positioned: resource.ev_positioned || null,
    friction: resource.friction,
    enabled: resource.enabled,
    status: resource.status,
    event_date: resource.event_date || null,
    deadline_date: resource.deadline_date || null,
    created_at: resource.created_at,
    submitted_by: resource.submitted_by || null,
    background_tags: resource.background_tags || [],
    position_tags: resource.position_tags || [],
  }));

  const { error } = await supabase
    .from("resources")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`✓ ${resources.length} resources seeded.`);
}

main();

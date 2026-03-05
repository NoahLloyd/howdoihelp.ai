"use server";

import { createClient } from "@supabase/supabase-js";
import type { ResourceCategory } from "@/types";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY - add it to .env.local");
  }
  return createClient(url, key);
}

/** Simple global rate limit: max 20 pending submissions per hour. */
async function checkRateLimit(): Promise<void> {
  const supabase = getServiceClient();
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

  const { count, error } = await supabase
    .from("resources")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .gte("created_at", oneHourAgo);

  if (error) throw new Error("Rate limit check failed");
  if ((count || 0) >= 20) {
    throw new Error("Too many recent submissions. Please try again later.");
  }
}

export interface SubmitResourceInput {
  title: string;
  description: string;
  url: string;
  source_org: string;
  category: ResourceCategory;
  location: string;
  event_date?: string;
  submitted_by: string;
}

export async function submitResource(input: SubmitResourceInput): Promise<void> {
  // Validate
  if (!input.title || !input.url || !input.submitted_by) {
    throw new Error("Title, URL, and your name are required.");
  }

  if (input.title.length > 200 || input.description.length > 1000) {
    throw new Error("Title or description too long.");
  }

  // Rate limit
  await checkRateLimit();

  const supabase = getServiceClient();

  // Events go to the candidates pipeline for AI evaluation before appearing
  if (input.category === "events") {
    const id = `cand-submission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const row = {
      id,
      title: input.title.trim(),
      description: (input.description || "").trim(),
      url: input.url.trim(),
      source: "submission",
      source_id: id,
      source_org: (input.source_org || "").trim() || null,
      location: (input.location || "Global").trim(),
      event_date: input.event_date || null,
      submitted_by: input.submitted_by.trim(),
      status: "pending",
    };

    const { error } = await supabase.from("event_candidates").insert(row);
    if (error) throw new Error(error.message);
    return;
  }

  // Communities go to the community candidates pipeline for AI evaluation
  if (input.category === "communities") {
    const id = `cand-comm-submission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const row = {
      id,
      title: input.title.trim(),
      description: (input.description || "").trim(),
      url: input.url.trim(),
      source: "submission",
      source_id: id,
      source_org: (input.source_org || "").trim() || null,
      location: (input.location || "Global").trim(),
      submitted_by: input.submitted_by.trim(),
      status: "pending",
    };

    const { error } = await supabase.from("community_candidates").insert(row);
    if (error) throw new Error(error.message);
    return;
  }

  // Programs go to the program candidates pipeline for AI evaluation
  if (input.category === "programs") {
    const id = `cand-prog-submission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const row = {
      id,
      title: input.title.trim(),
      description: (input.description || "").trim(),
      url: input.url.trim(),
      source: "submission",
      source_id: id,
      source_org: (input.source_org || "").trim() || null,
      location: (input.location || "Online").trim(),
      submitted_by: input.submitted_by.trim(),
      status: "pending",
    };

    const { error } = await supabase.from("program_candidates").insert(row);
    if (error) throw new Error(error.message);
    return;
  }

  // Other resources go directly to the resources table as before
  const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const row = {
    id,
    title: input.title.trim(),
    description: (input.description || "").trim(),
    url: input.url.trim(),
    source_org: (input.source_org || "").trim(),
    category: input.category,
    location: (input.location || "Global").trim(),
    min_minutes: 5,     // default, admin can adjust
    ev_general: 0.3,    // default, admin can adjust
    friction: 0.1,      // default, admin can adjust
    enabled: false,      // not visible until approved
    status: "pending",
    event_date: input.event_date || null,
    deadline_date: null,
    created_at: new Date().toISOString(),
    submitted_by: input.submitted_by.trim(),
    background_tags: [],
    position_tags: [],
  };

  const { error } = await supabase.from("resources").insert(row);
  if (error) throw new Error(error.message);
}

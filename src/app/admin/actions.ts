"use server";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Resource, ResourceCategory } from "@/types";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY — add it to .env.local");
  }
  return createClient(url, key);
}

// ─── Auth ───────────────────────────────────────────────────

export async function loginAdmin(password: string): Promise<boolean> {
  const validPassword = process.env.ADMIN_PASSWORD || "a#31yn6:bdPf";
  // Trim to handle rogue spaces from copy/pasting or env parsing
  if (password.trim() === validPassword.trim()) {
    (await cookies()).set("admin_session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
    });
    return true;
  }
  return false;
}

async function verifyAdmin() {
  const session = (await cookies()).get("admin_session");
  if (!session || session.value !== "authenticated") {
    throw new Error("Unauthorized");
  }
}


// ─── Read ───────────────────────────────────────────────────

export async function fetchAllResources(): Promise<Resource[]> {
  await verifyAdmin();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .order("category", { ascending: true })
    .order("ev_general", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Resource[]) || [];
}

export async function fetchResourcesByCategory(
  category: ResourceCategory
): Promise<Resource[]> {
  await verifyAdmin();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .eq("category", category)
    .order("ev_general", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Resource[]) || [];
}

/** Public fetch — only approved + enabled resources. */
export async function fetchPublicResources(
  category: ResourceCategory
): Promise<Resource[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .eq("category", category)
    .eq("status", "approved")
    .eq("enabled", true)
    .order("ev_general", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Resource[]) || [];
}

// ─── Toggle ─────────────────────────────────────────────────

export async function toggleResourceEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("resources")
    .update({ enabled })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Save (create or update) ────────────────────────────────

export async function saveResource(resource: Resource): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();

  const row = {
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
    activity_score: resource.activity_score ?? 0.5,
    url_status: resource.url_status || "unknown",
    verification_notes: resource.verification_notes || null,
  };

  const { error } = await supabase
    .from("resources")
    .upsert(row, { onConflict: "id" });

  if (error) throw new Error(error.message);
}

// ─── Delete ─────────────────────────────────────────────────

export async function deleteResource(id: string): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();

  // Clean up foreign key relations first (cascade delete manually)
  await supabase.from("resource_clicks").delete().eq("resource_id", id);

  const { error } = await supabase.from("resources").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Approve / Reject submissions ───────────────────────────

export async function approveResource(id: string): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("resources")
    .update({ status: "approved", enabled: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function rejectResource(id: string): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("resources")
    .update({ status: "rejected", enabled: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Event Candidates ──────────────────────────────────────

export interface EventCandidate {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  source_id: string | null;
  source_org: string | null;
  location: string | null;
  event_date: string | null;
  event_end_date: string | null;
  submitted_by: string | null;
  scraped_text: string | null;
  ai_is_real_event: boolean | null;
  ai_is_relevant: boolean | null;
  ai_relevance_score: number | null;
  ai_impact_score: number | null;
  ai_suggested_ev: number | null;
  ai_suggested_friction: number | null;
  ai_event_type: string | null;
  ai_summary: string | null;
  ai_reasoning: string | null;
  status: string;
  processed_at: string | null;
  promoted_at: string | null;
  promoted_resource_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchEventCandidates(
  status?: string
): Promise<EventCandidate[]> {
  await verifyAdmin();
  const supabase = getServiceClient();

  let query = supabase
    .from("event_candidates")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as EventCandidate[]) || [];
}

export async function promoteCandidate(id: string): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();

  // Fetch the candidate
  const { data: candidate, error: fetchErr } = await supabase
    .from("event_candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !candidate) throw new Error("Candidate not found");

  const resourceId = `eval-${candidate.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { error: insertErr } = await supabase.from("resources").insert({
    id: resourceId,
    title: candidate.ai_summary ? (candidate.title || candidate.ai_summary) : candidate.title,
    description: candidate.ai_summary || candidate.description || "",
    url: candidate.url,
    source_org: candidate.source_org || candidate.source,
    category: "events",
    location: candidate.location || "Global",
    min_minutes: 60,
    ev_general: candidate.ai_suggested_ev || 0.5,
    friction: candidate.ai_suggested_friction || 0.2,
    enabled: true,
    status: "approved",
    event_date: candidate.event_date || null,
    event_type: candidate.ai_event_type || null,
    activity_score: 0.9,
    url_status: "reachable",
    source: candidate.source,
    source_id: candidate.source_id,
    created_at: new Date().toISOString(),
  });

  if (insertErr) throw new Error(insertErr.message);

  // Mark candidate as promoted
  const { error: updateErr } = await supabase
    .from("event_candidates")
    .update({
      status: "promoted",
      promoted_at: new Date().toISOString(),
      promoted_resource_id: resourceId,
    })
    .eq("id", id);

  if (updateErr) throw new Error(updateErr.message);
}

export async function rejectCandidate(id: string): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("event_candidates")
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Community Candidates ─────────────────────────────────

export interface CommunityCandidate {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  source_id: string | null;
  source_org: string | null;
  location: string | null;
  submitted_by: string | null;
  scraped_text: string | null;
  ai_is_real_community: boolean | null;
  ai_is_relevant: boolean | null;
  ai_relevance_score: number | null;
  ai_quality_score: number | null;
  ai_suggested_ev: number | null;
  ai_suggested_friction: number | null;
  ai_community_type: string | null;
  ai_clean_title: string | null;
  ai_clean_description: string | null;
  ai_clean_location: string | null;
  ai_is_online: boolean | null;
  ai_organization: string | null;
  ai_reasoning: string | null;
  duplicate_of: string | null;
  status: string;
  processed_at: string | null;
  promoted_at: string | null;
  promoted_resource_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchCommunityCandidates(
  status?: string
): Promise<CommunityCandidate[]> {
  await verifyAdmin();
  const supabase = getServiceClient();

  let query = supabase
    .from("community_candidates")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as CommunityCandidate[]) || [];
}

export async function promoteCommunityCandidate(id: string): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();

  const { data: candidate, error: fetchErr } = await supabase
    .from("community_candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !candidate) throw new Error("Candidate not found");

  const resourceId = `eval-comm-${candidate.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { error: insertErr } = await supabase.from("resources").insert({
    id: resourceId,
    title: candidate.ai_clean_title || candidate.title,
    description: candidate.ai_clean_description || candidate.description || "",
    url: candidate.url,
    source_org: candidate.ai_organization || candidate.source_org || candidate.source,
    category: "communities",
    location: candidate.ai_clean_location || candidate.location || "Global",
    min_minutes: 5,
    ev_general: candidate.ai_suggested_ev || 0.3,
    friction: candidate.ai_suggested_friction || 0.1,
    enabled: true,
    status: "approved",
    activity_score: candidate.ai_quality_score || 0.5,
    url_status: "reachable",
    source: candidate.source,
    source_id: candidate.source_id,
    created_at: new Date().toISOString(),
  });

  if (insertErr) throw new Error(insertErr.message);

  const { error: updateErr } = await supabase
    .from("community_candidates")
    .update({
      status: "promoted",
      promoted_at: new Date().toISOString(),
      promoted_resource_id: resourceId,
    })
    .eq("id", id);

  if (updateErr) throw new Error(updateErr.message);
}

export async function rejectCommunityCandidate(id: string): Promise<void> {
  await verifyAdmin();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("community_candidates")
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── API Usage / Cost Stats ────────────────────────────────

export interface ApiUsageStats {
  totalCost: number;
  last7DaysCost: number;
  last24hCost: number;
  byProvider: { provider: string; count: number; cost: number }[];
  claudeBreakdown: {
    model: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    avgInputTokens: number;
    avgOutputTokens: number;
    avgCostPerCall: number;
  }[];
  totalEnrichments: number;
  totalRecommendations: number;
  claudeTotalTokens: number;
  claudeTotalInputTokens: number;
  claudeTotalOutputTokens: number;
  recentEntries: {
    provider: string;
    model: string | null;
    endpoint: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    estimated_cost_usd: number | null;
    created_at: string;
  }[];
}

export async function fetchApiUsageStats(): Promise<ApiUsageStats> {
  await verifyAdmin();
  const supabase = getServiceClient();

  const { data: rows, error } = await supabase
    .from("api_usage")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw new Error(error.message);
  const entries = rows || [];

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  let totalCost = 0;
  let last7DaysCost = 0;
  let last24hCost = 0;
  const providerMap = new Map<string, { count: number; cost: number }>();
  const claudeMap = new Map<string, { count: number; inputTokens: number; outputTokens: number; cost: number }>();
  let totalEnrichments = 0;
  let totalRecommendations = 0;

  for (const e of entries) {
    const cost = e.estimated_cost_usd || 0;
    const age = now - new Date(e.created_at).getTime();

    totalCost += cost;
    if (age < 7 * day) last7DaysCost += cost;
    if (age < day) last24hCost += cost;

    // By provider
    const p = providerMap.get(e.provider) || { count: 0, cost: 0 };
    p.count++;
    p.cost += cost;
    providerMap.set(e.provider, p);

    // Claude breakdown
    if (e.provider === "claude" || e.provider === "openai") {
      // Count recommendations by endpoint, not provider
      if (e.endpoint === "messages.create") totalRecommendations++;
      const model = e.model || "unknown";
      const c = claudeMap.get(model) || { count: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      c.count++;
      c.inputTokens += e.input_tokens || 0;
      c.outputTokens += e.output_tokens || 0;
      c.cost += cost;
      claudeMap.set(model, c);
    }

    // Enrichments
    if (["github", "scrape"].includes(e.provider)) {
      totalEnrichments++;
    }
  }

  // Compute Claude totals
  let claudeTotalInputTokens = 0;
  let claudeTotalOutputTokens = 0;
  for (const c of claudeMap.values()) {
    claudeTotalInputTokens += c.inputTokens;
    claudeTotalOutputTokens += c.outputTokens;
  }

  return {
    totalCost,
    last7DaysCost,
    last24hCost,
    byProvider: [...providerMap.entries()].map(([provider, v]) => ({ provider, ...v })),
    claudeBreakdown: [...claudeMap.entries()].map(([model, v]) => ({
      model,
      ...v,
      avgInputTokens: v.count > 0 ? Math.round(v.inputTokens / v.count) : 0,
      avgOutputTokens: v.count > 0 ? Math.round(v.outputTokens / v.count) : 0,
      avgCostPerCall: v.count > 0 ? v.cost / v.count : 0,
    })),
    totalEnrichments,
    totalRecommendations,
    claudeTotalTokens: claudeTotalInputTokens + claudeTotalOutputTokens,
    claudeTotalInputTokens,
    claudeTotalOutputTokens,
    recentEntries: entries.slice(0, 50).map((e) => ({
      provider: e.provider,
      model: e.model,
      endpoint: e.endpoint,
      input_tokens: e.input_tokens,
      output_tokens: e.output_tokens,
      estimated_cost_usd: e.estimated_cost_usd,
      created_at: e.created_at,
    })),
  };
}

import { getSupabase } from "@/lib/supabase";
import { llmComplete, extractJson } from "@/lib/llm";
import { getActivePrompt, interpolateTemplate } from "@/lib/prompts";
import { scoreResource } from "@/lib/ranking";
import type {
  EnrichedProfile,
  UserAnswers,
  GeoData,
  Resource,
  RecommendedResource,
  GuideRecommendation,
  ScoredResource,
  ResourceCategory,
} from "@/types";

export const dynamic = "force-dynamic";

// ─── Guide Fetcher ──────────────────────────────────────────

interface GuideWithProfile {
  id: string;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  topics: string[];
  best_for: string | null;
  not_a_good_fit: string | null;
  location: string | null;
  preferred_career_stages: string[];
  preferred_backgrounds: string[];
  preferred_experience_level: string[];
  languages: string[];
  calendar_link: string;
  booking_mode: string;
  avatar_url: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  is_available_in_person: boolean;
  geographic_preference: string;
  availability_mode: string;
}

async function fetchActiveGuides(): Promise<GuideWithProfile[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: guides } = await supabase
    .from("guides")
    .select("*")
    .eq("status", "active")
    .not("calendar_link", "is", null)
    .neq("calendar_link", "");

  if (!guides || guides.length === 0) return [];

  const guideIds = guides.map((g: { id: string }) => g.id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, bio")
    .in("id", guideIds);

  const profileMap = new Map(
    (profiles || []).map((p: { id: string; display_name: string | null; avatar_url: string | null; bio: string | null }) => [p.id, p])
  );

  return guides.map((g: Record<string, unknown>): GuideWithProfile => {
    const p = profileMap.get(g.id as string) as { display_name: string | null; avatar_url: string | null; bio: string | null } | undefined;
    return {
      id: g.id as string,
      display_name: p?.display_name ?? null,
      headline: g.headline as string | null,
      bio: p?.bio ?? null,
      topics: (g.topics as string[]) || [],
      best_for: g.best_for as string | null,
      not_a_good_fit: g.not_a_good_fit as string | null,
      location: g.location as string | null,
      preferred_career_stages: (g.preferred_career_stages as string[]) || [],
      preferred_backgrounds: (g.preferred_backgrounds as string[]) || [],
      preferred_experience_level: (g.preferred_experience_level as string[]) || [],
      languages: (g.languages as string[]) || [],
      calendar_link: g.calendar_link as string,
      booking_mode: (g.booking_mode as string) || "direct",
      avatar_url: p?.avatar_url ?? null,
      linkedin_url: g.linkedin_url as string | null,
      website_url: g.website_url as string | null,
      is_available_in_person: (g.is_available_in_person as boolean) || false,
      geographic_preference: (g.geographic_preference as string) || "anywhere",
      availability_mode: (g.availability_mode as string) || "unlimited",
    };
  });
}

// ─── Guide Filtering ─────────────────────────────────────────

function locationContains(guideLocation: string | null, term: string | undefined): boolean {
  if (!guideLocation || !term) return false;
  return guideLocation.toLowerCase().includes(term.toLowerCase());
}

/** Capacity limit for each availability mode (per period) */
function getCapacityLimit(mode: string): { limit: number; periodDays: number } | null {
  switch (mode) {
    case "one_call": return { limit: 1, periodDays: 9999 }; // effectively forever
    case "1_per_month": return { limit: 1, periodDays: 30 };
    case "2_per_month": return { limit: 2, periodDays: 30 };
    case "1_per_week": return { limit: 1, periodDays: 7 };
    case "2_per_week": return { limit: 2, periodDays: 7 };
    default: return null; // unlimited
  }
}

async function filterGuides(
  guides: GuideWithProfile[],
  geo: GeoData,
): Promise<GuideWithProfile[]> {
  // Geographic filtering
  let filtered = guides.filter((g) => {
    switch (g.geographic_preference) {
      case "same_city":
        return locationContains(g.location, geo.city);
      case "same_country":
        return locationContains(g.location, geo.country) ||
          locationContains(g.location, geo.countryCode);
      case "same_timezone":
        // Best-effort: match country since we don't have reliable timezone mapping
        return locationContains(g.location, geo.country) ||
          locationContains(g.location, geo.countryCode);
      default: // "anywhere"
        return true;
    }
  });

  // Availability/capacity filtering
  const guidesNeedingCapacityCheck = filtered.filter((g) => g.availability_mode !== "unlimited");
  if (guidesNeedingCapacityCheck.length > 0) {
    const supabase = getSupabase();
    if (supabase) {
      const guideIds = guidesNeedingCapacityCheck.map((g) => g.id);

      // Fetch pending and approved requests for these guides
      const { data: requests } = await supabase
        .from("guide_requests")
        .select("guide_id, status, created_at")
        .in("guide_id", guideIds)
        .in("status", ["pending", "approved"]);

      if (requests && requests.length > 0) {
        const now = Date.now();
        const excludeIds = new Set<string>();

        for (const guide of guidesNeedingCapacityCheck) {
          const cap = getCapacityLimit(guide.availability_mode);
          if (!cap) continue;

          const guideRequests = requests.filter(
            (r: { guide_id: string; status: string; created_at: string }) => r.guide_id === guide.id
          );

          if (guide.availability_mode === "one_call") {
            // For one_call: any pending or approved request means they're at capacity
            if (guideRequests.length > 0) {
              excludeIds.add(guide.id);
            }
          } else {
            // For recurring: count approved requests within the period
            const periodStart = now - cap.periodDays * 24 * 60 * 60 * 1000;
            const recentApproved = guideRequests.filter(
              (r: { status: string; created_at: string }) =>
                r.status === "approved" &&
                new Date(r.created_at).getTime() >= periodStart
            );
            // Also count pending as "reserved" slots
            const pending = guideRequests.filter(
              (r: { status: string }) => r.status === "pending"
            );
            if (recentApproved.length + pending.length >= cap.limit) {
              excludeIds.add(guide.id);
            }
          }
        }

        filtered = filtered.filter((g) => !excludeIds.has(g.id));
      }
    }
  }

  return filtered;
}

// ─── Request Handler ─────────────────────────────────────────

interface RecommendRequest {
  profile?: EnrichedProfile;
  answers: UserAnswers;
  geo: GeoData;
  resources: Resource[];
  userId?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RecommendRequest;
    const { profile, answers, geo, resources, userId } = body;

    if (!resources?.length) {
      return Response.json({ error: "resources required" }, { status: 400 });
    }

    // Fetch guides and active prompt in parallel
    const [allGuides, activePrompt] = await Promise.all([
      fetchActiveGuides(),
      getActivePrompt("recommend"),
    ]);

    // Pre-filter guides based on geographic preference, availability, etc.
    const guides = await filterGuides(allGuides, geo);

    // ─── Pre-filter resources to reduce token cost ──────────
    const filteredResources = preFilterResources(resources, answers, geo);
    const filteredGuides = preFilterGuides(guides, answers, geo);
    console.log(
      `[recommend] Pre-filtered ${resources.length} → ${filteredResources.length} resources, ${guides.length} → ${filteredGuides.length} guides`
    );

    // Build variable values for template interpolation
    const templateVars = buildTemplateVars(profile, answers, geo, filteredResources, filteredGuides);

    // Interpolate the template and send as single user message
    const fullPrompt = interpolateTemplate(activePrompt.content, templateVars);

    const result = await llmComplete({
      task: "recommend",
      system: "",
      user: fullPrompt,
      maxTokens: 8192,
      endpoint: "messages.create",
      modelOverride: activePrompt.model || undefined,
    });

    const jsonStr = extractJson(result.text);

    let recommendations: RecommendedResource[];
    let guideRecommendation: GuideRecommendation | undefined;

    try {
      const parsed = JSON.parse(jsonStr);
      recommendations = [];

      for (const item of parsed as Record<string, unknown>[]) {
        // Guide recommendation
        if (item.guideId) {
          const guide = guides.find((g) => g.id === item.guideId);
          if (guide) {
            guideRecommendation = {
              guideId: item.guideId as string,
              rank: item.rank as number,
              description: (item.description as string) || "",
              guide: {
                id: guide.id,
                display_name: guide.display_name,
                avatar_url: guide.avatar_url,
                headline: guide.headline,
                bio: guide.bio,
                topics: guide.topics,
                calendar_link: guide.calendar_link,
                location: guide.location,
                is_available_in_person: guide.is_available_in_person,
                preferred_career_stages: guide.preferred_career_stages,
                preferred_backgrounds: guide.preferred_backgrounds,
                languages: guide.languages,
                linkedin_url: guide.linkedin_url,
                website_url: guide.website_url,
                booking_mode: guide.booking_mode as "direct" | "approval_required",
              },
            };
            continue;
          }
        }

        // Resource recommendation
        const rec: RecommendedResource = {
          resourceId: item.resourceId as string,
          rank: item.rank as number,
          description: (item.description as string) ||
            (item.personalFit as string) ||
            (item.reasoning as string) ||
            "",
        };
        if (item.title) rec.title = item.title as string;
        if (item.matchReason) rec.matchReason = item.matchReason as string;
        recommendations.push(rec);
      }
    } catch {
      console.error("[recommend] Failed to parse LLM response:", result.text.slice(0, 300));
      return Response.json({ error: "Failed to parse recommendations" }, { status: 500 });
    }

    // Log usage to Supabase
    const { usage } = result;
    const supabase = getSupabase();
    if (supabase) {
      await supabase
        .from("api_usage")
        .insert({
          provider: usage.provider,
          model: usage.model,
          endpoint: usage.endpoint,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          estimated_cost_usd: usage.estimated_cost_usd,
          user_id: userId || undefined,
          prompt_version: activePrompt.version || undefined,
        })
        .then(() => {}, () => {});
    }

    return Response.json({
      recommendations,
      guideRecommendation,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        estimatedCost: usage.estimated_cost_usd,
      },
    });
  } catch (err) {
    console.error("[recommend] Error:", err);
    return Response.json({ error: "Recommendation engine unavailable" }, { status: 500 });
  }
}

// ─── Pre-filter: Resources ──────────────────────────────────

const MAX_RESOURCES_FOR_LLM = 50;
const CATEGORY_CAP = 18;

/**
 * Score and pre-filter resources before sending to Claude.
 * Uses the same algorithmic scoring as the fallback ranker to
 * reduce hundreds of resources to a manageable shortlist (~50).
 * Ensures category diversity so Claude sees events, programs,
 * communities, letters, and other content.
 */
function preFilterResources(
  resources: Resource[],
  answers: UserAnswers,
  geo: GeoData,
): Resource[] {
  // If already small enough, no filtering needed
  if (resources.length <= MAX_RESOURCES_FOR_LLM) {
    return resources;
  }

  // Score everything
  const scored = resources
    .map((r) => scoreResource(r, answers, geo, "A"))
    .filter((s) => s.score > 0);

  // Group by category
  const buckets: Record<string, ScoredResource[]> = {};
  for (const s of scored) {
    const cat = s.resource.category;
    if (!buckets[cat]) buckets[cat] = [];
    buckets[cat].push(s);
  }

  // Sort each bucket by score
  for (const cat of Object.keys(buckets)) {
    buckets[cat].sort((a, b) => b.score - a.score);
  }

  // Take top N from each category
  const selected = new Set<string>();
  for (const cat of Object.keys(buckets)) {
    const topN = buckets[cat].slice(0, CATEGORY_CAP);
    for (const s of topN) selected.add(s.resource.id);
  }

  // Always include urgent items (deadline within 30 days, high activity)
  const now = Date.now();
  for (const s of scored) {
    if (selected.has(s.resource.id)) continue;
    const r = s.resource;
    if (r.deadline_date) {
      const daysUntil = (new Date(r.deadline_date).getTime() - now) / 86_400_000;
      if (daysUntil >= 0 && daysUntil <= 30) {
        selected.add(r.id);
        continue;
      }
    }
    if ((r.activity_score ?? 0) >= 0.9 && s.score > 0.2) {
      selected.add(r.id);
    }
  }

  // If still under cap, fill with highest-scoring from any category
  if (selected.size < MAX_RESOURCES_FOR_LLM) {
    const remaining = scored
      .filter((s) => !selected.has(s.resource.id))
      .sort((a, b) => b.score - a.score);
    for (const s of remaining) {
      if (selected.size >= MAX_RESOURCES_FOR_LLM) break;
      selected.add(s.resource.id);
    }
  }

  // Return in original order to avoid biasing Claude
  return resources.filter((r) => selected.has(r.id));
}

// ─── Pre-filter: Guides ─────────────────────────────────────

const MAX_GUIDES_FOR_LLM = 10;

/**
 * Pre-filter guides for relevance. Lightweight scoring based on
 * location match, background overlap, and career stage fit.
 */
function preFilterGuides(
  guides: GuideWithProfile[],
  answers: UserAnswers,
  geo: GeoData,
): GuideWithProfile[] {
  if (guides.length <= MAX_GUIDES_FOR_LLM) return guides;

  const scored = guides.map((g) => {
    let score = 1.0;

    // Location boost: guide in same area as user
    if (g.location && geo.city) {
      const loc = g.location.toLowerCase();
      const city = geo.city.toLowerCase();
      if (loc.includes(city) || (geo.region && loc.includes(geo.region.toLowerCase()))) {
        score *= 1.3;
      } else if (geo.country && loc.includes(geo.country.toLowerCase())) {
        score *= 1.1;
      }
      // In-person availability matters more for local users
      if (g.is_available_in_person && loc.includes(city)) score *= 1.2;
    }

    // Position/background match
    if (answers.positionType && g.preferred_backgrounds.length > 0) {
      const matches = g.preferred_backgrounds.some((b) =>
        b.toLowerCase().includes(answers.positionType!.replace("_", " "))
      );
      if (matches) score *= 1.3;
    }

    // Career stage hint from position type
    if (answers.positionType === "student" && g.preferred_career_stages.length > 0) {
      if (g.preferred_career_stages.some((s) => s.toLowerCase().includes("student") || s.toLowerCase().includes("early"))) {
        score *= 1.2;
      }
    }

    return { guide: g, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_GUIDES_FOR_LLM).map((s) => s.guide);
}

// ─── Template Variable Builders ──────────────────────────────

function buildTemplateVars(
  profile: EnrichedProfile | undefined,
  answers: UserAnswers,
  geo: GeoData,
  resources: Resource[],
  guides: GuideWithProfile[],
): Record<string, string> {
  return {
    profile: buildProfileVar(profile, answers),
    answers: buildAnswersVar(answers),
    location: buildLocationVar(geo),
    resources: buildResourcesVar(resources),
    guides_section: buildGuidesVar(guides),
    guides_instruction: guides.length > 0 ? " You may also include 1 guide if there's a strong match." : "",
  };
}

function buildProfileVar(profile: EnrichedProfile | undefined, answers: UserAnswers): string {
  const lines: string[] = [];

  if (profile) {
    if (profile.dataSource) lines.push(`Data source: ${profile.dataSource} (${profile.dataSource === "bright_data" || profile.dataSource === "github_api" ? "high" : "medium"} confidence)`);
  }
  if (answers.profileText && !profile) {
    lines.push(`[Web search results — low confidence]\n${answers.profileText}`);
  } else if (answers.profileText && profile) {
    lines.push(`\n[Supplementary web search — low confidence, only use to fill gaps]\n${answers.profileText}`);
  }
  if (profile) {
    if (profile.fullName) lines.push(`Name: ${profile.fullName}`);
    if (profile.headline) lines.push(`Headline: ${profile.headline}`);
    if (profile.currentTitle && profile.currentCompany) {
      lines.push(`Current role: ${profile.currentTitle} at ${profile.currentCompany}`);
    } else if (profile.currentTitle) {
      lines.push(`Current role: ${profile.currentTitle}`);
    }
    if (profile.location) lines.push(`Location: ${profile.location}`);
    if (profile.currentCompany && !profile.currentTitle) {
      lines.push(`Company: ${profile.currentCompany}`);
    }
    if (profile.summary) lines.push(`Summary: ${profile.summary}`);
    if (profile.skills.length > 0) {
      lines.push(`Background & credentials:\n${profile.skills.slice(0, 30).map((s) => `  - ${s}`).join("\n")}`);
    }
    if (profile.experience.length > 0) {
      const expLines = profile.experience.slice(0, 5).map(
        (e) => `  - ${e.title ? `${e.title} at ` : ""}${e.company}${e.description ? `: ${e.description.slice(0, 100)}` : ""}`
      );
      lines.push(`Experience:\n${expLines.join("\n")}`);
    }
    if (profile.education.length > 0) {
      const eduLines = profile.education.slice(0, 3).map((e) => {
        let line = `  - ${e.degree || ""} ${e.field || ""} at ${e.school}`.trim();
        if (e.description) line += ` (${e.description})`;
        if (e.activities) line += ` - Activities: ${e.activities.slice(0, 200)}`;
        return line;
      });
      lines.push(`Education:\n${eduLines.join("\n")}`);
    }
    if (profile.repos && profile.repos.length > 0) {
      const repoLines = profile.repos.slice(0, 5).map(
        (r) => `  - ${r.name} (${r.language || "unknown"}, ${r.stars} stars)${r.description ? `: ${r.description}` : ""}`
      );
      lines.push(`Top GitHub repos:\n${repoLines.join("\n")}`);
    }
    if (profile.followers != null) lines.push(`GitHub followers: ${profile.followers}`);
    lines.push(`Profile platform: ${profile.platform}`);
  }
  if (answers.profileUrl && !answers.profileText) lines.push(`Profile URL: ${answers.profileUrl}`);
  if (answers.profilePlatform && !profile && !answers.profileText) lines.push(`Profile platform: ${answers.profilePlatform}`);
  if (lines.length === 0) lines.push("No profile data available - personalize based on answers and location only.");

  return lines.join("\n");
}

function buildAnswersVar(answers: UserAnswers): string {
  const lines: string[] = [];
  lines.push(`Time commitment: ${answers.time}`);
  if (answers.intent) lines.push(`Intent: ${answers.intent}`);
  if (answers.positioned) lines.push(`Self-identified as uniquely positioned`);
  if (answers.positionType) lines.push(`Position type: ${answers.positionType}`);
  return lines.join("\n");
}

function buildLocationVar(geo: GeoData): string {
  const lines: string[] = [];
  if (geo.city) lines.push(`City: ${geo.city}`);
  if (geo.region) lines.push(`Region: ${geo.region}`);
  lines.push(`Country: ${geo.country} (${geo.countryCode})`);
  return lines.join("\n");
}

function buildResourcesVar(resources: Resource[]): string {
  return resources.map((r) => {
    const tags = [
      r.category,
      r.location,
      `${r.min_minutes}min`,
      `ev=${r.ev_general}`,
      `friction=${r.friction}`,
    ];
    if (r.position_tags?.length) tags.push(`position_tags=[${r.position_tags.join(",")}]`);
    if (r.event_date) tags.push(`date=${r.event_date}`);
    if (r.deadline_date) tags.push(`deadline=${r.deadline_date}`);
    return `[${r.id}] "${r.title}" - ${r.description} (${tags.join(", ")})`;
  }).join("\n\n");
}

function buildGuidesVar(guides: GuideWithProfile[]): string {
  if (guides.length === 0) return "";
  const guideLines = guides.map((g) => {
    const parts = [`[${g.id}] "${g.display_name || "Guide"}"${g.headline ? ` - ${g.headline}` : ""}`];
    if (g.topics.length > 0) parts.push(`  Topics: ${g.topics.join(", ")}`);
    if (g.best_for) parts.push(`  Best for: ${g.best_for}`);
    if (g.not_a_good_fit) parts.push(`  NOT a good fit for: ${g.not_a_good_fit}`);
    if (g.preferred_career_stages.length > 0) parts.push(`  Preferred career stages: ${g.preferred_career_stages.join(", ")}`);
    if (g.preferred_backgrounds.length > 0) parts.push(`  Preferred backgrounds: ${g.preferred_backgrounds.join(", ")}`);
    if (g.preferred_experience_level.length > 0) parts.push(`  Preferred AI safety experience: ${g.preferred_experience_level.join(", ")}`);
    if (g.location) parts.push(`  Location: ${g.location}`);
    if (g.geographic_preference !== "anywhere") parts.push(`  Geographic preference: ${g.geographic_preference}`);
    if (g.languages.length > 1) parts.push(`  Languages: ${g.languages.join(", ")}`);
    return parts.join("\n");
  });
  return `\n<available_guides>\n${guideLines.join("\n\n")}\n</available_guides>`;
}

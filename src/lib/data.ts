import { getSupabase } from "./supabase";
import { resources as localResources } from "@/data/resources";
import type { Resource, Variant, UserAnswers } from "@/types";

/** Check if a resource's date (event_date or deadline_date) has passed */
function isPastDate(resource: Resource): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (resource.event_date && resource.event_date < today) return true;
  if (resource.deadline_date && resource.deadline_date < today) return true;
  return false;
}

/**
 * Fetch all enabled, approved resources from Supabase.
 * Filters out events/programs whose dates have already passed.
 * Falls back to local seed data if Supabase isn't configured or fails.
 */
export async function fetchResources(): Promise<Resource[]> {
  const supabase = getSupabase();

  const filterActive = (resources: Resource[]) =>
    resources.filter((r) => r.enabled && r.status === "approved" && !isPastDate(r));

  if (!supabase) {
    return filterActive(localResources);
  }

  try {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .eq("enabled", true)
      .eq("status", "approved")
      .order("ev_general", { ascending: false });

    if (error) {
      console.error("Supabase fetch error, falling back to local:", error.message);
      return filterActive(localResources);
    }

    return filterActive((data as Resource[]) || localResources);
  } catch (err) {
    console.error("Supabase connection error, falling back to local:", err);
    return filterActive(localResources);
  }
}

/**
 * Track a click on a resource.
 * Fire-and-forget - don't block the user experience.
 */
export async function trackClick(
  resourceId: string,
  variant: Variant,
  answers: UserAnswers,
  geoCountry?: string
): Promise<void> {
  const supabase = getSupabase();

  if (!supabase) return;

  try {
    await supabase.from("resource_clicks").insert({
      resource_id: resourceId,
      variant,
      user_time: answers.time,
      user_intents: answers.intent ? [answers.intent] : [],
      geo_country: geoCountry || null,
    });
  } catch {
    // Silently fail - never block UX for tracking
  }
}

// ─── Creator Resource Overrides ─────────────────────────────

export interface CreatorOverrides {
  excluded_resources: string[];
  boosted_resources: string[];
  resource_weights: Record<string, number>;
}

/**
 * Apply creator-specific overrides to resources.
 * - Filters out excluded resources
 * - Applies weight multipliers to ev_general
 * - Boosts pinned resources by increasing their ev_general
 */
export function applyCreatorOverrides(
  resources: Resource[],
  overrides: CreatorOverrides
): Resource[] {
  const excluded = new Set(overrides.excluded_resources);
  const boosted = new Set(overrides.boosted_resources);

  return resources
    .filter((r) => !excluded.has(r.id))
    .map((r) => {
      let evGeneral = r.ev_general;

      // Apply custom weight if set
      const weight = overrides.resource_weights[r.id];
      if (weight != null) {
        evGeneral *= weight;
      }

      // Boost pinned resources
      if (boosted.has(r.id)) {
        evGeneral *= 1.5;
      }

      if (evGeneral === r.ev_general) return r;
      return { ...r, ev_general: evGeneral };
    });
}

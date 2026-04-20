import { Variant } from "@/types";

/**
 * Append UTM tracking params to an outbound URL.
 */
export function trackUrl(
  url: string,
  variant: Variant,
  resourceId: string,
  campaignOverride?: string
): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "howdoihelp");
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", campaignOverride || variant);
    u.searchParams.set("utm_content", resourceId);
    return u.toString();
  } catch {
    // If the URL is malformed, return as-is
    return url;
  }
}

/**
 * Append plain UTM params to a static outbound URL (no resource id).
 */
export function withUtm(
  url: string,
  campaign: string,
  content?: string
): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "howdoihelp");
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", campaign);
    if (content) u.searchParams.set("utm_content", content);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Format minutes into a human-readable time estimate.
 *
 * Ranges:
 *   ≤2 min        → "2 min"
 *   3–59 min      → "X min"
 *   1–1.5 hours   → "~1 hour"
 *   2–40 hours    → "X hours"
 *   41–160 hours  → "X weeks" (assumes ~20 hrs/week part-time)
 *   161+ hours    → "X months" (assumes ~160 hrs/month full-time)
 */
export function formatTime(minutes: number): string {
  if (minutes <= 2) return "2 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 2) return "~1 hour";
  if (hours <= 40) return `${Math.round(hours)} hours`;
  const weeks = Math.round(hours / 20);
  if (weeks <= 8) return `${weeks} weeks`;
  const months = Math.round(hours / 160);
  return months <= 1 ? "~1 month" : `${months} months`;
}

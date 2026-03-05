import type { Resource } from "@/types";
import { checkRateLimit, type RateLimitResult } from "./rate-limit";

// Fields to strip from public responses
const HIDDEN_FIELDS = new Set([
  "enabled",
  "status",
  "url_status",
  "verified_at",
  "verification_notes",
  "submitted_by",
]);

export function stripInternalFields(
  resource: Resource
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resource)) {
    if (!HIDDEN_FIELDS.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

// CORS + cache + rate limit headers
export function apiHeaders(rateLimit: RateLimitResult): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    "X-RateLimit-Limit": String(rateLimit.limit),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
  };
}

// Handle OPTIONS preflight
export function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Rate limit check - returns a 429 Response if exceeded, or null if allowed
export function enforceRateLimit(
  request: Request
): { response: Response; rateLimit: null } | { response: null; rateLimit: RateLimitResult } {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rateLimit = checkRateLimit(ip);

  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return {
      response: Response.json(
        {
          error: {
            code: "rate_limit_exceeded",
            message: `Too many requests. Please retry after ${retryAfter} seconds.`,
          },
        },
        {
          status: 429,
          headers: {
            ...apiHeaders(rateLimit),
            "Retry-After": String(retryAfter),
          },
        }
      ),
      rateLimit: null,
    };
  }

  return { response: null, rateLimit };
}

// Extract country from a location string like "San Francisco, United States"
export function extractCountry(location: string): string {
  if (!location || location === "Global" || location === "Online") return location || "Global";
  const parts = location.split(",");
  return parts[parts.length - 1].trim();
}

// Sort resources
type SortField = "title" | "location" | "created_at" | "activity_score" | "event_date";

export function sortResources(
  resources: Record<string, unknown>[],
  sort: string | null,
  order: string | null
): Record<string, unknown>[] {
  const validSorts = new Set<SortField>(["title", "location", "created_at", "activity_score", "event_date"]);
  const field = (validSorts.has(sort as SortField) ? sort : null) as SortField | null;

  if (!field) return resources;

  const dir = order === "asc" ? 1 : order === "desc" ? -1 : (field === "title" || field === "location" ? 1 : -1);

  return [...resources].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal) * dir;
    }
    return ((aVal as number) - (bVal as number)) * dir;
  });
}

// Convert resources to CSV
export function toCsv(resources: Record<string, unknown>[]): string {
  if (resources.length === 0) return "";

  const headers = Object.keys(resources[0]);
  const escape = (val: unknown): string => {
    if (val == null) return "";
    const str = Array.isArray(val) ? val.join("; ") : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(","),
    ...resources.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

// Shared text search across title, description, source_org
export function matchesSearch(resource: Record<string, unknown>, q: string): boolean {
  const lower = q.toLowerCase();
  const title = String(resource.title || "").toLowerCase();
  const desc = String(resource.description || "").toLowerCase();
  const org = String(resource.source_org || "").toLowerCase();
  return title.includes(lower) || desc.includes(lower) || org.includes(lower);
}

// Check if location is online/global
export function isOnlineLocation(location: string): boolean {
  const l = location?.toLowerCase();
  return l === "online" || l === "global";
}

// Filter by tags (background_tags or position_tags)
export function matchesTags(resource: Record<string, unknown>, tags: string[]): boolean {
  const bg = (resource.background_tags as string[]) || [];
  const pos = (resource.position_tags as string[]) || [];
  const all = [...bg, ...pos];
  return tags.some((t) => all.includes(t));
}

// Build the params echo object (only non-null params)
export function buildParamsEcho(params: Record<string, string | null>): Record<string, string> {
  const echo: Record<string, string> = {};
  for (const [key, val] of Object.entries(params)) {
    if (val != null && val !== "") echo[key] = val;
  }
  return echo;
}

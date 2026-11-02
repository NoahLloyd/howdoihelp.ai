const JSON_FIELDS = ["profile_data", "answers"] as const;
const TEXT_FIELDS = ["profile_platform", "profile_url", "linkedin_email"] as const;
const ALLOWED_FIELDS = new Set<string>([...JSON_FIELDS, ...TEXT_FIELDS, "last_recommendations"]);

// The caller never controls the row id or server-maintained timestamps.
export function parseVisitorUpdates(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const fields = Object.entries(input);
  if (!fields.length || fields.some(([key]) => !ALLOWED_FIELDS.has(key))) return null;
  const updates = input as Record<string, unknown>;
  for (const key of TEXT_FIELDS) {
    if (key in updates && (typeof updates[key] !== "string" || updates[key].length > 4096)) return null;
  }
  for (const key of JSON_FIELDS) {
    if (key in updates && (!updates[key] || typeof updates[key] !== "object" || Array.isArray(updates[key]))) return null;
  }
  if ("last_recommendations" in updates && !Array.isArray(updates.last_recommendations)) return null;
  return Object.fromEntries(fields);
}

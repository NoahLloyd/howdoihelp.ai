import type { GeoData, Resource } from "@/types";

/** Tabs inside "Take action" on the browse page. */
export type ActionSubId = "quick" | "further";

/** Actions that take real commitment. Every other action is Quick. */
const GO_FURTHER_IDS = new Set([
  "tabling",
  "create-content",
  "80k-ai-safety",
  "80k-job-board",
  "volunteer-projects",
  "mentor-others",
]);

/** Short names a card's location may use for a country, by country code. */
const COUNTRY_ALIASES: Record<string, string[]> = {
  GB: ["uk"],
  US: ["usa"],
};

export function assignActionSub(resource: Resource): ActionSubId {
  return GO_FURTHER_IDS.has(resource.id) ? "further" : "quick";
}

export function sortByImpact(a: Resource, b: Resource): number {
  const ratioA = a.ev_general / Math.max(a.friction, 0.01);
  const ratioB = b.ev_general / Math.max(b.friction, 0.01);
  return ratioB - ratioA;
}

/** True when a card is not tied to a place, such as "Global" or "Online". */
export function isAvailableEverywhere(resource: Resource): boolean {
  const loc = resource.location.trim().toLowerCase();
  return loc === "" || loc === "global" || loc === "online";
}

/**
 * False when a card is tied to a place outside the visitor's area, such as a
 * "US only" card for a visitor in Belgium. An unknown location shows everything.
 */
export function isAvailableTo(resource: Resource, geo: GeoData | null): boolean {
  if (isAvailableEverywhere(resource)) return true;
  if (!geo || geo.country === "Unknown" || geo.countryCode === "XX") return true;

  const loc = resource.location.toLowerCase();
  const names = [geo.country, geo.region, geo.city]
    .filter((name): name is string => !!name && name !== "Unknown")
    .map((name) => name.toLowerCase());
  if (names.some((name) => loc.includes(name))) return true;

  // Codes are short, so they only count as separate words ("US only", not "Houston").
  const words = new Set(loc.split(/[^\p{L}\p{N}]+/u));
  const code = geo.countryCode.toUpperCase();
  return [code, ...(COUNTRY_ALIASES[code] ?? [])].some((c) => words.has(c.toLowerCase()));
}

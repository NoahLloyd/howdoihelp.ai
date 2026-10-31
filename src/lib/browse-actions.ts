import type { Resource } from "@/types";

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

/** Contact tools shown first in the Quick tab, in this order. */
const QUICK_PINNED_IDS = [
  "controlai-legislators",
  "ifanyonebuildsit-act",
  "callcongress",
];

export function assignActionSub(resource: Resource): ActionSubId {
  return GO_FURTHER_IDS.has(resource.id) ? "further" : "quick";
}

export function sortByImpact(a: Resource, b: Resource): number {
  const ratioA = a.ev_general / Math.max(a.friction, 0.01);
  const ratioB = b.ev_general / Math.max(b.friction, 0.01);
  return ratioB - ratioA;
}

function pinRank(resource: Resource): number {
  const index = QUICK_PINNED_IDS.indexOf(resource.id);
  return index === -1 ? QUICK_PINNED_IDS.length : index;
}

/** Pinned contact tools first, then the normal impact order. */
export function sortActions(a: Resource, b: Resource): number {
  return pinRank(a) - pinRank(b) || sortByImpact(a, b);
}

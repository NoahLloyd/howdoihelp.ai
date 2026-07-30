import type { Resource } from "@/types";

export function dateOnly(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function resourceExpiryDate(resource: Pick<Resource, "category" | "event_date" | "event_end_date" | "deadline_date">): string | null {
  if (resource.category === "events") {
    return resource.event_end_date || resource.event_date || null;
  }

  if (resource.category === "programs") {
    return resource.deadline_date || resource.event_end_date || resource.event_date || null;
  }

  return null;
}

export function isResourceCurrent(
  resource: Pick<Resource, "category" | "event_date" | "event_end_date" | "deadline_date">,
  now: Date = new Date(),
): boolean {
  const expiry = resourceExpiryDate(resource);
  if (!expiry) return true;
  return String(expiry) >= dateOnly(now);
}

export function isVisibleResource(resource: Resource, now: Date = new Date()): boolean {
  return resource.enabled && resource.status === "approved" && isResourceCurrent(resource, now);
}

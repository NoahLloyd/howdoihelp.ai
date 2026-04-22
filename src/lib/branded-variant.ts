import type { Variant } from "@/types";

const VARIANTS: Variant[] = ["A", "B", "C"];

/**
 * Get or assign a variant for a branded landing page (e.g. /vin, /aimworried).
 * Each branded page uses its own cookie so assignments are independent of
 * the main site and of each other.
 *
 * Returns the variant plus whether it was freshly assigned (so callers can
 * fire a one-time assignment event to PostHog).
 */
export function getBrandedVariant(brandId: string): { variant: Variant; assigned: boolean } {
  if (typeof document === "undefined") return { variant: "A", assigned: false };

  const cookieName = `${brandId}_variant`;
  const cookies = document.cookie.split("; ");
  const existing = cookies
    .find((c) => c.startsWith(`${cookieName}=`))
    ?.split("=")[1] as Variant | undefined;

  if (existing && VARIANTS.includes(existing)) {
    return { variant: existing, assigned: false };
  }

  const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${cookieName}=${variant}; expires=${expires}; path=/; SameSite=Lax`;
  return { variant, assigned: true };
}

"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { setVariant } from "@/lib/variants";
import type { Variant } from "@/types";

const REF_KEY = "hdih_ref";

/** Slugs that map to a specific variant/flow */
const FLOW_SLUGS: Record<string, Variant> = {
  profile: "A",
  browse: "B",
  questions: "C",
};

/**
 * Catch-all for affiliate/creator referral links and flow shortcuts.
 * Static routes (e.g. /events, /communities, /admin) take priority
 * in Next.js, so this only fires for unknown slugs.
 *
 * - /profile, /browse, /questions → set variant and redirect to /
 * - Any other slug → store as referral and redirect to /
 */
export default function ReferralPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (slug) {
      // Check if this is a flow shortcut
      const variant = FLOW_SLUGS[slug];
      if (variant) {
        setVariant(variant);
      }
      // Always store the slug as a ref (for future creator tracking)
      sessionStorage.setItem(REF_KEY, slug);
    }
    router.replace("/");
  }, [slug, router]);

  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog, posthog, markAsInternal, isInternal } from "@/lib/posthog";
import { trackReferralLanded } from "@/lib/tracking";
import { getUserId } from "@/lib/user";

const REF_KEY = "hdih_ref";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initPostHog();

    // Expose helper so team members can run markAsInternal() in the console
    (window as unknown as Record<string, unknown>).markAsInternal = markAsInternal;

    // Skip all tracking for internal users
    if (isInternal()) return;

    // Link PostHog identity to our user ID (same ID used in Supabase)
    const userId = getUserId();
    if (userId) {
      posthog.identify(userId);
    }

    // Pick up affiliate referral stored by the [slug] catch-all route
    const ref = sessionStorage.getItem(REF_KEY);
    if (ref) {
      trackReferralLanded(ref);
      sessionStorage.removeItem(REF_KEY);
    }
  }, []);

  // Track page views on route change (skip for internal users)
  useEffect(() => {
    if (!pathname || isInternal()) return;
    const url = window.origin + pathname + (searchParams?.toString() ? `?${searchParams}` : "");
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return <>{children}</>;
}

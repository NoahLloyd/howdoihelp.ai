import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!key) return;

  posthog.init(key, {
    api_host: host,
    autocapture: false, // manual events only - saves free-tier quota
    capture_pageview: false, // we fire these manually for more control
    capture_pageleave: true, // useful for knowing when users abandon
    persistence: "localStorage+cookie",
  });

  initialized = true;
}

export { posthog };

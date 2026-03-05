import posthog from "posthog-js";

let initialized = false;

/**
 * Mark the current browser as an internal/team user.
 * Run `markAsInternal()` in the browser console on any device you use.
 * Persists in both localStorage AND a cookie (so it works in incognito
 * for the remainder of that session, and in normal browsing forever).
 */
export function markAsInternal() {
  if (typeof window === "undefined") return;
  localStorage.setItem("hdih_internal", "1");
  document.cookie = "hdih_internal=1; path=/; max-age=31536000; SameSite=Lax";
  posthog.register({ is_internal: true });
  posthog.opt_out_capturing();
  console.log("[posthog] Marked as internal — tracking disabled for this browser.");
}

/**
 * Returns true if this browser should be excluded from tracking.
 *
 * Triggers:
 *  1. localStorage flag (set by markAsInternal)
 *  2. Cookie flag (survives incognito within the same session)
 *  3. localhost or Vercel preview deploys (never track dev/preview)
 *  4. ?internal=1 in the URL (one-time flag that also persists)
 */
export function isInternal(): boolean {
  if (typeof window === "undefined") return false;

  // Auto-exclude localhost and Vercel preview URLs
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) {
    return true;
  }

  // Check localStorage
  if (localStorage.getItem("hdih_internal") === "1") return true;

  // Check cookie (works when localStorage is wiped, e.g. incognito)
  if (document.cookie.includes("hdih_internal=1")) return true;

  // Check URL param — if present, persist it
  if (new URLSearchParams(window.location.search).get("internal") === "1") {
    markAsInternal();
    return true;
  }

  return false;
}

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

    // Session replay: record 10% of sessions
    enable_recording_console_log: true,
    session_recording: {
      maskAllInputs: false,
      maskTextSelector: undefined,
    },
  });

  // If this browser is marked as internal, opt out completely
  if (isInternal()) {
    posthog.opt_out_capturing();
  }

  initialized = true;
}

export { posthog };

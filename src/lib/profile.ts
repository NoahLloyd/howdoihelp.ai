import type { ProfilePlatform } from "@/types";

const PLATFORM_HOSTS: Record<string, ProfilePlatform> = {
  "linkedin.com": "linkedin",
  "www.linkedin.com": "linkedin",
  "github.com": "github",
  "www.github.com": "github",
  "x.com": "x",
  "www.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
};

/**
 * Detect which platform a URL belongs to based on its hostname.
 * Returns "personal_website" for valid URLs on unknown hosts,
 * or "other" if the URL can't be parsed.
 */
export function detectPlatform(url: string): ProfilePlatform {
  try {
    // Handle URLs without a protocol
    const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
    const hostname = new URL(normalized).hostname.toLowerCase();
    return PLATFORM_HOSTS[hostname] ?? "personal_website";
  } catch {
    return "other";
  }
}

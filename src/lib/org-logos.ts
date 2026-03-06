/**
 * Organization logo resolution.
 *
 * Strategy:
 *  1. For aggregator orgs (AISafety.com, etc.) whose resources link to external
 *     sites, prefer the resource URL's domain favicon over the aggregator's logo.
 *  2. Check curated map for a known org → local file in /logos/
 *  3. Extract domain from the resource URL → Google favicon API (128px)
 *  4. Fall back to styled initials (handled by the OrgLogo component)
 *
 * Org names come from the `source_org` field in the database. For events/communities
 * synced from external sources (Meetup, Eventbrite, Luma), source_org is typically
 * the event organizer name — these fall through to the favicon fallback automatically.
 */

/** Curated org → logo file mapping (files in /public/logos/) */
const CURATED_LOGOS: Record<string, string> = {
  // AI safety orgs
  "PauseAI": "/logos/pauseai.png",
  "PauseAI (adjacent)": "/logos/pauseai.png",
  "80,000 Hours": "/logos/80000hours.png",
  "BlueDot Impact": "/logos/bluedot.png",
  "Future of Life Institute": "/logos/fli.png",
  "ControlAI": "/logos/controlai.png",
  "Encode": "/logos/encode.png",
  "EA Forum": "/logos/eaforum.png",
  "LessWrong": "/logos/lesswrong.png",
  "AISafety.com": "/logos/aisafety.png",
  "AI Safety": "/logos/aisafety.png",
  "AI Safety Info": "/logos/aisafetyinfo.png",
  "AI Safety Community": "/logos/aisafety.png",
  "Forethought": "/logos/forethought.png",
  "Forethought Foundation": "/logos/forethought.png",
  "AI Futures Project": "/logos/aifutures.png",
  "Dario Amodei": "/logos/anthropic.png",
  "Anthropic": "/logos/anthropic.png",
  "Superintelligence Statement": "/logos/superintelligence.png",
  "AI Statement": "/logos/aistatement.png",

  // Platforms (for synced events/communities)
  "Luma": "/logos/luma.png",
  "Meetup": "/logos/meetup.png",
  "Eventbrite": "/logos/eventbrite.png",
  "Discord": "/logos/discord.png",
  "Reddit": "/logos/reddit.png",
  "Telegram": "/logos/telegram.png",
  "Facebook": "/logos/facebook.png",
  "LinkedIn": "/logos/linkedin.png",
  "Slack": "/logos/slack.png",
  "Instagram": "/logos/instagram.png",
  "Substack": "/logos/substack.png",
  "Alignment Forum": "/logos/alignmentforum.png",
  "Google Groups": "/logos/eaforum.png",
};

/**
 * Org name → canonical domain, used as fallback when there's no curated logo
 * and the resource URL doesn't match the org's main domain.
 */
const ORG_DOMAINS: Record<string, string> = {
  "PauseAI": "pauseai.info",
  "80,000 Hours": "80000hours.org",
  "BlueDot Impact": "bluedot.org",
  "Future of Life Institute": "futureoflife.org",
  "ControlAI": "controlai.com",
  "Encode": "encodeai.org",
  "EA Forum": "effectivealtruism.org",
  "LessWrong": "lesswrong.com",
  "AISafety.com": "aisafety.com",
  "AI Safety": "aisafety.com",
  "AI Safety Info": "aisafety.info",
  "AI Safety Community": "aisafety.com",
  "Forethought": "forethought.org",
  "Forethought Foundation": "forethought.org",
  "AI Futures Project": "ai-2027.com",
  "Dario Amodei": "anthropic.com",
  "Anthropic": "anthropic.com",
  "Superintelligence Statement": "superintelligence-statement.org",
  "AI Statement": "aistatement.com",
  "Luma": "lu.ma",
  "Meetup": "meetup.com",
  "Eventbrite": "eventbrite.com",
};

/**
 * Aggregator orgs — these are listing sites that scrape/curate resources from
 * many different organizations. When a resource's URL points to a different
 * domain than the aggregator, we prefer the resource URL's favicon and derive
 * a display name from the URL domain instead.
 */
const AGGREGATOR_DOMAINS: Record<string, string> = {
  "AISafety.com": "aisafety.com",
  "AI Safety": "aisafety.com",
  "AI Safety Community": "aisafety.com",
};

/**
 * Display name overrides. When an org's database name is too long or awkward,
 * map it to a cleaner display name. Returns the original if no override exists.
 */
const DISPLAY_NAMES: Record<string, string> = {
  "Forethought Foundation": "Forethought",
  "Future of Life Institute": "FLI",
  "PauseAI (adjacent)": "PauseAI",
  "AI Safety Community": "AI Safety",
};

/** Extract domain from a URL string */
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Turn a domain into a readable name: "mats.fai.org" → "MATS" or "aisafetyfundamentals.com" → "aisafetyfundamentals.com" */
function domainToName(domain: string): string {
  // Remove common TLDs and www prefix, keep the meaningful part
  const name = domain
    .replace(/\.(com|org|net|io|info|ai|fyi|dev|co)$/i, "")
    .replace(/\./g, " ");
  // If the cleaned name is very short (like a subdomain), just use the full domain
  if (name.length <= 2) return domain;
  // Capitalize each word
  return name
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Check if a source_org is an aggregator and the resource URL points elsewhere.
 * Returns the external domain if so, null otherwise.
 */
function getExternalDomain(sourceOrg: string, resourceUrl?: string): string | null {
  const aggregatorDomain = AGGREGATOR_DOMAINS[sourceOrg];
  if (!aggregatorDomain || !resourceUrl) return null;

  const urlDomain = extractDomain(resourceUrl);
  if (!urlDomain) return null;

  // If the URL points to a different domain than the aggregator, it's external
  if (urlDomain !== aggregatorDomain && !urlDomain.endsWith(`.${aggregatorDomain}`)) {
    return urlDomain;
  }

  return null;
}

/** Get the display name for an org (cleaned up version of source_org) */
export function getOrgDisplayName(sourceOrg: string, resourceUrl?: string): string {
  // For aggregators linking to external sites, derive name from the URL domain
  const extDomain = getExternalDomain(sourceOrg, resourceUrl);
  if (extDomain) {
    return domainToName(extDomain);
  }

  return DISPLAY_NAMES[sourceOrg] ?? sourceOrg;
}

/** Get the Google Favicon API URL for a domain */
function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/**
 * Resolve the best logo URL for an organization.
 * Returns { src, isCurated } so the component can decide on styling.
 */
export function getOrgLogoUrl(
  sourceOrg: string,
  resourceUrl?: string
): { src: string; isCurated: boolean } {
  // 0. For aggregators linking to external sites, use the external site's favicon
  const extDomain = getExternalDomain(sourceOrg, resourceUrl);
  if (extDomain) {
    return { src: faviconUrl(extDomain), isCurated: false };
  }

  // 1. Check curated map
  const curated = CURATED_LOGOS[sourceOrg];
  if (curated) {
    return { src: curated, isCurated: true };
  }

  // 2. Resolve domain and use favicon API
  const orgDomain = ORG_DOMAINS[sourceOrg];
  if (orgDomain) {
    return { src: faviconUrl(orgDomain), isCurated: false };
  }

  // 3. Extract domain from resource URL
  if (resourceUrl) {
    const domain = extractDomain(resourceUrl);
    if (domain) {
      return { src: faviconUrl(domain), isCurated: false };
    }
  }

  // 4. No logo available — component will render initials
  return { src: "", isCurated: false };
}

/** Get 1-2 character initials from an org name */
export function getOrgInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

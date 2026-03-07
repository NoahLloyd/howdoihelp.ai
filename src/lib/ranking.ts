import {
  Resource,
  ScoredResource,
  LocalCard,
  UserAnswers,
  GeoData,
  Variant,
  TimeCommitment,
  IntentTag,
  ResourceCategory,
  PositionTag,
  ProfilePlatform,
} from "@/types";

// ─── Time Budgets ───────────────────────────────────────────

const TIME_BUDGETS: Record<TimeCommitment, number> = {
  minutes: 15,
  hours: 240,
  significant: Infinity,
};

const FRICTION_SENSITIVITY: Record<TimeCommitment, number> = {
  minutes: 0.8,
  hours: 0.4,
  significant: 0.1,
};

// ─── Intent → Category mapping ──────────────────────────────

const INTENT_TO_CATEGORIES: Record<IntentTag, ResourceCategory[]> = {
  understand: ["programs", "other"],
  connect: ["communities", "events"],
  impact: ["letters", "other"],
  do_part: ["letters", "other", "events"],
};

// ─── Similarity weights ─────────────────────────────────────

const SIM_WEIGHTS = {
  category: 0.35,
  source_org: 0.25,
  time_bucket: 0.20,
  location: 0.20,
};

// ─── Location matching ──────────────────────────────────────

// City aliases for metro areas where location strings vary widely
const CITY_ALIASES: Record<string, string[]> = {
  "san francisco": ["sf", "bay area", "silicon valley", "oakland", "berkeley", "palo alto", "san jose", "mountain view", "sunnyvale"],
  "new york": ["nyc", "manhattan", "brooklyn", "queens"],
  "london": ["uk", "united kingdom"],
  "los angeles": ["la", "santa monica", "pasadena"],
  "washington": ["dc", "d.c.", "arlington"],
};

function locationFit(resource: Resource, geo: GeoData): number {
  // Suppress letters in authoritarian countries
  if (geo.isAuthoritarian && resource.category === "letters") {
    return 0.0;
  }

  const loc = resource.location.toLowerCase();

  // Global/Online → available everywhere
  if (loc === "global" || loc === "online" || loc === "") return 1.0;

  // City match (exact + aliases) → strongest signal
  if (geo.city) {
    const city = geo.city.toLowerCase();
    if (loc.includes(city)) return 1.4;

    // Check aliases for the user's city
    const aliases = CITY_ALIASES[city];
    if (aliases && aliases.some((a) => loc.includes(a))) return 1.4;
  }

  // Region/state match
  if (geo.region && loc.includes(geo.region.toLowerCase())) {
    return 1.3;
  }

  // Country match - use full name (more reliable than 2-letter codes which
  // can false-match as substrings, e.g. "us" in "Houston")
  const countryName = geo.country.toLowerCase();
  if (countryName !== "unknown" && loc.includes(countryName)) {
    return 1.2;
  }

  // Country code - only match when it appears as a standalone token
  // (e.g. "Berlin, DE" but not "Houston, US" matching "us" in "Houston")
  const countryCode = geo.countryCode.toLowerCase();
  if (countryCode !== "xx" && countryCode.length === 2) {
    const codePattern = new RegExp(`\\b${countryCode}\\b`);
    if (codePattern.test(loc)) return 1.2;
  }

  // Location-specific but doesn't match - still show, just reduced
  return 0.3;
}

// ─── Scoring ────────────────────────────────────────────────

function timeFit(resource: Resource, time: TimeCommitment): number {
  const budget = TIME_BUDGETS[time];
  if (resource.min_minutes <= budget) return 1.0;
  if (resource.min_minutes <= budget * 2) return 0.5;
  return 0.1;
}

function typeFit(
  resource: Resource,
  variant: Variant,
  answers: UserAnswers
): number {
  // Variant A (Profile) and B (Browse) don't have intent answers
  if (variant === "A" || variant === "B") return 1.0;

  // Variant C (Guided) uses the intent answer for category boosting
  if (variant === "C" && answers.intent) {
    const cats = INTENT_TO_CATEGORIES[answers.intent];
    return cats.includes(resource.category) ? 1.3 : 0.7;
  }

  return 1.0;
}

function deadlineBoost(resource: Resource): number {
  if (!resource.deadline_date) return 1.0;

  const daysUntil = Math.ceil(
    (new Date(resource.deadline_date).getTime() - Date.now()) / 86_400_000
  );

  if (daysUntil < 0) return 0.0;
  if (daysUntil <= 14) return 1.5;
  if (daysUntil <= 30) return 1.2;
  return 1.0;
}

function positionFit(resource: Resource, positionType?: PositionTag): number {
  if (!positionType) return 1.0;
  const tags = resource.position_tags || [];
  if (tags.includes(positionType)) return 1.5;
  const bgTags = resource.background_tags || [];
  if (bgTags.includes(positionType)) return 1.3;
  return 0.8;
}

// ─── Profile Platform → Position Tag mapping ────────────────

const PROFILE_POSITION_HINTS: Partial<Record<ProfilePlatform, PositionTag>> = {
  github: "ai_tech",
  x: "audience_platform",
  instagram: "audience_platform",
  personal_website: "audience_platform",
};

function profileFit(resource: Resource, profilePlatform?: ProfilePlatform): number {
  if (!profilePlatform) return 1.0;
  const hintedPosition = PROFILE_POSITION_HINTS[profilePlatform];
  if (!hintedPosition) return 1.0; // linkedin, facebook, other - no signal yet
  const tags = resource.position_tags || [];
  if (tags.includes(hintedPosition)) return 1.2;
  return 1.0;
}

function activityFit(resource: Resource): number {
  // activity_score is 0–1, only set on communities/events from verification.
  // If not set, assume decent quality.
  const score = resource.activity_score;
  if (score == null) return 1.0;
  // Anything below 0.2 is basically dead - hard zero, should never appear
  if (score < 0.2) return 0;
  // Scale so 0.2→0.4, 0.5→0.7, 1.0→1.0
  return 0.2 + score * 0.8;
}

export function scoreResource(
  resource: Resource,
  answers: UserAnswers,
  geo: GeoData,
  variant: Variant
): ScoredResource {
  if (!resource.enabled) {
    return { resource, score: 0, matchReasons: [] };
  }

  const tf = timeFit(resource, answers.time);
  const tyf = typeFit(resource, variant, answers);
  const lf = locationFit(resource, geo);
  const pf = positionFit(resource, answers.positionType);
  const af = activityFit(resource);
  const prof = profileFit(resource, answers.profilePlatform);

  // Hard kill: dead communities/events never show
  if (af === 0) return { resource, score: 0, matchReasons: [] };

  // Use ev_positioned when user is positioned and resource has it
  const ev = (answers.positioned && resource.ev_positioned != null)
    ? resource.ev_positioned
    : resource.ev_general;

  const frictionPenalty = 1 - resource.friction * FRICTION_SENSITIVITY[answers.time];
  const dl = deadlineBoost(resource);

  const score = tf * tyf * lf * pf * af * prof * ev * Math.max(frictionPenalty, 0.05) * dl;

  const matchReasons: string[] = [];
  if (lf > 1.0) matchReasons.push("Near you");
  if (dl > 1.0) matchReasons.push("Deadline approaching");
  if (pf > 1.0) matchReasons.push("Relevant to your background");

  return { resource, score, matchReasons };
}

// ─── Similarity & Diversified Selection ─────────────────────

function timeBucket(minutes: number): string {
  if (minutes <= 5) return "instant";
  if (minutes <= 30) return "quick";
  if (minutes <= 120) return "session";
  return "deep";
}

function similarity(a: Resource, b: Resource): number {
  let sim = 0;
  if (a.category === b.category) sim += SIM_WEIGHTS.category;
  if (a.source_org === b.source_org) sim += SIM_WEIGHTS.source_org;
  if (timeBucket(a.min_minutes) === timeBucket(b.min_minutes))
    sim += SIM_WEIGHTS.time_bucket;
  if (a.location === b.location) sim += SIM_WEIGHTS.location;
  return sim;
}

const MIN_SCORE_THRESHOLD = 0.15;
const SIMILARITY_PENALTY = 0.6;

// ─── Helpers ────────────────────────────────────────────────

/** True if the resource is a community or event */
function isLocalCategory(r: Resource): boolean {
  return r.category === "communities" || r.category === "events";
}

// ─── Remoteness Bonus ────────────────────────────────────────

/**
 * Compute a multiplier based on how few local resources the user has.
 * Fewer nearby events/communities → higher bonus (the local card matters more).
 */
function remotenessBonus(resources: Resource[], geo: GeoData): number {
  const nearbyCount = resources.filter(
    (r) => isLocalCategory(r) && r.enabled && locationFit(r, geo) > 1.0
  ).length;

  // Only boost remote users - never penalize hubs.
  // Since there's only ever one local card, there's no flooding risk.
  if (nearbyCount === 0) return 1.4;
  if (nearbyCount <= 2) return 1.2;
  return 1.0;
}

// ─── Main Export ─────────────────────────────────────────────

/**
 * Rank non-local resources (letters, programs, other).
 * Events and communities are excluded - they go into the local card instead.
 */
export function rankResources(
  resources: Resource[],
  answers: UserAnswers,
  geo: GeoData,
  variant: Variant,
  maxResults: number = 6,
  minResults: number = 3
): ScoredResource[] {
  // Only score non-local categories for the main list
  const scored = resources
    .filter((r) => !isLocalCategory(r))
    .map((r) => scoreResource(r, answers, geo, variant));

  const regularPool = scored.filter(
    (s) => s.score > MIN_SCORE_THRESHOLD
  );

  const selected: ScoredResource[] = [];
  const remaining = [...regularPool].sort((a, b) => b.score - a.score);

  while (selected.length < maxResults && remaining.length > 0) {
    const best = remaining.shift()!;
    if (selected.length >= minResults && best.score < MIN_SCORE_THRESHOLD) break;
    selected.push(best);

    for (const item of remaining) {
      const sim = similarity(best.resource, item.resource);
      if (sim > 0) item.score *= 1 - sim * SIMILARITY_PENALTY;
    }
    remaining.sort((a, b) => b.score - a.score);
  }

  return selected;
}

/**
 * Build a single collapsed "local card" from all nearby events + communities.
 *
 * - The best nearby event or community becomes the anchor (events preferred).
 * - A remoteness bonus scales the card's score - users in remote areas get a boost.
 * - Remaining items that pass the threshold become expandable extras.
 * - Returns null if nothing nearby passes the threshold.
 */
export function buildLocalCard(
  resources: Resource[],
  answers: UserAnswers,
  geo: GeoData,
  variant: Variant,
  maxExtras: number = 6,
): LocalCard | null {
  // Only consider events/communities that are actually near the user
  // (city, region, or country match - locationFit > 1.0).
  // Global/online resources and anything far away are never shown here.
  const scored = resources
    .filter((r) =>
      isLocalCategory(r) &&
      r.enabled &&
      locationFit(r, geo) > 1.0
    )
    .map((r) => scoreResource(r, answers, geo, variant))
    .filter((s) => s.score > MIN_SCORE_THRESHOLD);

  if (scored.length === 0) return null;

  // Sort: events first (preferred over communities), then by score
  scored.sort((a, b) => {
    const aIsEvent = a.resource.category === "events" ? 1 : 0;
    const bIsEvent = b.resource.category === "events" ? 1 : 0;
    if (bIsEvent !== aIsEvent) return bIsEvent - aIsEvent;
    return b.score - a.score;
  });

  const anchor = scored[0];
  const extras = scored.slice(1, 1 + maxExtras);
  const bonus = remotenessBonus(resources, geo);

  return {
    anchor,
    extras,
    score: anchor.score * bonus,
  };
}

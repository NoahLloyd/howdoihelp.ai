import { posthog } from "./posthog";
import type {
  Variant,
  TimeCommitment,
  IntentTag,
  PositionTag,
  ProfilePlatform,
} from "@/types";
import { VARIANT_NAMES } from "@/types";

// ─── Helpers ────────────────────────────────────────────────

function variantProps(variant: Variant) {
  return { variant, variant_name: VARIANT_NAMES[variant] };
}

// ─── Funnel Events ──────────────────────────────────────────

/** User started the funnel (landed on the home page). */
export function trackFunnelStarted(variant: Variant) {
  posthog.capture("funnel_started", variantProps(variant));
}

/** Variant was assigned to user (fired once on first assignment). */
export function trackVariantAssigned(variant: Variant) {
  posthog.capture("variant_assigned", variantProps(variant));
}

// ─── Question Events ────────────────────────────────────────

/** User answered a question. */
export function trackQuestionAnswered(
  questionId: string,
  answer: string | string[],
  variant: Variant,
  questionIndex?: number,
  timeToAnswerMs?: number
) {
  posthog.capture("question_answered", {
    question_id: questionId,
    answer,
    ...variantProps(variant),
    question_index: questionIndex,
    time_to_answer_ms: timeToAnswerMs,
  });
}

/** User skipped/abandoned a question. */
export function trackQuestionSkipped(questionId: string, variant: Variant) {
  posthog.capture("question_skipped", {
    question_id: questionId,
    ...variantProps(variant),
  });
}

// ─── Profile Events (Variant A) ─────────────────────────────

/** User provided a profile link. */
export function trackProfileProvided(platform: ProfilePlatform, variant: Variant) {
  posthog.capture("profile_provided", {
    platform,
    ...variantProps(variant),
  });
  posthog.register({ has_profile: true });
}

/** User skipped the profile step. */
export function trackProfileSkipped(variant: Variant) {
  posthog.capture("profile_skipped", variantProps(variant));
  posthog.register({ has_profile: false });
}

// ─── Results Events ─────────────────────────────────────────

/** Results page loaded - user sees recommendations. */
export function trackResultsViewed(
  variant: Variant,
  time: TimeCommitment,
  intent?: IntentTag | IntentTag[],
  positioned?: boolean,
  positionType?: PositionTag,
  resultCount?: number,
  resultSource?: "algorithmic" | "claude_personalized" | "browse",
  timeToResultsMs?: number
) {
  posthog.capture("results_viewed", {
    ...variantProps(variant),
    time,
    intent,
    positioned: positioned || false,
    position_type: positionType,
    result_count: resultCount,
    result_source: resultSource || "algorithmic",
    time_to_results_ms: timeToResultsMs,
  });
}

/** User clicked a resource link (the conversion event). */
export function trackResourceClicked(
  resourceId: string,
  resourceTitle: string,
  category: string,
  variant: Variant,
  position: number,
  timeSinceResultsMs?: number
) {
  posthog.capture("resource_clicked", {
    resource_id: resourceId,
    resource_title: resourceTitle,
    category,
    ...variantProps(variant),
    position,
    time_since_results_ms: timeSinceResultsMs,
  });
}

/** User clicked "Start over". */
export function trackStartOver(variant: Variant) {
  posthog.capture("start_over", variantProps(variant));
}

/** User expanded the local card stack. */
export function trackStackExpanded(variant: Variant, extraCount: number) {
  posthog.capture("stack_expanded", { ...variantProps(variant), extra_count: extraCount });
}

// ─── Browse Events (Variant B) ──────────────────────────────

/** User changed a filter in browse mode. */
export function trackBrowseFilterUsed(
  variant: Variant,
  filterType: "category" | "time" | "sort",
  filterValue: string
) {
  posthog.capture("browse_filter_used", {
    ...variantProps(variant),
    filter_type: filterType,
    filter_value: filterValue,
  });
}

// ─── Engagement Events ──────────────────────────────────────

/** Track scroll depth milestones (25%, 50%, 75%, 100%). */
export function trackScrollDepth(variant: Variant, depth: number) {
  posthog.capture("scroll_depth", {
    ...variantProps(variant),
    depth_percent: depth,
  });
}

/** Track time from results load to first resource click. */
export function trackTimeToFirstClick(variant: Variant, ms: number) {
  posthog.capture("time_to_first_click", {
    ...variantProps(variant),
    time_ms: ms,
  });
}

// ─── Voice Mode Events ──────────────────────────────────────

/** User pressed the mic button to begin recording. */
export function trackVoiceStarted(variant: Variant, surface: "profile" | "position") {
  posthog.capture("voice_started", {
    ...variantProps(variant),
    surface,
  });
}

/** Voice recording was successfully transcribed. */
export function trackVoiceTranscribed(
  variant: Variant,
  surface: "profile" | "position",
  charCount: number,
  durationMs: number
) {
  posthog.capture("voice_transcribed", {
    ...variantProps(variant),
    surface,
    char_count: charCount,
    duration_ms: durationMs,
  });
}

/** Voice mode failed (permission, transcription, network, etc.). */
export function trackVoiceError(
  variant: Variant,
  surface: "profile" | "position",
  reason: string
) {
  posthog.capture("voice_error", {
    ...variantProps(variant),
    surface,
    reason,
  });
}

// ─── Super Properties ───────────────────────────────────────

/** Set user properties that persist across sessions. */
export function identifyVariant(variant: Variant) {
  posthog.register({
    variant,
    variant_name: VARIANT_NAMES[variant],
  });
}

/** User landed via an affiliate/creator referral link. */
export function trackReferralLanded(ref: string) {
  posthog.register({ ref });
  posthog.capture("referral_landed", { ref });
}

/** Register geo data as a super property. */
export function identifyGeo(countryCode: string) {
  posthog.register({ geo_country: countryCode });
}

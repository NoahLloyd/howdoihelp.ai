import { posthog } from "./posthog";
import type { Variant, TimeCommitment, IntentTag, PositionTag, ProfilePlatform } from "@/types";

/**
 * Track a pageview with the current URL and optional properties.
 * Call this in useEffect on each page.
 */
export function trackPageView(properties?: Record<string, unknown>) {
  posthog.capture("$pageview", properties);
}

/**
 * User started the funnel (landed on the home page).
 */
export function trackFunnelStarted(variant: Variant) {
  posthog.capture("funnel_started", { variant });
}

/**
 * User answered a question.
 */
export function trackQuestionAnswered(
  questionId: string,
  answer: string | string[],
  variant: Variant
) {
  posthog.capture("question_answered", {
    question_id: questionId,
    answer,
    variant,
  });
}

/**
 * User skipped or abandoned a question (navigated away).
 * Best-effort — call on unmount if the question wasn't answered.
 */
export function trackQuestionSkipped(questionId: string, variant: Variant) {
  posthog.capture("question_skipped", {
    question_id: questionId,
    variant,
  });
}

/**
 * Results page loaded — user sees their recommendations.
 */
export function trackResultsViewed(
  variant: Variant,
  time: TimeCommitment,
  intent?: IntentTag | IntentTag[],
  positioned?: boolean,
  positionType?: PositionTag,
  resultCount?: number
) {
  posthog.capture("results_viewed", {
    variant,
    time,
    intent,
    positioned: positioned || false,
    position_type: positionType,
    result_count: resultCount,
  });
}

/**
 * User clicked a resource link (the conversion event).
 */
export function trackResourceClicked(
  resourceId: string,
  resourceTitle: string,
  category: string,
  variant: Variant,
  position: number // 0 = primary, 1+ = secondary
) {
  posthog.capture("resource_clicked", {
    resource_id: resourceId,
    resource_title: resourceTitle,
    category,
    variant,
    position,
  });
}

/**
 * User clicked "Start over" — restarting the funnel.
 */
export function trackStartOver(variant: Variant) {
  posthog.capture("start_over", { variant });
}

/**
 * User expanded the "more communities/events" stack.
 */
export function trackStackExpanded(variant: Variant, extraCount: number) {
  posthog.capture("stack_expanded", { variant, extra_count: extraCount });
}

/**
 * Set user properties that persist across sessions.
 * Call once when we know the variant.
 */
export function identifyVariant(variant: Variant) {
  posthog.register({ variant });
}

/**
 * User provided a profile link on the optional profile step.
 */
export function trackProfileProvided(platform: ProfilePlatform, variant: Variant) {
  posthog.capture("profile_provided", { platform, variant });
}

/**
 * User skipped the optional profile step.
 */
export function trackProfileSkipped(variant: Variant) {
  posthog.capture("profile_skipped", { variant });
}

/**
 * User landed via an affiliate/creator referral link (e.g. /rob).
 * Registers the ref as a super property so it sticks to every event.
 */
export function trackReferralLanded(ref: string) {
  posthog.register({ ref });
  posthog.capture("referral_landed", { ref });
}

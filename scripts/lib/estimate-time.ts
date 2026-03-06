/**
 * Estimate min_minutes for a resource based on its type and metadata.
 *
 * Used by all pipelines (event evaluator, sync scripts, program evaluator)
 * to assign reasonable time estimates instead of blanket defaults.
 */

// ─── Events ──────────────────────────────────────────────────

const EVENT_TIME_BY_TYPE: Record<string, number> = {
  meetup: 120,      // 2 hours
  social: 120,      // 2 hours
  talk: 90,         // 1.5 hours
  workshop: 240,    // 4 hours (half day)
  conference: 480,  // full day
  hackathon: 480,   // full day
  retreat: 1440,    // multi-day
  other: 120,       // default to meetup
};

// Program-like event types get much larger estimates
const PROGRAM_EVENT_TIME_BY_TYPE: Record<string, number> = {
  course: 1800,      // multi-week course (~30 hours)
  fellowship: 19200, // multi-month fellowship (~2 months)
  program: 9600,     // structured program (~8 weeks)
};

/**
 * Estimate min_minutes for an event based on event_type and dates.
 *
 * If start and end dates are available, uses them to improve the estimate
 * for multi-day events (conferences, retreats, workshops).
 */
export function estimateEventMinutes(
  eventType: string,
  startDate?: string | null,
  endDate?: string | null,
): number {
  // Check program-like types first
  const programTime = PROGRAM_EVENT_TIME_BY_TYPE[eventType];
  if (programTime) return programTime;

  const baseTime = EVENT_TIME_BY_TYPE[eventType] || EVENT_TIME_BY_TYPE.other;

  // If we have both dates, compute actual duration for multi-day events
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    if (days > 1) {
      // Multi-day: assume ~8 productive hours per day
      return days * 480;
    }
  }

  return baseTime;
}

// ─── Programs ────────────────────────────────────────────────

const PROGRAM_TIME_BY_TYPE: Record<string, number> = {
  intensive: 2400,    // ~1 week intensive bootcamp (40 hours)
  "self-paced": 1800, // multi-week part-time course (~30 hours)
  "part-time": 1500,  // part-time course (~25 hours)
  fellowship: 19200,  // multi-month fellowship (~2 months)
};

/**
 * Estimate min_minutes for a program based on course_type and duration metadata.
 *
 * Priority:
 *   1. duration_hours from the source (e.g. BlueDot provides this)
 *   2. Infer from start/end dates
 *   3. Fall back to course_type defaults
 */
export function estimateProgramMinutes(
  courseType?: string,
  durationHours?: number | null,
  startDate?: string | null,
  endDate?: string | null,
): number {
  // Best case: source provides explicit duration
  if (durationHours && durationHours > 0) {
    return Math.round(durationHours * 60);
  }

  // If we have start and end dates, compute total weeks and estimate
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const weeks = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7)));

    if (weeks <= 2) {
      // Short intensive: assume 8 hrs/day × 5 days per week
      return weeks * 2400;
    }
    // Multi-week: assume ~5 hrs/week for part-time, ~20 hrs/week for full-time
    const isFullTime = courseType === "fellowship" || courseType === "intensive";
    return weeks * (isFullTime ? 20 : 5) * 60;
  }

  return PROGRAM_TIME_BY_TYPE[courseType || "self-paced"] || 1800;
}

// ─── Communities ─────────────────────────────────────────────

/**
 * Communities always get 5 minutes (time to join/sign up).
 */
export function estimateCommunityMinutes(): number {
  return 5;
}

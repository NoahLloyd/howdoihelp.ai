"use server";

import { createAuthClient } from "@/lib/supabase-server";

const POSTHOG_BASE = "https://us.posthog.com/api/environments/326697";

async function getPersonalApiKey(): Promise<string> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) throw new Error("POSTHOG_PERSONAL_API_KEY not set");
  return key;
}

async function getCreatorSlug(): Promise<string | null> {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("creator_pages")
    .select("slug")
    .eq("creator_id", user.id)
    .single();

  return data?.slug || null;
}

async function posthogQuery(query: string): Promise<Record<string, unknown>> {
  const apiKey = await getPersonalApiKey();
  const res = await fetch(`${POSTHOG_BASE}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    next: { revalidate: 300 }, // cache 5 min
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog query failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ─── Public API ──────────────────────────────────────────────

export interface AnalyticsData {
  slug: string | null;
  overview: {
    totalPageviews: number;
    uniqueVisitors: number;
    totalFunnelStarts: number;
    totalResultsViewed: number;
    totalResourceClicks: number;
    conversionRate: number;
  };
  dailyVisitors: { date: string; visitors: number; pageviews: number }[];
  funnel: { step: string; count: number; rate: number }[];
  topResources: { title: string; clicks: number }[];
  referralSources: { source: string; count: number }[];
  deviceBreakdown: { device: string; count: number }[];
  countryBreakdown: { country: string; count: number }[];
  dailyClicks: { date: string; clicks: number }[];
  questionDropoff: { question: string; answered: number; skipped: number }[];
}

export type AnalyticsResult =
  | { success: true; data: AnalyticsData }
  | { success: false; error: string };

export async function getAnalyticsData(
  dateRange: string = "30d"
): Promise<AnalyticsResult> {
  try {
    return { success: true, data: await fetchAnalyticsData(dateRange) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message.includes("POSTHOG_PERSONAL_API_KEY")
        ? "Add your PostHog personal API key to .env.local as POSTHOG_PERSONAL_API_KEY to enable analytics."
        : message,
    };
  }
}

async function fetchAnalyticsData(
  dateRange: string = "30d"
): Promise<AnalyticsData> {
  const slug = await getCreatorSlug();

  const dateFilter = `timestamp >= now() - interval ${dateRange}`;

  // Build slug filter for events — creator pages fire events with ref={slug}
  // and pageviews happen on /{slug} path
  const slugPageFilter = slug
    ? `and properties.$current_url LIKE '%/${slug}%'`
    : "";
  const slugRefFilter = slug
    ? `and properties.ref = '${slug}'`
    : "";

  // Run all queries in parallel
  const [
    overviewRes,
    dailyRes,
    funnelRes,
    topResourcesRes,
    referralRes,
    deviceRes,
    countryRes,
    dailyClicksRes,
    questionRes,
  ] = await Promise.all([
    // 1. Overview stats
    posthogQuery(`
      SELECT
        countIf(event = '$pageview') as pageviews,
        uniqIf(distinct_id, event = '$pageview') as unique_visitors,
        countIf(event = 'funnel_started') as funnel_starts,
        countIf(event = 'results_viewed') as results_viewed,
        countIf(event = 'resource_clicked') as resource_clicks
      FROM events
      WHERE ${dateFilter} ${slugPageFilter}
    `),

    // 2. Daily visitors
    posthogQuery(`
      SELECT
        toDate(timestamp) as day,
        uniq(distinct_id) as visitors,
        count() as pageviews
      FROM events
      WHERE event = '$pageview' AND ${dateFilter} ${slugPageFilter}
      GROUP BY day
      ORDER BY day
    `),

    // 3. Funnel counts
    posthogQuery(`
      SELECT
        countIf(event = 'funnel_started') as started,
        countIf(event = 'question_answered') as questions,
        countIf(event = 'results_viewed') as results,
        countIf(event = 'resource_clicked') as clicks
      FROM events
      WHERE ${dateFilter} ${slugPageFilter}
    `),

    // 4. Top resources clicked
    posthogQuery(`
      SELECT
        properties.resource_title as title,
        count() as clicks
      FROM events
      WHERE event = 'resource_clicked' AND ${dateFilter} ${slugPageFilter}
      GROUP BY title
      ORDER BY clicks DESC
      LIMIT 10
    `),

    // 5. Referral sources
    posthogQuery(`
      SELECT
        properties.$referring_domain as source,
        count() as cnt
      FROM events
      WHERE event = '$pageview' AND ${dateFilter} ${slugPageFilter}
        AND properties.$referring_domain != ''
        AND properties.$referring_domain IS NOT NULL
      GROUP BY source
      ORDER BY cnt DESC
      LIMIT 10
    `),

    // 6. Device breakdown
    posthogQuery(`
      SELECT
        properties.$device_type as device,
        uniq(distinct_id) as cnt
      FROM events
      WHERE event = '$pageview' AND ${dateFilter} ${slugPageFilter}
      GROUP BY device
      ORDER BY cnt DESC
    `),

    // 7. Country breakdown
    posthogQuery(`
      SELECT
        properties.$geoip_country_name as country,
        uniq(distinct_id) as cnt
      FROM events
      WHERE event = '$pageview' AND ${dateFilter} ${slugPageFilter}
        AND country IS NOT NULL AND country != ''
      GROUP BY country
      ORDER BY cnt DESC
      LIMIT 10
    `),

    // 8. Daily resource clicks
    posthogQuery(`
      SELECT
        toDate(timestamp) as day,
        count() as clicks
      FROM events
      WHERE event = 'resource_clicked' AND ${dateFilter} ${slugPageFilter}
      GROUP BY day
      ORDER BY day
    `),

    // 9. Question answered vs skipped
    posthogQuery(`
      SELECT
        properties.question_id as question,
        countIf(event = 'question_answered') as answered,
        countIf(event = 'question_skipped') as skipped
      FROM events
      WHERE event IN ('question_answered', 'question_skipped')
        AND ${dateFilter} ${slugPageFilter}
      GROUP BY question
      ORDER BY answered DESC
      LIMIT 10
    `),
  ]);

  // Parse results helper
  function rows(res: Record<string, unknown>): unknown[][] {
    return (res as { results?: unknown[][] }).results || [];
  }

  // Parse overview
  const ov = rows(overviewRes)[0] || [0, 0, 0, 0, 0];
  const totalPageviews = Number(ov[0]) || 0;
  const uniqueVisitors = Number(ov[1]) || 0;
  const totalFunnelStarts = Number(ov[2]) || 0;
  const totalResultsViewed = Number(ov[3]) || 0;
  const totalResourceClicks = Number(ov[4]) || 0;
  const conversionRate =
    totalFunnelStarts > 0
      ? Math.round((totalResourceClicks / totalFunnelStarts) * 1000) / 10
      : 0;

  // Parse daily visitors
  const dailyVisitors = rows(dailyRes).map((r) => ({
    date: String(r[0]),
    visitors: Number(r[1]) || 0,
    pageviews: Number(r[2]) || 0,
  }));

  // Parse funnel
  const funnelRow = rows(funnelRes)[0] || [0, 0, 0, 0];
  const funnelSteps = [
    { step: "Funnel Started", count: Number(funnelRow[0]) || 0 },
    { step: "Questions Answered", count: Number(funnelRow[1]) || 0 },
    { step: "Results Viewed", count: Number(funnelRow[2]) || 0 },
    { step: "Resource Clicked", count: Number(funnelRow[3]) || 0 },
  ];
  const funnel = funnelSteps.map((s) => ({
    ...s,
    rate:
      funnelSteps[0].count > 0
        ? Math.round((s.count / funnelSteps[0].count) * 1000) / 10
        : 0,
  }));

  // Parse top resources
  const topResources = rows(topResourcesRes).map((r) => ({
    title: String(r[0] || "Unknown"),
    clicks: Number(r[1]) || 0,
  }));

  // Parse referral sources
  const referralSources = rows(referralRes).map((r) => ({
    source: String(r[0] || "Direct"),
    count: Number(r[1]) || 0,
  }));

  // Parse device breakdown
  const deviceBreakdown = rows(deviceRes).map((r) => ({
    device: String(r[0] || "Unknown"),
    count: Number(r[1]) || 0,
  }));

  // Parse country breakdown
  const countryBreakdown = rows(countryRes).map((r) => ({
    country: String(r[0] || "Unknown"),
    count: Number(r[1]) || 0,
  }));

  // Parse daily clicks
  const dailyClicks = rows(dailyClicksRes).map((r) => ({
    date: String(r[0]),
    clicks: Number(r[1]) || 0,
  }));

  // Parse question dropoff
  const questionDropoff = rows(questionRes).map((r) => ({
    question: String(r[0] || "Unknown"),
    answered: Number(r[1]) || 0,
    skipped: Number(r[2]) || 0,
  }));

  return {
    slug,
    overview: {
      totalPageviews,
      uniqueVisitors,
      totalFunnelStarts,
      totalResultsViewed,
      totalResourceClicks,
      conversionRate,
    },
    dailyVisitors,
    funnel,
    topResources,
    referralSources,
    deviceBreakdown,
    countryBreakdown,
    dailyClicks,
    questionDropoff,
  };
}

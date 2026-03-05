/**
 * Sets up PostHog dashboards and insights for howdoihelp.ai
 *
 * Usage: POSTHOG_PERSONAL_API_KEY=phx_... npx tsx scripts/setup-posthog-dashboards.ts
 */

const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const BASE = "https://us.posthog.com/api/environments/326697";

if (!API_KEY) {
  console.error("Set POSTHOG_PERSONAL_API_KEY env var");
  process.exit(1);
}

async function api(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────

function event(name: string, math?: string): Record<string, unknown> {
  return { kind: "EventsNode", event: name, name, ...(math ? { math } : {}) };
}

function trend(
  series: Record<string, unknown>[],
  opts: {
    dateRange?: string;
    display?: string;
    breakdown?: string;
    breakdownType?: string;
    interval?: string;
    formula?: string;
    showValues?: boolean;
  } = {}
): Record<string, unknown> {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      series,
      interval: opts.interval || "day",
      dateRange: { date_from: opts.dateRange || "-30d", explicitDate: false },
      trendsFilter: {
        display: opts.display || "ActionsLineGraph",
        showValuesOnSeries: opts.showValues ?? false,
        ...(opts.formula ? { formula: opts.formula } : {}),
      },
      breakdownFilter: opts.breakdown
        ? { breakdown: opts.breakdown, breakdown_type: opts.breakdownType || "event" }
        : { breakdown_type: "event" },
      filterTestAccounts: false,
    },
  };
}

function funnel(
  steps: Record<string, unknown>[],
  opts: {
    dateRange?: string;
    breakdown?: string;
    breakdownType?: string;
    layout?: string;
  } = {}
): Record<string, unknown> {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series: steps,
      dateRange: { date_from: opts.dateRange || "-30d", explicitDate: false },
      funnelsFilter: {
        funnelOrderType: "ordered",
        funnelVizType: "steps",
      },
      breakdownFilter: opts.breakdown
        ? { breakdown: opts.breakdown, breakdown_type: opts.breakdownType || "event" }
        : undefined,
      filterTestAccounts: false,
    },
  };
}

function table(
  series: Record<string, unknown>[],
  opts: {
    dateRange?: string;
    breakdown?: string;
    breakdownType?: string;
  } = {}
): Record<string, unknown> {
  return trend(series, { ...opts, display: "ActionsTable", showValues: true });
}

// ─── Dashboard creation ──────────────────────────────────────

interface InsightDef {
  name: string;
  description?: string;
  query: Record<string, unknown>;
}

async function createDashboard(name: string, description: string, insights: InsightDef[]) {
  console.log(`\nCreating dashboard: ${name}`);

  const dash = await api("/dashboards/", { name, description });
  const dashId = dash.id;
  console.log(`  Dashboard created: id=${dashId}`);

  for (const insight of insights) {
    try {
      const result = await api("/insights/", {
        name: insight.name,
        description: insight.description || "",
        query: insight.query,
        dashboards: [dashId],
      });
      console.log(`  + ${insight.name} (id=${result.id})`);
    } catch (err) {
      console.error(`  FAILED: ${insight.name}:`, (err as Error).message.slice(0, 200));
    }
  }

  return dashId;
}

// ─── Dashboard definitions ────────────────────────────────────

async function main() {
  console.log("Setting up PostHog dashboards for howdoihelp.ai\n");

  // ──────────────────────────────────────────────────────────
  // 1. VARIANT PERFORMANCE
  // ──────────────────────────────────────────────────────────
  await createDashboard(
    "Variant Performance",
    "Core A/B test metrics. Which variant converts best?",
    [
      {
        name: "Funnel: Started → Results → Clicked (by variant)",
        description: "The core conversion funnel, broken down by variant",
        query: funnel(
          [event("funnel_started"), event("results_viewed"), event("resource_clicked")],
          { breakdown: "variant", dateRange: "-30d" }
        ),
      },
      {
        name: "Conversion rate by variant (daily)",
        description: "resource_clicked / funnel_started per day, by variant",
        query: trend(
          [
            { ...event("resource_clicked"), math: "unique_session" },
          ],
          { breakdown: "variant", dateRange: "-30d", display: "ActionsLineGraph" }
        ),
      },
      {
        name: "Unique users by variant (daily)",
        description: "Daily unique visitors per variant",
        query: trend(
          [event("funnel_started", "dau")],
          { breakdown: "variant", dateRange: "-30d" }
        ),
      },
      {
        name: "Resources clicked per session (by variant)",
        description: "Average clicks per session across variants",
        query: trend(
          [{ ...event("resource_clicked"), math: "unique_session" }],
          { breakdown: "variant", dateRange: "-30d", display: "ActionsBarValue" }
        ),
      },
      {
        name: "Time to results (by variant)",
        description: "Distribution of time_to_results_ms property on results_viewed",
        query: trend(
          [{
            ...event("results_viewed"),
            math: "avg",
            math_property: "time_to_results_ms",
          }],
          { breakdown: "variant", dateRange: "-30d", display: "ActionsBarValue" }
        ),
      },
      {
        name: "Result source breakdown (by variant)",
        description: "algorithmic vs claude_personalized vs browse",
        query: trend(
          [event("results_viewed", "total")],
          { breakdown: "result_source", dateRange: "-30d", display: "ActionsPie" }
        ),
      },
    ]
  );

  // ──────────────────────────────────────────────────────────
  // 2. FUNNEL DROPOFF
  // ──────────────────────────────────────────────────────────
  await createDashboard(
    "Funnel Dropoff",
    "Where does each variant lose people?",
    [
      {
        name: "Variant A: Profile flow",
        description: "started → profile_provided → results_viewed → resource_clicked",
        query: funnel(
          [
            event("funnel_started"),
            event("profile_provided"),
            event("results_viewed"),
            event("resource_clicked"),
          ],
          {
            dateRange: "-30d",
            layout: "horizontal",
          }
        ),
      },
      {
        name: "Variant A: Profile skip rate",
        description: "How often do people skip the profile step?",
        query: funnel(
          [
            event("funnel_started"),
            event("profile_skipped"),
          ],
          { dateRange: "-30d" }
        ),
      },
      {
        name: "Variant B: Browse flow",
        description: "started → results_viewed → browse_filter_used → resource_clicked",
        query: funnel(
          [
            event("funnel_started"),
            event("results_viewed"),
            event("browse_filter_used"),
            event("resource_clicked"),
          ],
          { dateRange: "-30d" }
        ),
      },
      {
        name: "Variant C: Guided flow",
        description: "started → question_answered → results_viewed → resource_clicked",
        query: funnel(
          [
            event("funnel_started"),
            event("question_answered"),
            event("results_viewed"),
            event("resource_clicked"),
          ],
          { dateRange: "-30d" }
        ),
      },
      {
        name: "Question skip rate",
        description: "How often are questions skipped vs answered?",
        query: trend(
          [
            event("question_answered", "total"),
            event("question_skipped", "total"),
          ],
          { dateRange: "-30d", display: "ActionsBarValue" }
        ),
      },
    ]
  );

  // ──────────────────────────────────────────────────────────
  // 3. CONTENT PERFORMANCE
  // ──────────────────────────────────────────────────────────
  await createDashboard(
    "Content Performance",
    "Which resources are getting clicked? Where in the list?",
    [
      {
        name: "Top clicked resources",
        description: "Resources ranked by total clicks",
        query: table(
          [event("resource_clicked", "total")],
          { breakdown: "resource_title", dateRange: "-30d" }
        ),
      },
      {
        name: "Clicks by resource category",
        description: "events, programs, letters, communities, other",
        query: trend(
          [event("resource_clicked", "total")],
          { breakdown: "category", dateRange: "-30d", display: "ActionsPie" }
        ),
      },
      {
        name: "Click-through by list position",
        description: "Do people click the #1 result way more than #5?",
        query: trend(
          [event("resource_clicked", "total")],
          { breakdown: "position", dateRange: "-30d", display: "ActionsBar" }
        ),
      },
      {
        name: "Resources clicked per day",
        description: "Daily volume of resource clicks",
        query: trend(
          [event("resource_clicked", "total")],
          { dateRange: "-30d" }
        ),
      },
      {
        name: "Stack expanded rate",
        description: "How often do people expand the local card stack?",
        query: trend(
          [event("stack_expanded", "total")],
          { dateRange: "-30d" }
        ),
      },
    ]
  );

  // ──────────────────────────────────────────────────────────
  // 4. ENGAGEMENT QUALITY
  // ──────────────────────────────────────────────────────────
  await createDashboard(
    "Engagement Quality",
    "How engaged are users? Scroll depth, time to click, session depth.",
    [
      {
        name: "Scroll depth distribution",
        description: "25% / 50% / 75% / 100% milestones",
        query: trend(
          [event("scroll_depth", "total")],
          { breakdown: "depth_percent", dateRange: "-30d", display: "ActionsBar" }
        ),
      },
      {
        name: "Avg time to first click (by variant)",
        description: "How quickly do users engage?",
        query: trend(
          [{
            ...event("time_to_first_click"),
            math: "avg",
            math_property: "time_ms",
          }],
          { breakdown: "variant", dateRange: "-30d", display: "ActionsBarValue" }
        ),
      },
      {
        name: "Browse filter usage",
        description: "Which filters are people using?",
        query: trend(
          [event("browse_filter_used", "total")],
          { breakdown: "filter_value", dateRange: "-30d", display: "ActionsBarValue" }
        ),
      },
      {
        name: "Page leave rate",
        description: "When do people leave?",
        query: trend(
          [event("$pageleave", "total")],
          { dateRange: "-30d" }
        ),
      },
      {
        name: "Pageviews over time",
        description: "Overall traffic trend",
        query: trend(
          [event("$pageview", "total")],
          { dateRange: "-30d" }
        ),
      },
      {
        name: "Unique visitors (DAU)",
        description: "Daily unique visitors",
        query: trend(
          [event("$pageview", "dau")],
          { dateRange: "-30d" }
        ),
      },
    ]
  );

  // ──────────────────────────────────────────────────────────
  // 5. PROFILE & PERSONALIZATION
  // ──────────────────────────────────────────────────────────
  await createDashboard(
    "Profile & Personalization",
    "Variant A specific: profile submission, platform, personalization impact.",
    [
      {
        name: "Profile provided vs skipped",
        description: "How many people submit a profile vs skip?",
        query: trend(
          [
            event("profile_provided", "total"),
            event("profile_skipped", "total"),
          ],
          { dateRange: "-30d", display: "ActionsBarValue" }
        ),
      },
      {
        name: "Profile platform breakdown",
        description: "LinkedIn vs GitHub vs X vs name search",
        query: trend(
          [event("profile_provided", "total")],
          { breakdown: "platform", dateRange: "-30d", display: "ActionsPie" }
        ),
      },
      {
        name: "Personalized vs algorithmic results → clicks",
        description: "Does Claude personalization lead to more clicks?",
        query: trend(
          [event("resource_clicked", "total")],
          { breakdown: "result_source", dateRange: "-30d", display: "ActionsBarValue" }
        ),
      },
      {
        name: "Profile funnel: provided → results → clicked",
        description: "Conversion rate for users who submit profiles",
        query: funnel(
          [
            event("profile_provided"),
            event("results_viewed"),
            event("resource_clicked"),
          ],
          { dateRange: "-30d" }
        ),
      },
    ]
  );

  // ──────────────────────────────────────────────────────────
  // 6. REFERRALS & GEO
  // ──────────────────────────────────────────────────────────
  await createDashboard(
    "Referrals & Geo",
    "Where are users coming from? Geographic and referral source breakdown.",
    [
      {
        name: "Referral sources",
        description: "Traffic by ref parameter",
        query: trend(
          [event("referral_landed", "total")],
          { breakdown: "ref", dateRange: "-30d", display: "ActionsBarValue" }
        ),
      },
      {
        name: "Traffic by country",
        description: "Users by geo_country super property",
        query: trend(
          [event("funnel_started", "dau")],
          {
            breakdown: "$geoip_country_code",
            breakdownType: "person",
            dateRange: "-30d",
            display: "WorldMap",
          }
        ),
      },
      {
        name: "Funnel started by country (table)",
        description: "Country-level breakdown of visitors",
        query: table(
          [event("funnel_started", "dau")],
          { breakdown: "$geoip_country_code", breakdownType: "person", dateRange: "-30d" }
        ),
      },
      {
        name: "Referral → click conversion",
        description: "Do referred users convert better?",
        query: funnel(
          [
            event("referral_landed"),
            event("results_viewed"),
            event("resource_clicked"),
          ],
          { dateRange: "-90d" }
        ),
      },
    ]
  );

  console.log("\nAll dashboards created! Check PostHog.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

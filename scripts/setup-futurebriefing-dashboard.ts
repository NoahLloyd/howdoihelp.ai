/**
 * Sets up a PostHog dashboard for the /futurebriefing link-in-bio page.
 *
 * Usage:
 *   POSTHOG_PERSONAL_API_KEY=phx_... npx tsx scripts/setup-futurebriefing-dashboard.ts
 *
 * Creates a "Future Briefing" dashboard with insights for:
 *   - Page traffic & unique visitors
 *   - Outbound click tracking (social, CTA buttons, post thumbnails)
 *   - Scroll engagement
 *   - UTM / referral source attribution
 *   - Content performance (which posts get clicked)
 *   - Device & geo breakdown
 */

const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const BASE = "https://us.posthog.com/api/environments/326697";

if (!API_KEY) {
  console.error(
    "Set POSTHOG_PERSONAL_API_KEY env var.\n" +
      "Get one from PostHog → Settings → Personal API Keys.\n\n" +
      "  POSTHOG_PERSONAL_API_KEY=phx_... npx tsx scripts/setup-futurebriefing-dashboard.ts"
  );
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

// ─── Query Builders ────────────────────────────────────────────

/** All futurebriefing events have page="futurebriefing" property */
const FB_FILTER = {
  type: "event",
  key: "page",
  value: ["futurebriefing"],
  operator: "exact",
};

/** Pageview filter for /futurebriefing path */
const FB_URL_FILTER = {
  type: "event",
  key: "$current_url",
  value: "futurebriefing",
  operator: "icontains",
};

function fbEvent(
  name: string,
  math?: string,
  extraProps?: Record<string, unknown>
): Record<string, unknown> {
  const isPageview = name === "$pageview" || name === "$pageleave";
  return {
    kind: "EventsNode",
    event: name,
    name,
    ...(math ? { math } : {}),
    properties: [isPageview ? FB_URL_FILTER : FB_FILTER],
    ...extraProps,
  };
}

function trend(
  series: Record<string, unknown>[],
  opts: {
    dateRange?: string;
    display?: string;
    breakdown?: string;
    breakdownType?: string;
    interval?: string;
    showValues?: boolean;
  } = {}
): Record<string, unknown> {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      series,
      interval: opts.interval || "day",
      dateRange: {
        date_from: opts.dateRange || "-30d",
        explicitDate: false,
      },
      trendsFilter: {
        display: opts.display || "ActionsLineGraph",
        showValuesOnSeries: opts.showValues ?? false,
      },
      breakdownFilter: opts.breakdown
        ? {
            breakdown: opts.breakdown,
            breakdown_type: opts.breakdownType || "event",
          }
        : { breakdown_type: "event" },
      filterTestAccounts: false,
    },
  };
}

function funnel(
  steps: Record<string, unknown>[],
  opts: { dateRange?: string } = {}
): Record<string, unknown> {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series: steps,
      dateRange: {
        date_from: opts.dateRange || "-30d",
        explicitDate: false,
      },
      funnelsFilter: {
        funnelOrderType: "ordered",
        funnelVizType: "steps",
      },
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
  return trend(series, {
    ...opts,
    display: "ActionsTable",
    showValues: true,
  });
}

// ─── Dashboard Creation ──────────────────────────────────────

interface InsightDef {
  name: string;
  description?: string;
  query: Record<string, unknown>;
}

async function createDashboard(
  name: string,
  description: string,
  insights: InsightDef[]
) {
  console.log(`\nCreating dashboard: ${name}`);
  const dash = await api("/dashboards/", { name, description });
  console.log(`  Dashboard id=${dash.id}`);

  for (const insight of insights) {
    try {
      const result = await api("/insights/", {
        name: insight.name,
        description: insight.description || "",
        query: insight.query,
        dashboards: [dash.id],
      });
      console.log(`  + ${insight.name} (id=${result.id})`);
    } catch (err) {
      console.error(
        `  FAILED: ${insight.name}:`,
        (err as Error).message.slice(0, 200)
      );
    }
  }

  return dash.id;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log("Setting up PostHog dashboard for /futurebriefing\n");

  await createDashboard(
    "Future Briefing — Link in Bio",
    "Analytics for the /futurebriefing link-in-bio page. Tracks traffic, outbound clicks, scroll engagement, and content performance.",
    [
      // ── Traffic ──────────────────────────────────────────
      {
        name: "FB: Daily pageviews",
        description: "Total pageviews on /futurebriefing per day",
        query: trend([fbEvent("$pageview", "total")], {
          dateRange: "-30d",
        }),
      },
      {
        name: "FB: Unique visitors (DAU)",
        description: "Daily unique visitors to /futurebriefing",
        query: trend([fbEvent("$pageview", "dau")], {
          dateRange: "-30d",
        }),
      },

      // ── Outbound Clicks ──────────────────────────────────
      {
        name: "FB: Total outbound clicks",
        description: "All clicks leading off-site (social, CTAs, posts)",
        query: trend([fbEvent("fb_outbound_click", "total")], {
          dateRange: "-30d",
        }),
      },
      {
        name: "FB: Clicks by type",
        description:
          "Breakdown: social / cta_button / post_thumbnail",
        query: trend([fbEvent("fb_outbound_click", "total")], {
          breakdown: "click_type",
          dateRange: "-30d",
          display: "ActionsPie",
        }),
      },
      {
        name: "FB: Top clicked links",
        description: "Which outbound links get the most clicks?",
        query: table([fbEvent("fb_outbound_click", "total")], {
          breakdown: "label",
          dateRange: "-30d",
        }),
      },
      {
        name: "FB: CTA button clicks",
        description: "Psst.org vs Find your representative",
        query: trend(
          [
            {
              ...fbEvent("fb_outbound_click", "total"),
              properties: [
                FB_FILTER,
                {
                  type: "event",
                  key: "click_type",
                  value: ["cta_button"],
                  operator: "exact",
                },
              ],
            },
          ],
          {
            breakdown: "label",
            dateRange: "-30d",
            display: "ActionsBarValue",
            showValues: true,
          }
        ),
      },
      {
        name: "FB: Post thumbnail clicks by position",
        description:
          "Which post positions get the most clicks? (0-indexed)",
        query: trend(
          [
            {
              ...fbEvent("fb_outbound_click", "total"),
              properties: [
                FB_FILTER,
                {
                  type: "event",
                  key: "click_type",
                  value: ["post_thumbnail"],
                  operator: "exact",
                },
              ],
            },
          ],
          {
            breakdown: "position",
            dateRange: "-30d",
            display: "ActionsBar",
          }
        ),
      },
      {
        name: "FB: Social link clicks",
        description: "Instagram vs TikTok vs LinkedIn",
        query: trend(
          [
            {
              ...fbEvent("fb_outbound_click", "total"),
              properties: [
                FB_FILTER,
                {
                  type: "event",
                  key: "click_type",
                  value: ["social"],
                  operator: "exact",
                },
              ],
            },
          ],
          {
            breakdown: "label",
            dateRange: "-30d",
            display: "ActionsBarValue",
            showValues: true,
          }
        ),
      },

      // ── Engagement Funnel ────────────────────────────────
      {
        name: "FB: View → Click funnel",
        description:
          "How many visitors actually click something?",
        query: funnel([
          fbEvent("fb_page_viewed"),
          fbEvent("fb_outbound_click"),
        ]),
      },
      {
        name: "FB: Scroll depth",
        description:
          "25% / 50% / 75% / 100% scroll milestones",
        query: trend([fbEvent("fb_scroll_depth", "total")], {
          breakdown: "depth_percent",
          dateRange: "-30d",
          display: "ActionsBar",
        }),
      },
      {
        name: "FB: Avg time to first click",
        description:
          "How long before visitors click an outbound link?",
        query: trend(
          [
            {
              ...fbEvent("fb_outbound_click"),
              math: "avg",
              math_property: "time_on_page_ms",
            },
          ],
          {
            dateRange: "-30d",
            display: "BoldNumber",
          }
        ),
      },

      // ── Attribution ──────────────────────────────────────
      {
        name: "FB: Traffic by UTM source",
        description:
          "Where are visitors coming from? (utm_source)",
        query: trend([fbEvent("fb_utm_landed", "total")], {
          breakdown: "utm_source",
          dateRange: "-30d",
          display: "ActionsBarValue",
          showValues: true,
        }),
      },
      {
        name: "FB: Traffic by UTM medium",
        description: "social / referral / organic / etc",
        query: trend([fbEvent("fb_utm_landed", "total")], {
          breakdown: "utm_medium",
          dateRange: "-30d",
          display: "ActionsPie",
        }),
      },
      {
        name: "FB: Referring domains",
        description: "Top referring domains to /futurebriefing",
        query: table([fbEvent("$pageview", "total")], {
          breakdown: "$referring_domain",
          dateRange: "-30d",
        }),
      },

      // ── Device & Geo ─────────────────────────────────────
      {
        name: "FB: Device breakdown",
        description: "Mobile vs Desktop vs Tablet",
        query: trend([fbEvent("$pageview", "dau")], {
          breakdown: "$device_type",
          dateRange: "-30d",
          display: "ActionsPie",
        }),
      },
      {
        name: "FB: Browser breakdown",
        description: "Chrome / Safari / Firefox / etc",
        query: trend([fbEvent("$pageview", "dau")], {
          breakdown: "$browser",
          dateRange: "-30d",
          display: "ActionsPie",
        }),
      },
    ]
  );

  console.log(
    "\nDashboard created! Open PostHog to view it."
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

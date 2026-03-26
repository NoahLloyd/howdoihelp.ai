"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { posthog } from "@/lib/posthog";
import { fetchResources } from "@/lib/data";
import { buildLocalCard } from "@/lib/ranking";
import { getGeoData } from "@/lib/geo";
import { ResourceCard } from "@/components/results/resource-card";
import { LocationPicker } from "@/components/results/location-picker";
import { OrgLogo } from "@/components/results/org-logo";
import { getOrgDisplayName } from "@/lib/org-logos";
import type { Resource, GeoData, LocalCard } from "@/types";

/** Map English city/country names to Danish for geo display */
const DANISH_GEO_NAMES: Record<string, string> = {
  "Copenhagen": "København",
  "Denmark": "Danmark",
};

function toDanishGeo(geo: GeoData): GeoData {
  return {
    ...geo,
    city: geo.city ? (DANISH_GEO_NAMES[geo.city] || geo.city) : geo.city,
    country: DANISH_GEO_NAMES[geo.country] || geo.country,
  };
}

/** Danish-friendly time formatter (no "hour" word) */
function formatTimeDa(minutes: number): string {
  if (minutes <= 2) return "2 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 2) return "~1 time";
  if (hours <= 40) return `${Math.round(hours)} timer`;
  const weeks = Math.round(hours / 20);
  if (weeks <= 8) return `${weeks} uger`;
  const months = Math.round(hours / 160);
  return months <= 1 ? "~1 måned" : `${months} måneder`;
}

// ─── Tracking ────────────────────────────────────────────────

function track(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, { page: "skolegang", source: "skolegang.dk", ...properties });
}

// ─── Static action cards ─────────────────────────────────────

const STATIC_ACTIONS = [
  {
    id: "ai2027",
    title: "Læs AI 2027",
    description: "En detaljeret tidslinje over, hvad der sandsynligvis sker med AI de næste par år.",
    href: "https://ai-2027.com/",
    org: "AI 2027",
    minutes: 60,
  },
  {
    id: "bluedot",
    title: "Tag et BlueDot-kursus",
    description: "Gratis onlinekurser om hvordan vi sikrer, at AI-udviklingen går godt for alle.",
    href: "https://course.bluedot.org/",
    org: "BlueDot Impact",
    minutes: 1200,
  },
  {
    id: "jobs",
    title: "Udforsk AI safety-jobs",
    description: "Et felt i hurtig vækst med stillinger inden for forskning, policy, kommunikation og meget mere.",
    href: "https://jobs.80000hours.org/?refinementList%5Btags_area%5D%5B0%5D=AI%20safety%20%26%20policy",
    org: "80,000 Hours",
    minutes: 10,
  },
  {
    id: "80k",
    title: "Læs 80,000 Hours om AI safety",
    description: "Det store billede: hvorfor det er et af de vigtigste problemer i verden, og hvad du kan gøre.",
    href: "https://80000hours.org/problem-profiles/artificial-intelligence/",
    org: "80,000 Hours",
    minutes: 30,
  },
];

// ─── Main Component ──────────────────────────────────────────

export function SkolegangLanding() {
  const [localCard, setLocalCard] = useState<LocalCard | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [allResources, setAllResources] = useState<Resource[] | null>(null);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const loadedAt = useRef(Date.now());
  const scrollMilestones = useRef(new Set<number>());

  // Load geo + resources on mount
  useEffect(() => {
    track("skolegang_page_viewed");
    posthog.register({ skolegang_visitor: true });

    // UTM tracking
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const [key, value] of params) {
      if (key.startsWith("utm_")) utm[key] = value;
    }
    if (Object.keys(utm).length > 0) {
      track("skolegang_utm_landed", utm);
    }

    async function init() {
      const [resources, geoData] = await Promise.all([
        fetchResources(),
        getGeoData(),
      ]);
      setAllResources(resources);
      const danishGeo = toDanishGeo(geoData);
      setGeo(danishGeo);

      const card = buildLocalCard(resources, { time: "significant" }, geoData, "C");
      setLocalCard(card);
      setCommunityLoading(false);
    }
    init();
  }, []);

  // Scroll depth tracking
  useEffect(() => {
    function onScroll() {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) return;
      const pct = Math.round((window.scrollY / scrollHeight) * 100);
      for (const milestone of [25, 50, 75, 100]) {
        if (pct >= milestone && !scrollMilestones.current.has(milestone)) {
          scrollMilestones.current.add(milestone);
          track("skolegang_scroll_depth", { depth_percent: milestone });
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLocationChange = useCallback(
    (newGeo: GeoData) => {
      const danishGeo = toDanishGeo(newGeo);
      setGeo(danishGeo);
      if (!allResources) return;
      const newCard = buildLocalCard(allResources, { time: "significant" }, newGeo, "C");
      setLocalCard(newCard);
      track("skolegang_location_changed", {
        city: newGeo.city,
        country: newGeo.country,
      });
    },
    [allResources]
  );

  const handleResourceClick = useCallback(
    (resourceId: string, title: string, actionId: string) => {
      track("skolegang_action_clicked", {
        action_id: actionId,
        resource_id: resourceId,
        resource_title: title,
        time_on_page_ms: Date.now() - loadedAt.current,
      });
    },
    []
  );

  const handleStaticClick = useCallback(
    (actionId: string, href: string) => {
      track("skolegang_action_clicked", {
        action_id: actionId,
        href,
        time_on_page_ms: Date.now() - loadedAt.current,
      });
    },
    []
  );

  return (
    <main className="min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            AI ændrer alt.
            <br />
            Her er hvad du kan gøre.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            AI-udviklingen accelererer, og eksperterne er bekymrede. Du behøver
            ikke en teknisk baggrund for at gøre en forskel. Der er konkrete
            ting du kan gøre allerede i dag.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="mt-8 flex flex-col gap-3">
          {/* 1. AI 2027 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <StaticActionCard
              action={STATIC_ACTIONS[0]}
              onClick={handleStaticClick}
            />
          </motion.div>

          {/* 2. BlueDot */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <StaticActionCard
              action={STATIC_ACTIONS[1]}
              onClick={handleStaticClick}
            />
          </motion.div>

          {/* 3. Community/events card with geo */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <CommunityCardGroup
              localCard={localCard}
              geo={geo}
              loading={communityLoading}
              expanded={expanded}
              onToggleExpand={() => {
                const next = !expanded;
                setExpanded(next);
                if (next) {
                  track("skolegang_communities_expanded", {
                    extra_count: localCard?.extras.length ?? 0,
                    time_on_page_ms: Date.now() - loadedAt.current,
                  });
                }
              }}
              onLocationChange={handleLocationChange}
              onResourceClick={(id, title) => handleResourceClick(id, title, "community")}
            />
          </motion.div>

          {/* 4-5. Jobs + 80k */}
          {STATIC_ACTIONS.slice(2).map((action, i) => (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
            >
              <StaticActionCard action={action} onClick={handleStaticClick} />
            </motion.div>
          ))}
        </div>

        <div className="pb-8" />
      </div>
    </main>
  );
}

// ─── Static Action Card (matches ResourceCard style) ─────────

function StaticActionCard({
  action,
  onClick,
}: {
  action: (typeof STATIC_ACTIONS)[number];
  onClick: (id: string, href: string) => void;
}) {
  const displayName = getOrgDisplayName(action.org);

  return (
    <a
      href={action.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onClick(action.id, action.href)}
      className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-accent/30 hover:bg-card-hover"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <OrgLogo sourceOrg={action.org} resourceUrl={action.href} size={18} />
          <span className="font-medium">{displayName}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {formatTimeDa(action.minutes)}
          </span>
        </div>
        <h3 className="mt-2 text-base font-semibold tracking-tight">
          {action.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {action.description}
        </p>
      </div>
    </a>
  );
}

/** Word-level replacements for translating location strings to Danish */
const DANISH_PLACE_NAMES: [RegExp, string][] = [
  [/\bCopenhagen\b/gi, "København"],
  [/\bDenmark\b/gi, "Danmark"],
];

function toDanishLocation(location: string): string {
  let result = location;
  for (const [pattern, replacement] of DANISH_PLACE_NAMES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Check if a resource location is Danish */
function isDanishResource(location: string): boolean {
  const loc = location.toLowerCase();
  return (
    loc.includes("denmark") ||
    loc.includes("danmark") ||
    loc.includes("copenhagen") ||
    loc.includes("københavn") ||
    loc.includes("aarhus") ||
    loc.includes("odense") ||
    loc.includes("aalborg")
  );
}

/** Provide a Danish description for Danish community/event resources */
function danishDescription(resource: Resource): string | undefined {
  if (!isDanishResource(resource.location || "")) return undefined;
  const loc = toDanishLocation(resource.location || "");
  if (resource.category === "communities") {
    return `Mød folk i ${loc} der arbejder med at sikre, at AI-udviklingen går godt.`;
  }
  if (resource.category === "events") {
    return `En begivenhed i ${loc} om fremtiden for AI og hvad vi kan gøre.`;
  }
  return undefined;
}

// ─── Community Card Group (matches LocalCardGroup from results) ──

function CommunityCardGroup({
  localCard,
  geo,
  loading,
  expanded,
  onToggleExpand,
  onLocationChange,
  onResourceClick,
}: {
  localCard: LocalCard | null;
  geo: GeoData | null;
  loading: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onLocationChange: (geo: GeoData) => void;
  onResourceClick: (id: string, title: string) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-5">
        <p className="shimmer text-sm text-muted-foreground">
          Finder fællesskaber i nærheden...
        </p>
      </div>
    );
  }

  if (!localCard) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-5">
        <p className="text-sm text-muted-foreground">
          Ingen fællesskaber fundet
          {geo ? (
            <> nær <LocationPicker geo={geo} onLocationChange={onLocationChange} /></>
          ) : ""}.
        </p>
      </div>
    );
  }

  const extras = localCard.extras;

  return (
    <div className="relative">
      <ResourceCard
        scored={localCard.anchor}
        variant="C"
        customDescription={danishDescription(localCard.anchor.resource)}
        customLocation={toDanishLocation(localCard.anchor.resource.location || "")}
        formatTimeFn={formatTimeDa}
        dateLocale="da-DK"
        onClickTrack={(id) => onResourceClick(id, localCard.anchor.resource.title)}
      />

      {/* Expand bar with location picker */}
      {extras.length > 0 && (
        <div className="relative mt-[-4px] ml-2 mr-2">
          {!expanded && (
            <div className="absolute inset-x-1 top-0 h-3 rounded-b-xl border border-t-0 border-border bg-card/60" />
          )}

          <div
            role="button"
            tabIndex={0}
            onClick={onToggleExpand}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } }}
            className="relative z-10 mt-1 flex w-full cursor-pointer items-center justify-between rounded-b-xl border border-t-0 border-border bg-card/80 px-4 py-2.5 text-left transition-colors hover:bg-card-hover"
          >
            <span className="min-w-0 whitespace-nowrap text-xs text-muted-foreground">
              {extras.length} flere fællesskaber{" "}
              {geo && <>nær<LocationPicker geo={geo} onLocationChange={onLocationChange} /></>}
            </span>
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 text-muted-foreground text-xs ml-2"
            >
              ↓
            </motion.span>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 pt-2">
                  {extras.map((scored) => (
                    <ResourceCard
                      key={scored.resource.id}
                      scored={scored}
                      variant="C"
                      customDescription={danishDescription(scored.resource)}
                      customLocation={toDanishLocation(scored.resource.location || "")}
                      formatTimeFn={formatTimeDa}
                      dateLocale="da-DK"
                      onClickTrack={(id) => onResourceClick(id, scored.resource.title)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* No extras but has anchor - show location in a subtle footer */}
      {extras.length === 0 && geo && (
        <div className="mt-[-4px] ml-2 mr-2">
          <div className="rounded-b-xl border border-t-0 border-border bg-card/80 px-4 py-2 text-xs text-muted-foreground">
            Nær <LocationPicker geo={geo} onLocationChange={onLocationChange} />
          </div>
        </div>
      )}
    </div>
  );
}

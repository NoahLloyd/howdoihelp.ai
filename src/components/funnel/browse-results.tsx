"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { fetchResources, trackClick } from "@/lib/data";
import { getGeoData } from "@/lib/geo";
import {
  trackResultsViewed,
  trackResourceClicked,
  trackBrowseFilterUsed,
  trackTimeToFirstClick,
  trackScrollDepth,
  identifyGeo,
} from "@/lib/tracking";
import { getUserId, getUser } from "@/lib/user";
import { hasSavedRecommendations } from "@/components/funnel/results";
import type {
  Resource,
  Variant,
  GeoData,
  UserAnswers,
} from "@/types";
import { ResourceCard } from "@/components/results/resource-card";
import { LocationPicker } from "@/components/results/location-picker";


// ─── Path definitions ─────────────────────────────────────────

type PathId = "quick" | "learn" | "connect" | "act" | "career";

interface PathDef {
  id: PathId;
  label: string;
  description: string;
}

const PATHS: PathDef[] = [
  { id: "quick", label: "2-minute actions", description: "Things you can do right now." },
  { id: "learn", label: "Learn", description: "Understand AI safety better." },
  { id: "connect", label: "Connect", description: "Find your people." },
  { id: "act", label: "Take action", description: "Make your voice heard." },
  { id: "career", label: "Build a career", description: "Go deep on AI safety." },
];

// ─── Resource → Path mapping ──────────────────────────────────

const OTHER_PATH_MAP: Record<string, PathId> = {
  "aisafety-chatbot": "quick",
  "fli-asset-pack": "quick",
  "aisafety-media": "learn",
  "aisafety-field-map": "learn",
  "80k-explore-careers": "learn",
  "aisafety-com-explore": "learn",
  "aisafety-info-learn": "learn",
  "adolescence-of-technology": "learn",
  "ai-2027": "learn",
  "preparing-intelligence-explosion": "learn",
  "1-on-1-conversation": "connect",
  "talk-to-people": "connect",
  "controlai-legislators": "act",
  "tabling": "act",
  "create-content": "act",
  "donation-guide": "act",
  "80k-ai-safety": "career",
  "80k-job-board": "career",
  "volunteer-projects": "career",
  "mentor-others": "career",
};

function assignPath(resource: Resource): PathId {
  switch (resource.category) {
    case "letters": return "quick";
    case "communities":
    case "events": return "connect";
    case "programs": return "learn";
    case "other": return OTHER_PATH_MAP[resource.id] ?? "act";
    default: return "act";
  }
}

function sortByImpact(a: Resource, b: Resource): number {
  const ratioA = a.ev_general / Math.max(a.friction, 0.01);
  const ratioB = b.ev_general / Math.max(b.friction, 0.01);
  return ratioB - ratioA;
}

function sortByEventDate(a: Resource, b: Resource): number {
  const dateA = a.event_date || "9999";
  const dateB = b.event_date || "9999";
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return sortByImpact(a, b);
}

function sortByQuickest(a: Resource, b: Resource): number {
  return a.min_minutes - b.min_minutes;
}

/** Check if a resource's location is "Online" */
function isOnline(r: Resource): boolean {
  const loc = r.location.toLowerCase();
  return loc === "online";
}

/**
 * Nearness score: how close a resource is to the user.
 *  3 = same city
 *  2 = same region/state
 *  1 = same country
 *  0.5 = global / online (available everywhere)
 *  0 = different country / specific location far away
 */
function nearness(r: Resource, geo: GeoData | null): number {
  if (!geo) return 0.5;
  const loc = r.location.toLowerCase();
  if (!loc) return 0.5;
  if (loc === "online") return 0.5;
  if (loc === "global") return 0.5;
  if (geo.city && loc.includes(geo.city.toLowerCase())) return 3;
  if (geo.region && loc.includes(geo.region.toLowerCase())) return 2;
  if (geo.country && geo.country !== "Unknown" && loc.includes(geo.country.toLowerCase())) return 1;
  // Check 2-letter country code as standalone word
  if (geo.countryCode && geo.countryCode !== "XX" && geo.countryCode.length === 2) {
    const pattern = new RegExp(`\\b${geo.countryCode.toLowerCase()}\\b`);
    if (pattern.test(loc)) return 1;
  }
  return 0;
}

/** Check if a resource is at least somewhat near (city, region, or country match) */
function isNearby(r: Resource, geo: GeoData | null): boolean {
  return nearness(r, geo) >= 1;
}

/** Sort by nearness (closest first), then by impact within the same nearness tier */
function sortByNearness(geo: GeoData | null) {
  return (a: Resource, b: Resource): number => {
    const na = nearness(a, geo);
    const nb = nearness(b, geo);
    if (na !== nb) return nb - na;
    return sortByImpact(a, b);
  };
}

/** Text search against title + description + source_org */
function matchesSearch(r: Resource, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    r.title.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.source_org.toLowerCase().includes(q)
  );
}

const INITIAL_SHOW = 6;

// ─── Sort definitions ─────────────────────────────────────────

type SortId = "relevance" | "soonest" | "quickest";

const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: "relevance", label: "Best match" },
  { id: "soonest", label: "Soonest" },
  { id: "quickest", label: "Quickest" },
];

function applySortToResources(resources: Resource[], sort: SortId): Resource[] {
  const arr = [...resources];
  switch (sort) {
    case "soonest": return arr.sort(sortByEventDate);
    case "quickest": return arr.sort(sortByQuickest);
    default: return arr.sort(sortByImpact);
  }
}

// ─── Main Component ──────────────────────────────────────────

interface BrowseResultsProps {
  variant: Variant;
  onViewRecs?: () => void;
}

export function BrowseResults({ variant, onViewRecs }: BrowseResultsProps) {
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePath, setActivePath] = useState<PathId>("quick");
  const [hasRecs, setHasRecs] = useState(false);

  // Tracking refs
  const loadedAtRef = useRef<number>(0);
  const firstClickTrackedRef = useRef(false);
  const scrollMilestonesRef = useRef(new Set<number>());

  // Check for saved recommendations (localStorage first, then Supabase)
  useEffect(() => {
    if (!onViewRecs) return;
    // Fast local check
    if (hasSavedRecommendations()) {
      setHasRecs(true);
      return;
    }
    // Async Supabase check
    const userId = getUserId();
    if (userId) {
      getUser(userId).then((user) => {
        if (user?.last_recommendations && user.last_recommendations.length > 0) {
          setHasRecs(true);
        }
      }).catch(() => {});
    }
  }, [onViewRecs]);

  useEffect(() => {
    async function init() {
      const [resources, geoData] = await Promise.all([
        fetchResources(),
        getGeoData(),
      ]);
      setAllResources(resources);
      setGeo(geoData);
      identifyGeo(geoData.countryCode);
      loadedAtRef.current = Date.now();

      trackResultsViewed(
        variant, "significant", undefined, false, undefined,
        resources.length, "browse"
      );
      setLoading(false);
    }
    init();
  }, [variant]);

  // Scroll depth tracking
  useEffect(() => {
    if (loading) return;
    function handleScroll() {
      const scrollPct = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );
      for (const milestone of [25, 50, 75, 100]) {
        if (scrollPct >= milestone && !scrollMilestonesRef.current.has(milestone)) {
          scrollMilestonesRef.current.add(milestone);
          trackScrollDepth(variant, milestone);
        }
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loading, variant]);

  const handleLocationChange = useCallback((newGeo: GeoData) => {
    setGeo(newGeo);
  }, []);

  const handleResourceClick = useCallback(
    (resourceId: string, position: number) => {
      if (!geo) return;
      if (!firstClickTrackedRef.current && loadedAtRef.current) {
        trackTimeToFirstClick(variant, Date.now() - loadedAtRef.current);
        firstClickTrackedRef.current = true;
      }
      const answers: UserAnswers = { time: "significant" };
      trackClick(resourceId, variant, answers, geo.countryCode);
      const resource = allResources.find((r) => r.id === resourceId);
      if (resource) {
        trackResourceClicked(
          resourceId, resource.title, resource.category, variant, position,
          loadedAtRef.current ? Date.now() - loadedAtRef.current : undefined
        );
      }
    },
    [allResources, variant, geo]
  );

  // Group resources by path
  const grouped = useMemo(() => {
    const map = new Map<PathId, Resource[]>();
    for (const path of PATHS) map.set(path.id, []);
    for (const resource of allResources) {
      map.get(assignPath(resource))?.push(resource);
    }
    return map;
  }, [allResources]);

  const activePathDef = PATHS.find((p) => p.id === activePath)!;

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span className="shimmer text-muted-foreground/70 text-sm">Loading</span>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-10">
      <div className="mx-auto w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Ways you can help with AI safety
          </h1>
        </motion.div>

        {/* Path pills */}
        <motion.div
          className="-mx-6 mt-6 overflow-x-auto px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex gap-2 pb-1">
            {PATHS.map((path) => {
              const count = grouped.get(path.id)?.length ?? 0;
              const isActive = activePath === path.id;
              return (
                <button
                  key={path.id}
                  onClick={() => {
                    setActivePath(path.id);
                    trackBrowseFilterUsed(variant, "category", path.id);
                  }}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-accent text-white shadow-sm"
                      : "border border-border bg-card text-muted-foreground hover:border-accent/30 hover:text-foreground"
                  }`}
                >
                  {path.label}
                  {count > 0 && (
                    <span className={`ml-1.5 text-xs ${isActive ? "text-white/70" : "text-muted"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Active path content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activePath}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <p className="mt-5 text-sm text-muted-foreground">
              {activePathDef.description}
            </p>

            <div className="mt-4">
              {activePath === "connect" ? (
                <ConnectExplorer
                  resources={grouped.get("connect") ?? []}
                  variant={variant}
                  geo={geo}
                  onClickTrack={handleResourceClick}
                  onLocationChange={handleLocationChange}
                />
              ) : activePath === "learn" ? (
                <LearnExplorer
                  resources={grouped.get("learn") ?? []}
                  variant={variant}
                  onClickTrack={handleResourceClick}
                />
              ) : (
                <SimpleExplorer
                  resources={grouped.get(activePath) ?? []}
                  variant={variant}
                  onClickTrack={handleResourceClick}
                />
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* View saved recommendations link */}
        {hasRecs && onViewRecs && (
          <motion.div
            className="mt-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <button
              onClick={onViewRecs}
              className="text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              View your personalized recommendations
            </button>
          </motion.div>
        )}

        <div className="pb-8" />
      </div>
    </main>
  );
}

// ─── Search Input ─────────────────────────────────────────────

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-9 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Resource List with Show More ─────────────────────────────

function ResourceList({
  resources,
  variant,
  onClickTrack,
  highlightFirst = false,
  initialShow = INITIAL_SHOW,
}: {
  resources: Resource[];
  variant: Variant;
  onClickTrack: (resourceId: string, position: number) => void;
  highlightFirst?: boolean;
  initialShow?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  // Reset expansion when resource list changes substantially
  const countRef = useRef(resources.length);
  useEffect(() => {
    if (Math.abs(resources.length - countRef.current) > 2) {
      setExpanded(false);
    }
    countRef.current = resources.length;
  }, [resources.length]);

  if (resources.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No results match your filters.
      </p>
    );
  }

  const needsTruncation = resources.length > initialShow;
  const visible = expanded || !needsTruncation ? resources : resources.slice(0, initialShow);
  const hiddenCount = resources.length - initialShow;

  return (
    <>
      <div className="flex flex-col gap-3">
        {visible.map((resource, i) => (
          <motion.div
            key={resource.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * Math.min(i, 10) }}
          >
            <ResourceCard
              scored={{ resource, score: resource.ev_general, matchReasons: [] }}
              variant={variant}
              isPrimary={highlightFirst && i === 0}
              onClickTrack={(id) => onClickTrack(id, i)}
            />
          </motion.div>
        ))}
      </div>

      {needsTruncation && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-xl border border-border bg-card/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-accent/30 hover:bg-card-hover hover:text-foreground"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </>
  );
}

// ─── Connect Explorer (communities + events) ─────────────────

type ConnectTab = "communities" | "events" | "other";

const CONNECT_TABS: { id: ConnectTab; label: string }[] = [
  { id: "communities", label: "Communities" },
  { id: "events", label: "Events" },
  { id: "other", label: "Online" },
];

interface ConnectExplorerProps {
  resources: Resource[];
  variant: Variant;
  geo: GeoData | null;
  onClickTrack: (resourceId: string, position: number) => void;
  onLocationChange: (geo: GeoData) => void;
}

function ConnectExplorer({ resources, variant, geo, onClickTrack, onLocationChange }: ConnectExplorerProps) {
  const [search, setSearch] = useState("");

  // Split resources by sub-type — online items go into the "Online" tab
  const communities = useMemo(
    () => resources.filter((r) => r.category === "communities" && !isOnline(r)),
    [resources]
  );
  const events = useMemo(
    () => resources.filter((r) => r.category === "events" && !isOnline(r)),
    [resources]
  );
  const other = useMemo(
    () => resources.filter((r) =>
      (r.category !== "communities" && r.category !== "events") || isOnline(r)
    ),
    [resources]
  );

  // Default to whichever tab has content
  const defaultTab: ConnectTab = communities.length > 0 ? "communities" : events.length > 0 ? "events" : "other";
  const [tab, setTab] = useState<ConnectTab>(defaultTab);

  // If current tab becomes empty, switch
  useEffect(() => {
    const pool = tab === "communities" ? communities : tab === "events" ? events : other;
    if (pool.length === 0) {
      if (communities.length > 0) setTab("communities");
      else if (events.length > 0) setTab("events");
      else if (other.length > 0) setTab("other");
    }
  }, [tab, communities.length, events.length, other.length, communities, events, other]);

  // Determine which tabs to show (hide empty tabs)
  const visibleTabs = useMemo(() => {
    const tabs: { id: ConnectTab; label: string }[] = [];
    if (communities.length > 0) tabs.push(CONNECT_TABS[0]);
    if (events.length > 0) tabs.push(CONNECT_TABS[1]);
    if (other.length > 0) tabs.push(CONNECT_TABS[2]);
    return tabs;
  }, [communities.length, events.length, other.length]);

  // Pick the right pool based on tab
  const pool = tab === "communities" ? communities : tab === "events" ? events : other;

  // Apply filters
  const filtered = useMemo(() => {
    let items = pool;

    // Search
    if (search) {
      items = items.filter((r) => matchesSearch(r, search));
    }

    // Sort — nearness first, then date for events, impact for others
    if (tab === "events") {
      items = [...items].sort((a, b) => {
        const na = nearness(a, geo);
        const nb = nearness(b, geo);
        const tierA = na >= 1 ? 2 : na > 0 ? 1 : 0;
        const tierB = nb >= 1 ? 2 : nb > 0 ? 1 : 0;
        if (tierA !== tierB) return tierB - tierA;
        return sortByEventDate(a, b);
      });
    } else {
      items = [...items].sort(sortByNearness(geo));
    }

    return items;
  }, [pool, search, tab, geo]);

  // Counts for tabs
  const tabCounts: Record<ConnectTab, number> = {
    communities: communities.length,
    events: events.length,
    other: other.length,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Inner tabs */}
      {visibleTabs.length > 1 && (
        <div className="flex border-b border-border">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearch(""); }}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.id ? "text-muted-foreground" : "text-muted"}`}>
                {tabCounts[t.id]}
              </span>
              {tab === t.id && (
                <motion.div
                  layoutId="connect-tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={`Search ${tab === "communities" ? "communities" : tab === "events" ? "events" : "resources"}...`}
      />

      {/* Location context */}
      {geo && geo.city && (
        <div className="flex items-center text-xs text-muted-foreground">
          <span>Sorted by distance from</span>
          <LocationPicker geo={geo} onLocationChange={onLocationChange} />
        </div>
      )}

      {/* Results */}
      <ResourceList
        resources={filtered}
        variant={variant}
        onClickTrack={onClickTrack}
        highlightFirst={!search}
      />
    </div>
  );
}

// ─── Learn Explorer ───────────────────────────────────────────

type LearnTab = "quick" | "courses";

const LEARN_TABS: { id: LearnTab; label: string }[] = [
  { id: "quick", label: "Reads & tools" },
  { id: "courses", label: "Courses & programs" },
];

interface LearnExplorerProps {
  resources: Resource[];
  variant: Variant;
  onClickTrack: (resourceId: string, position: number) => void;
}

function LearnExplorer({ resources, variant, onClickTrack }: LearnExplorerProps) {
  const [search, setSearch] = useState("");

  const quickReads = useMemo(
    () => resources.filter((r) => r.min_minutes < 1500),
    [resources]
  );
  const courses = useMemo(
    () => resources.filter((r) => r.min_minutes >= 1500),
    [resources]
  );

  // Default to whichever tab actually has content
  const defaultTab: LearnTab = quickReads.length > 0 ? "quick" : "courses";
  const [tab, setTab] = useState<LearnTab>(defaultTab);

  // If the current tab has no content, switch to the one that does
  useEffect(() => {
    if (tab === "quick" && quickReads.length === 0 && courses.length > 0) {
      setTab("courses");
    } else if (tab === "courses" && courses.length === 0 && quickReads.length > 0) {
      setTab("quick");
    }
  }, [tab, quickReads.length, courses.length]);

  // Visible tabs (hide empty)
  const visibleTabs = useMemo(() => {
    const tabs: { id: LearnTab; label: string }[] = [];
    if (quickReads.length > 0) tabs.push(LEARN_TABS[0]);
    if (courses.length > 0) tabs.push(LEARN_TABS[1]);
    return tabs;
  }, [quickReads.length, courses.length]);

  const pool = tab === "quick" ? quickReads : courses;

  const filtered = useMemo(() => {
    let items = pool;

    if (search) {
      items = items.filter((r) => matchesSearch(r, search));
    }

    return [...items].sort(sortByImpact);
  }, [pool, search]);

  const tabCounts: Record<LearnTab, number> = {
    quick: quickReads.length,
    courses: courses.length,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Inner tabs */}
      {visibleTabs.length > 1 && (
        <div className="flex border-b border-border">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearch(""); }}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.id ? "text-muted-foreground" : "text-muted"}`}>
                {tabCounts[t.id]}
              </span>
              {tab === t.id && (
                <motion.div
                  layoutId="learn-tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={`Search ${tab === "quick" ? "resources" : "courses"}...`}
      />

      {/* Results */}
      <ResourceList
        resources={filtered}
        variant={variant}
        onClickTrack={onClickTrack}
        highlightFirst={!search}
      />
    </div>
  );
}

// ─── Simple Explorer (quick, act, career) ─────────────────────

interface SimpleExplorerProps {
  resources: Resource[];
  variant: Variant;
  onClickTrack: (resourceId: string, position: number) => void;
}

function SimpleExplorer({ resources, variant, onClickTrack }: SimpleExplorerProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("relevance");

  const filtered = useMemo(() => {
    let items = resources;
    if (search) {
      items = items.filter((r) => matchesSearch(r, search));
    }
    return applySortToResources(items, sort);
  }, [resources, search, sort]);

  // Only show search if there are enough items to warrant it
  const showSearch = resources.length > 4;

  return (
    <div className="flex flex-col gap-4">
      {showSearch && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search..."
        />
      )}

      {showSearch && (
        <div className="flex items-center justify-end">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortId)}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-accent"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <ResourceList
        resources={filtered}
        variant={variant}
        onClickTrack={onClickTrack}
        highlightFirst={!search}
      />
    </div>
  );
}

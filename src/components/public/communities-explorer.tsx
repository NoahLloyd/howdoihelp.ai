"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { Resource } from "@/types";
import { getGeoData } from "@/lib/geo";
import { SubmitForm } from "./submit-form";
import { CATEGORIES } from "@/lib/categories";

// ─── Constants ──────────────────────────────────────────────

const PAGE_SIZE = 36;

const SOURCES = [
  { key: "all", label: "All" },
  { key: "EA Forum", label: "EA Forum" },
  { key: "LessWrong", label: "LessWrong" },
  { key: "Other", label: "Other" },
  { key: "PauseAI", label: "PauseAI" },
] as const;

// ─── Helpers ────────────────────────────────────────────────

function extractCountry(location: string): string {
  if (!location || location === "Global" || location === "Online") return location || "Global";
  const parts = location.split(",");
  return parts[parts.length - 1].trim();
}

/** Score how well a community location matches the user's detected geo. */
function geoRelevance(
  location: string,
  userCity?: string,
  userRegion?: string,
  userCountry?: string
): number {
  if (!userCountry) return 0;

  const loc = location.toLowerCase();
  const country = userCountry.toLowerCase();

  // Exact city match → strongest signal
  if (userCity && loc.includes(userCity.toLowerCase())) return 100;

  // Region/state match
  if (userRegion && loc.includes(userRegion.toLowerCase())) return 80;

  // Country match
  if (loc.includes(country)) return 60;

  // Country code patterns (2-letter at end, e.g. "Berlin, DE")
  // handled implicitly by country name match above

  // Online communities are always somewhat relevant
  if (location === "Online") return 20;
  if (location === "Global") return 10;

  return 0;
}

// ─── Custom Location Dropdown ───────────────────────────────

interface LocationDropdownProps {
  countries: { name: string; count: number }[];
  value: string;
  onChange: (value: string) => void;
  userCountry?: string;
}

function LocationDropdown({ countries, value, onChange, userCountry }: LocationDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return countries;
    const q = query.toLowerCase();
    return countries.filter((c) => c.name.toLowerCase().includes(q));
  }, [countries, query]);

  const displayLabel = value === "all" ? "All locations" : value;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setQuery(""); }}
        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
          value !== "all"
            ? "bg-accent/10 border-accent/40 text-accent"
            : "bg-card border-border text-muted-foreground hover:border-accent/30 hover:text-foreground"
        }`}
      >
        <span className="truncate max-w-[140px]">{displayLabel}</span>
        <svg
          className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Search within dropdown */}
            <div className="p-2 border-b border-border">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search countries..."
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none transition-colors"
              />
            </div>

            <div className="max-h-64 overflow-y-auto overscroll-contain">
              {/* Quick picks */}
              <div className="px-1 py-1">
                {[
                  { value: "all", label: "All locations" },
                  { value: "Online", label: "Online" },
                  { value: "Global", label: "Global" },
                ].map((opt) => (
                  (!query || opt.label.toLowerCase().includes(query.toLowerCase())) && (
                    <button
                      key={opt.value}
                      onClick={() => { onChange(opt.value); setOpen(false); setQuery(""); }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
                        value === opt.value
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-foreground hover:bg-card-hover"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {opt.value !== "all" && (
                        <span className="text-muted font-mono text-[10px]">
                          {countries.find((c) => c.name === opt.value)?.count || 0}
                        </span>
                      )}
                    </button>
                  )
                ))}
              </div>

              {/* Divider */}
              <div className="h-px bg-border mx-2" />

              {/* Country list */}
              <div className="px-1 py-1">
                {filtered
                  .filter((c) => c.name !== "Online" && c.name !== "Global")
                  .map((c) => (
                    <button
                      key={c.name}
                      onClick={() => { onChange(c.name); setOpen(false); setQuery(""); }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
                        value === c.name
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-foreground hover:bg-card-hover"
                      }`}
                    >
                      <span className="truncate">
                        {c.name === userCountry && (
                          <span className="text-accent mr-1">●</span>
                        )}
                        {c.name}
                      </span>
                      <span className="text-muted font-mono text-[10px] shrink-0 ml-2">{c.count}</span>
                    </button>
                  ))}

                {filtered.filter((c) => c.name !== "Online" && c.name !== "Global").length === 0 && (
                  <div className="px-2.5 py-3 text-xs text-muted text-center">
                    No countries match &ldquo;{query}&rdquo;
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

interface CommunitiesExplorerProps {
  resources: Resource[];
}

export function CommunitiesExplorer({ resources }: CommunitiesExplorerProps) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showSubmit, setShowSubmit] = useState(false);

  // Geo state
  const [userCity, setUserCity] = useState<string>();
  const [userRegion, setUserRegion] = useState<string>();
  const [userCountry, setUserCountry] = useState<string>();
  const [geoLoaded, setGeoLoaded] = useState(false);

  // Fetch user geo on mount
  useEffect(() => {
    getGeoData().then((geo) => {
      setUserCity(geo.city);
      setUserRegion(geo.region);
      setUserCountry(geo.country);
      setGeoLoaded(true);
    });
  }, []);

  // Precompute country list
  const countries = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resources) {
      const c = extractCountry(r.location);
      map.set(c, (map.get(c) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [resources]);

  // Precompute source counts (always from the full set)
  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = { all: resources.length };
    for (const r of resources) {
      const org = r.source_org || "Other";
      const key = org.startsWith("PauseAI") ? "PauseAI" : org;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [resources]);

  // Filter + search + geo-sort
  const filtered = useMemo(() => {
    let result = resources;

    // Source filter
    if (sourceFilter !== "all") {
      result = result.filter((r) => {
        const org = r.source_org || "";
        if (sourceFilter === "PauseAI") return org.startsWith("PauseAI");
        return org === sourceFilter;
      });
    }

    // Country filter
    if (countryFilter !== "all") {
      if (countryFilter === "Online") {
        result = result.filter((r) => r.location === "Online");
      } else if (countryFilter === "Global") {
        result = result.filter((r) => r.location === "Global");
      } else {
        result = result.filter((r) => extractCountry(r.location) === countryFilter);
      }
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.source_org.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q)
      );
    } else {
      // If NOT explicitly searching, hide communities with very low activity or dead status
      // so they don't clutter the default recommendations
      result = result.filter((r) => r.activity_score !== undefined ? r.activity_score >= 0.2 : true);
    }

    // Combined sort: geo proximity + activity score
    // Activity score is always a factor; geo proximity applies when no explicit filters
    result = [...result].sort((a, b) => {
      const actA = a.activity_score ?? 0.5;
      const actB = b.activity_score ?? 0.5;

      if (geoLoaded && !search && countryFilter === "all") {
        // Geo-weighted: nearby + active first
        const geoA = geoRelevance(a.location, userCity, userRegion, userCountry);
        const geoB = geoRelevance(b.location, userCity, userRegion, userCountry);
        // Combine: geo tier (0–100) + activity (0–1 scaled to 0–10)
        const combinedA = geoA + actA * 10;
        const combinedB = geoB + actB * 10;
        if (combinedB !== combinedA) return combinedB - combinedA;
      } else {
        // No geo: sort by activity score
        if (actB !== actA) return actB - actA;
      }
      return a.title.localeCompare(b.title);
    });

    return result;
  }, [resources, sourceFilter, countryFilter, search, geoLoaded, userCity, userRegion, userCountry]);

  // Count how many are "nearby"
  const nearbyCount = useMemo(() => {
    if (!geoLoaded || !userCountry) return 0;
    return resources.filter(
      (r) => geoRelevance(r.location, userCity, userRegion, userCountry) >= 60
    ).length;
  }, [resources, geoLoaded, userCity, userRegion, userCountry]);

  // Paginated slice
  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  // Reset pagination when filters change
  const handleFilterChange = useCallback(
    (setter: (v: string) => void, value: string) => {
      setter(value);
      setVisibleCount(PAGE_SIZE);
    },
    []
  );

  const category = CATEGORIES.find((c) => c.id === "communities")!;
  const hasActiveFilters = search || sourceFilter !== "all" || countryFilter !== "all";

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

        {/* ── Header ── */}
        <header className="mb-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                Communities
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {resources.length.toLocaleString()} groups across AI safety, effective altruism, and advocacy
                {geoLoaded && userCountry && userCountry !== "Unknown" && nearbyCount > 0 && (
                  <span className="text-foreground">
                    {" "}· {nearbyCount} near {userCity || userCountry}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setShowSubmit(true)}
              className="px-3.5 py-2 text-xs font-medium border border-border text-foreground rounded-lg hover:border-accent/40 hover:text-accent transition-colors shrink-0 cursor-pointer"
            >
              Submit a group
            </button>
          </div>
        </header>

        {/* ── Search ── */}
        <div className="relative mb-4">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Search communities..."
            className="w-full pl-10 pr-10 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-border/50 text-muted hover:text-foreground text-xs leading-none cursor-pointer transition-colors"
            >
              ×
            </button>
          )}
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-1.5 mb-6">
          {SOURCES.map((sf) => {
            const count = sourceCounts[sf.key] || 0;
            if (sf.key !== "all" && count === 0) return null;
            const active = sourceFilter === sf.key;
            return (
              <button
                key={sf.key}
                onClick={() => handleFilterChange(setSourceFilter, sf.key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                  active
                    ? "bg-accent/10 border-accent/40 text-accent"
                    : "bg-card border-border text-muted-foreground hover:border-accent/30 hover:text-foreground"
                }`}
              >
                {sf.label}
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    active ? "text-accent/60" : "text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          <span className="w-px h-4 bg-border mx-0.5 hidden sm:block" />

          <LocationDropdown
            countries={countries}
            value={countryFilter}
            onChange={(v) => handleFilterChange(setCountryFilter, v)}
            userCountry={userCountry}
          />

          {hasActiveFilters && (
            <>
              <span className="w-px h-4 bg-border mx-0.5 hidden sm:block" />
              <button
                onClick={() => {
                  setSearch("");
                  setSourceFilter("all");
                  setCountryFilter("all");
                  setVisibleCount(PAGE_SIZE);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Clear
              </button>
            </>
          )}
        </div>

        {/* ── Results count ── */}
        <div className="mb-4">
          <p className="text-[11px] text-muted font-mono tracking-wide uppercase">
            {filtered.length === resources.length
              ? `${resources.length.toLocaleString()} communities`
              : `${filtered.length.toLocaleString()} of ${resources.length.toLocaleString()}`}
            {search && ` matching "${search}"`}
            {geoLoaded && !search && countryFilter === "all" && sourceFilter === "all" && userCountry && userCountry !== "Unknown" && (
              <span className="normal-case"> · sorted by proximity to {userCity || userCountry}</span>
            )}
          </p>
        </div>

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <AnimatePresence mode="popLayout">
            {visible.map((r, i) => {
              const relevance = geoLoaded
                ? geoRelevance(r.location, userCity, userRegion, userCountry)
                : 0;
              const isNearby = relevance >= 60;

              return (
                <motion.a
                  key={r.id}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block p-3.5 rounded-lg border transition-all group ${
                    isNearby && !search && countryFilter === "all"
                      ? "bg-accent/[0.03] border-accent/20 hover:border-accent/40"
                      : "bg-card border-border hover:border-accent/30"
                  } hover:bg-card-hover`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.15, delay: Math.min(i * 0.01, 0.2) }}
                  layout
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-medium text-foreground group-hover:text-accent transition-colors leading-snug line-clamp-1">
                        {r.title}
                      </h3>

                      {r.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                          {r.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1 mt-2 text-[10px] text-muted font-mono">
                        {r.location && r.location !== "Global" && (
                          <span className="bg-background px-1.5 py-0.5 rounded">
                            {r.location.length > 28 ? r.location.slice(0, 26) + "…" : r.location}
                          </span>
                        )}
                        {r.source_org &&
                          // Hide the tag if we're already filtering by this source
                          (sourceFilter === "all" ||
                            (sourceFilter === "PauseAI" && !r.source_org.startsWith("PauseAI")) ||
                            (sourceFilter !== "all" && sourceFilter !== "PauseAI" && sourceFilter !== r.source_org)) && (
                            <span className="bg-background px-1.5 py-0.5 rounded">
                              {r.source_org.startsWith("PauseAI") ? "PauseAI" : r.source_org}
                            </span>
                          )}
                      </div>
                    </div>
                    <svg
                      className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M7 17 17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </motion.a>
              );
            })}
          </AnimatePresence>
        </div>

        {/* ── Empty state ── */}
        {filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm text-muted-foreground">
              No communities match your filters.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setSourceFilter("all");
                setCountryFilter("all");
              }}
              className="text-sm text-accent hover:text-accent-hover mt-3 cursor-pointer"
            >
              Clear all filters
            </button>
          </div>
        )}

        {/* ── Load more ── */}
        {visibleCount < filtered.length && (
          <div className="flex justify-center mt-8">
            <button
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="group px-5 py-2.5 text-xs font-medium border border-border rounded-lg hover:border-accent/30 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              Show more
              <span className="font-mono text-[10px] text-muted ml-1.5">
                {Math.min(filtered.length - visibleCount, PAGE_SIZE)} of{" "}
                {(filtered.length - visibleCount).toLocaleString()} remaining
              </span>
            </button>
          </div>
        )}

        {/* ── End marker ── */}
        {visibleCount >= filtered.length && filtered.length > PAGE_SIZE && (
          <p className="text-center text-[11px] text-muted mt-8 font-mono">
            {filtered.length.toLocaleString()} communities
          </p>
        )}

        {/* ── API link ── */}
        <div className="mt-12 pt-6 border-t border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            This data is available via our{" "}
            <Link
              href="/developers"
              className="text-accent hover:underline"
            >
              free public API
            </Link>
          </p>
        </div>
      </div>

      {/* ── Submit overlay ── */}
      {showSubmit && (
        <SubmitForm
          category={category}
          onClose={() => setShowSubmit(false)}
        />
      )}
    </div>
  );
}

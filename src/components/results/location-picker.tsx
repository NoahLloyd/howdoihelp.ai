"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GeoData } from "@/types";

interface LocationPickerProps {
  geo: GeoData;
  onLocationChange: (geo: GeoData) => void;
  /** Auto-open the editor on mount (used when geo detection fails) */
  autoOpen?: boolean;
  /** Which edge of the pill the popover lines up with */
  align?: "left" | "right";
}

interface LocationMatch {
  label: string;
  geo: GeoData;
}

/** Inline clickable location that opens a popover editor */
export function LocationPicker({ geo, onLocationChange, autoOpen, align = "left" }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const autoOpenedRef = useRef(false);
  const [value, setValue] = useState("");
  const [typed, setTyped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<LocationMatch[]>([]);
  /** The text the current matches belong to */
  const [matchesFor, setMatchesFor] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);

  const displayCity =
    geo.city && geo.city !== "Unknown" ? geo.city : null;
  const displayLabel = displayCity
    ? displayCity
    : geo.country !== "Unknown"
      ? geo.country
      : "your area";
  const fullLabel =
    displayCity && geo.country !== "Unknown" ? `${displayCity}, ${geo.country}` : displayLabel;

  // Auto-open when geo detection fails
  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [autoOpen]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Suggest places while the visitor types, after a short pause
  useEffect(() => {
    const query = value.trim();
    if (!open || !typed || query.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const found = await searchLocations(query, geo, controller.signal);
      if (controller.signal.aborted) return;
      setMatches(found);
      setMatchesFor(query);
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [value, typed, open, geo]);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    setValue(displayCity || "");
    setTyped(false);
    setMatches([]);
    setOpen(true);
  }

  function handleType(text: string) {
    setValue(text);
    setTyped(true);
    if (text.trim().length < 2) setMatches([]);
  }

  function choose(newGeo: GeoData) {
    onLocationChange(newGeo);
    setMatches([]);
    setOpen(false);
  }

  /** Enter and the arrow button pick the first suggestion */
  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    if (matchesFor === trimmed && matches.length > 0) {
      choose(matches[0].geo);
      return;
    }

    setLoading(true);
    const found = await searchLocations(trimmed, geo);
    setLoading(false);
    choose(found[0]?.geo ?? { ...geo, city: trimmed, region: undefined });
  }

  return (
    <span ref={containerRef} className="relative inline">
      <span
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpen(e as unknown as React.MouseEvent); }}
        title={`Your location: ${fullLabel}. Click to change.`}
        className="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
      >
        <svg
          className="h-2.5 w-2.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {displayLabel}
      </span>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full z-50 mt-2 w-64 rounded-xl border border-border bg-card p-3 shadow-lg`}
          >
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Show results near
            </p>
            <div className="flex gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => handleType(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                placeholder="City or region..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-accent"
              />
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex shrink-0 items-center justify-center rounded-lg bg-accent px-2.5 py-1.5 text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
            {matches.length > 0 && (
              <ul className="mt-2 flex flex-col">
                {matches.map((m, i) => (
                  <li key={m.label}>
                    <button
                      type="button"
                      onClick={() => choose(m.geo)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent/5 hover:text-accent ${i === 0 ? "bg-accent/5" : ""}`}
                    >
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

interface PhotonPlace {
  properties: {
    name?: string;
    type?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
}

/**
 * Look up a typed place with Photon, an OpenStreetMap search made for
 * search-as-you-type (Nominatim's rules forbid that use). Returns the top
 * cities, counties, states, and countries in English, each labeled with its
 * country. An empty list means nothing was found or the lookup failed.
 */
async function searchLocations(
  query: string,
  fallback: GeoData,
  signal?: AbortSignal
): Promise<LocationMatch[]> {
  try {
    const params = new URLSearchParams({ q: query, limit: "5", lang: "en" });
    for (const layer of ["city", "county", "state", "country"]) params.append("layer", layer);
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      signal: signal ?? AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error("Photon request failed");

    const { features = [] }: { features?: PhotonPlace[] } = await res.json();
    const places = features.map(({ properties: p }) => {
      const geo: GeoData = {
        country: p.country || fallback.country,
        countryCode: (p.countrycode || fallback.countryCode).toUpperCase(),
        city: p.type === "city" ? p.name : undefined,
        region: p.type === "state" ? p.name : p.state || p.county || undefined,
        timezone: fallback.timezone,
        isAuthoritarian: fallback.isAuthoritarian,
      };
      const name = p.type === "country" ? undefined : p.name;
      return { geo, name: name && name !== geo.country ? name : undefined };
    });

    // Several matches in one country also show their region, such as a US state
    const matches: LocationMatch[] = places.map(({ geo, name }) => {
      const sameCountry = places.filter((p) => p.geo.country === geo.country).length;
      const parts =
        sameCountry > 1 && geo.region && geo.region !== name
          ? [name, geo.region, geo.country]
          : [name, geo.country];
      return { label: parts.filter(Boolean).join(", "), geo };
    });
    return matches.filter((m, i) => matches.findIndex((o) => o.label === m.label) === i);
  } catch {
    return [];
  }
}

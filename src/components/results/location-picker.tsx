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
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<LocationMatch[]>([]);
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

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    setValue(displayCity || "");
    setMatches([]);
    setOpen(true);
  }

  function choose(newGeo: GeoData) {
    onLocationChange(newGeo);
    setMatches([]);
    setOpen(false);
  }

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }

    setLoading(true);
    const found = await searchLocations(trimmed, geo);
    setLoading(false);
    if (found.length > 1) {
      setMatches(found);
    } else {
      choose(found[0]?.geo ?? { ...geo, city: trimmed, region: undefined });
    }
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
                onChange={(e) => { setValue(e.target.value); setMatches([]); }}
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
            {matches.length > 1 && (
              <ul className="mt-2 flex flex-col">
                {matches.map((m) => (
                  <li key={m.label}>
                    <button
                      type="button"
                      onClick={() => choose(m.geo)}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent/5 hover:text-accent"
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

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  county?: string;
  country?: string;
  country_code?: string;
}

/**
 * Look up a typed place with OpenStreetMap (Nominatim) and return its top
 * matches in English, each labeled with its country. An empty list means
 * nothing was found or the lookup failed.
 */
async function searchLocations(
  query: string,
  fallback: GeoData
): Promise<LocationMatch[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: "5",
      addressdetails: "1",
      "accept-language": "en",
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: { "User-Agent": "HowDoIHelpAI/1.0" },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) throw new Error("Nominatim request failed");

    const results: { address?: NominatimAddress }[] = await res.json();
    const places = results.map(({ address: addr = {} }) => {
      const geo: GeoData = {
        country: addr.country || fallback.country,
        countryCode: (addr.country_code || fallback.countryCode).toUpperCase(),
        city: addr.city || addr.town || addr.village || addr.municipality || undefined,
        region: addr.state || addr.county || undefined,
        timezone: fallback.timezone,
        isAuthoritarian: fallback.isAuthoritarian,
      };
      const name = geo.city || geo.region;
      return { geo, short: name ? `${name}, ${geo.country}` : geo.country };
    });

    // Several matches in one country also show their region, such as a US state
    const matches: LocationMatch[] = places.map(({ geo, short }) => {
      const sameCountry = places.filter((p) => p.geo.country === geo.country).length;
      const label =
        sameCountry > 1 && geo.city && geo.region
          ? `${geo.city}, ${geo.region}, ${geo.country}`
          : short;
      return { label, geo };
    });
    return matches.filter((m, i) => matches.findIndex((o) => o.label === m.label) === i);
  } catch {
    return [];
  }
}

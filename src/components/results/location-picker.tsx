"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GeoData } from "@/types";

interface LocationPickerProps {
  geo: GeoData;
  onLocationChange: (geo: GeoData) => void;
}

/** Inline clickable location that opens a popover editor */
export function LocationPicker({ geo, onLocationChange }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);

  const displayCity =
    geo.city && geo.city !== "Unknown" ? geo.city : null;
  const displayLabel = displayCity
    ? displayCity
    : geo.country !== "Unknown"
      ? geo.country
      : "your area";

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
    setOpen(true);
  }

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }

    setLoading(true);
    const newGeo = await geocodeLocation(trimmed, geo);
    setLoading(false);
    onLocationChange(newGeo);
    setOpen(false);
  }

  return (
    <span ref={containerRef} className="relative inline">
      <span
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpen(e as unknown as React.MouseEvent); }}
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
            className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-card p-3 shadow-lg"
          >
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Show results near
            </p>
            <div className="flex gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
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
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Resolve a location string into GeoData using Nominatim */
async function geocodeLocation(
  query: string,
  fallback: GeoData
): Promise<GeoData> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: "1",
      addressdetails: "1",
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: { "User-Agent": "HowDoIHelpAI/1.0" },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) throw new Error("Nominatim request failed");

    const results = await res.json();
    if (results.length === 0) {
      return { ...fallback, city: query, region: undefined };
    }

    const place = results[0];
    const addr = place.address || {};
    const city =
      addr.city || addr.town || addr.village || addr.municipality || query;
    const region = addr.state || addr.county || undefined;
    const country = addr.country || fallback.country;
    const countryCode = (
      addr.country_code || fallback.countryCode
    ).toUpperCase();

    return {
      country,
      countryCode,
      city,
      region,
      timezone: fallback.timezone,
      isAuthoritarian: fallback.isAuthoritarian,
    };
  } catch {
    return { ...fallback, city: query, region: undefined };
  }
}

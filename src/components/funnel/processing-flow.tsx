"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, Sparkles, User, Lock } from "lucide-react";
import { fetchResources } from "@/lib/data";
import { rankResources, buildLocalCard } from "@/lib/ranking";
import { getGeoData } from "@/lib/geo";
import { getUserId, upsertUser } from "@/lib/user";
import { identifyGeo, trackResultsViewed } from "@/lib/tracking";
import type {
  EnrichedProfile,
  ProfilePlatform,
  Resource,
  GeoData,
  Variant,
  UserAnswers,
  ScoredResource,
  LocalCard,
  RecommendedResource,
} from "@/types";

// ─── Types ──────────────────────────────────────────────────

export type ResultItem =
  | { kind: "resource"; scored: ScoredResource; customDescription?: string }
  | { kind: "local"; card: LocalCard | null };

type InputType = "linkedin" | "github" | "name" | "other_url" | "x" | "instagram";

/** Strip markdown formatting for plain-text display */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")           // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")     // bold
    .replace(/\*(.+?)\*/g, "$1")         // italic
    .replace(/__(.+?)__/g, "$1")         // bold alt
    .replace(/_(.+?)_/g, "$1")           // italic alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/\[\d+\]/g, "")            // citation markers [1], [2]
    .replace(/^[-*+]\s+/gm, "")          // list items
    .replace(/^\d+\.\s+/gm, "")          // numbered lists
    .replace(/`([^`]+)`/g, "$1")         // inline code
    .replace(/```[\s\S]*?```/g, "")      // code blocks
    .replace(/>\s+/g, "")               // blockquotes
    .replace(/\n{3,}/g, "\n\n")          // excessive newlines
    .trim();
}

/** Common section headers from Perplexity output that aren't useful as snippets */
const GENERIC_HEADERS = /^(personal\s+background|background|overview|summary|introduction|about|biography|bio|professional\s+background|career|education|experience|skills|key\s+(highlights|facts|information|details|points)|early\s+life|notable\s+(achievements|work)|achievements)$/i;

/** Extract snippet lines from Perplexity text, preferring bullet-list content */
function extractSnippetLines(text: string, maxItems = 4): string[] {
  const cleaned = stripMarkdown(text);
  const lines = cleaned.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !GENERIC_HEADERS.test(l));

  // Find the first cluster of short lines (bullet-list-style content)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 10) continue;
    // If this line and the next are both reasonably short, it's likely a list
    if (line.length < 120 && i + 1 < lines.length && lines[i + 1].length < 120) {
      return lines
        .slice(i, i + maxItems)
        .map((l) => l.length > 80 ? l.slice(0, 77).trimEnd() + "..." : l);
    }
  }

  // Fallback: first meaningful line
  const first = lines.find((l) => l.length > 20) || lines[0] || "";
  return [first.length > 80 ? first.slice(0, 77).trimEnd() + "..." : first];
}

/** Build a rich Perplexity search query from profile data */
function buildSearchQuery(profile: EnrichedProfile): string {
  const parts: string[] = [];
  if (profile.fullName) parts.push(profile.fullName);
  if (profile.currentTitle) parts.push(profile.currentTitle);
  if (profile.currentCompany) parts.push(profile.currentCompany);
  if (parts.length === 1 && profile.headline) {
    // Name only — add headline for disambiguation
    parts.push(profile.headline.slice(0, 60));
  }
  return parts.join(", ");
}

/** What the user currently sees */
interface ViewState {
  /** The status message shown with the spinner */
  statusText: string;
  /** Profile card (name, photo, headline) — shown when available */
  profile?: EnrichedProfile;
  /** Detail tags from enrichment (skills, experience, repos) */
  details?: string[];
  /** Citations/links being checked — shown when available */
  citations?: string[];
  /** Short snippet lines from search results */
  snippetLines?: string[];
}

interface ProcessingFlowProps {
  input: string;
  inputType: InputType;
  platform: ProfilePlatform;
  variant: Variant;
  profileText?: string;
  onComplete: (
    items: ResultItem[],
    geo: GeoData,
    answers: UserAnswers,
  ) => void;
}

// ─── Helpers ────────────────────────────────────────────────

/** Wait for a minimum duration so the user can absorb what's on screen */
function minWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract a display-friendly hostname from a URL */
function urlToHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Build detail tags from an enriched profile */
function buildDetailTags(profile: EnrichedProfile): string[] {
  const tags: string[] = [];

  // Current role
  if (profile.currentTitle && profile.currentCompany) {
    tags.push(`${profile.currentTitle} at ${profile.currentCompany}`);
  } else if (profile.currentCompany) {
    tags.push(profile.currentCompany);
  }

  // Top skills (first 4)
  for (const skill of (profile.skills || []).slice(0, 4)) {
    if (skill.length < 40 && !skill.startsWith("Volunteer:") && !skill.startsWith("Publication:") && !skill.startsWith("Language:")) {
      tags.push(skill);
    }
  }

  // Top repos for GitHub
  if (profile.repos) {
    for (const repo of profile.repos.slice(0, 3)) {
      tags.push(repo.language ? `${repo.name} (${repo.language})` : repo.name);
    }
  }

  // Education (first 2)
  for (const edu of (profile.education || []).slice(0, 2)) {
    if (edu.school) tags.push(edu.school);
  }

  // Experience (first 2, skip if we already have currentTitle)
  if (!profile.currentTitle) {
    for (const exp of (profile.experience || []).slice(0, 2)) {
      if (exp.company) tags.push(exp.title ? `${exp.title}, ${exp.company}` : exp.company);
    }
  }

  return tags.slice(0, 6); // Max 6 tags
}

// ─── Visual Step Components ──────────────────────────────────

/** Status text with a shimmer sweep animation (powered by tw-shimmer) */
function ShimmerText({ children }: { children: string }) {
  return <span className="shimmer text-muted-foreground/70">{children}</span>;
}

/** Mini browser address bar shown while fetching a profile URL */
function FetchingUrlBar({ url }: { url: string }) {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = url;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35 }}
      className="mb-6 w-full max-w-sm"
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-3 py-2">
          <Lock className="h-3 w-3 shrink-0 text-muted" strokeWidth={2} />
          <span className="truncate text-xs text-muted-foreground">{host}</span>
        </div>
        <div className="h-0.5 bg-border">
          <motion.div
            className="h-full bg-accent/60"
            initial={{ width: "0%" }}
            animate={{ width: "85%" }}
            transition={{ duration: 3, ease: "easeOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/** Search engine bar shown while searching for a person online */
function SearchQueryBar({ query }: { query: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35 }}
      className="mb-6 w-full max-w-sm"
    >
      <div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} />
        <span className="truncate text-sm text-muted-foreground">{query}</span>
        <div className="ml-auto flex items-center gap-[3px]">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-1 w-1 rounded-full bg-accent"
              animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** Animated icon with orbiting ring for steps without a richer visual */
function StepIcon({ statusText }: { statusText: string }) {
  const Icon = statusText.includes("Building")
    ? Sparkles
    : statusText.includes("Reading") || statusText.includes("Analyzing")
      ? FileText
      : User;

  return (
    <div className="relative flex h-10 w-10 items-center justify-center">
      {/* Orbiting ring */}
      <motion.div
        className="absolute inset-0 rounded-full border border-accent/20"
        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Inner glow */}
      <motion.div
        className="absolute inset-1 rounded-full bg-accent/5"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <Icon className="relative h-5 w-5 text-accent" strokeWidth={1.5} />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function ProcessingFlow({
  input,
  inputType,
  platform,
  variant,
  profileText,
  onComplete,
}: ProcessingFlowProps) {
  const [view, setView] = useState<ViewState>({
    statusText: inputType === "name"
      ? "Searching for you online..."
      : inputType === "github"
        ? "Looking up your GitHub..."
        : inputType === "x"
          ? "Looking up your X profile..."
          : inputType === "instagram"
            ? "Looking up your Instagram..."
            : "Looking up your profile...",
  });

  const hasRun = useRef(false);
  const startTimeRef = useRef(Date.now());
  const searchQueryRef = useRef("");
  const lastViewChangeRef = useRef(Date.now());

  /** Enforce minimum dwell time before transitioning to the next view.
   *  Prevents any state from flashing by too quickly. */
  const MIN_STEP_MS = 2000;
  async function showView(next: ViewState) {
    const elapsed = Date.now() - lastViewChangeRef.current;
    if (elapsed < MIN_STEP_MS) {
      await minWait(MIN_STEP_MS - elapsed);
    }
    lastViewChangeRef.current = Date.now();
    setView(next);
  }

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPipeline() {
    let enrichedProfile: EnrichedProfile | undefined;
    let rawProfileText: string | undefined = profileText;
    let searchCitations: string[] = [];
    let resources: Resource[] = [];
    let geo: GeoData = { country: "Unknown", countryCode: "XX", isAuthoritarian: false };

    // Start fetching resources + geo in background immediately
    const bgFetch = Promise.all([fetchResources(), getGeoData()]);

    // ─── Scrape + Search helper (shared by GitHub, X, Instagram, other URL) ───

    async function scrapeAndSearch(
      scrapeUrl: string,
      fallbackQuery: string,
    ) {
      // Step 1: Scrape for profile data
      try {
        const res = await fetch("/api/scrape-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: scrapeUrl }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            enrichedProfile = data.profile;
            const details = buildDetailTags(data.profile);
            await showView({
              statusText: "Analyzing your background...",
              profile: data.profile,
              details: details.length > 0 ? details : undefined,
            });
          }
        }
      } catch { /* continue */ }

      // Step 2: Perplexity search
      const query = enrichedProfile?.fullName
        ? buildSearchQuery(enrichedProfile)
        : fallbackQuery;
      searchQueryRef.current = query;
      await showView({ statusText: "Searching online..." });

      try {
        const searchRes = await fetch("/api/search-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        if (searchRes.ok) {
          const data = await searchRes.json();
          if (data.text) {
            rawProfileText = data.text;
            searchCitations = data.citations ?? [];
            await showView({
              statusText: "Building your personalized plan...",
              citations: searchCitations,
              snippetLines: extractSnippetLines(data.text),
            });
          }
        }
      } catch { /* continue */ }
    }

    // ─── LinkedIn Flow ──────────────────────────────────

    if (inputType === "linkedin") {
      // Step 1: Quick scrape
      try {
        const res = await fetch("/api/scrape-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: input }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            enrichedProfile = data.profile;
            await showView({
              statusText: "Analyzing your background...",
              profile: data.profile,
            });
          }
        }
      } catch { /* continue */ }

      // Step 2: Full enrichment (Claude extraction)
      const enrichResult = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          return data.profile as EnrichedProfile | null;
        }
        return null;
      }).catch(() => null);

      if (enrichResult) {
        enrichedProfile = enrichResult;
        const details = buildDetailTags(enrichResult);
        if (details.length > 0) {
          await showView({
            statusText: "Analyzing your background...",
            profile: enrichResult,
            details,
          });
        }
      }

      // Step 3: Perplexity search
      if (enrichedProfile?.fullName) {
        const query = buildSearchQuery(enrichedProfile);
        searchQueryRef.current = query;
        await showView({ statusText: "Searching online..." });

        try {
          const searchRes = await fetch("/api/search-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          });
          if (searchRes.ok) {
            const data = await searchRes.json();
            if (data.text) {
              rawProfileText = data.text;
              searchCitations = data.citations ?? [];
              await showView({
                statusText: "Building your personalized plan...",
                citations: searchCitations,
                snippetLines: extractSnippetLines(data.text),
              });
            }
          }
        } catch { /* continue */ }
      }

    // ─── GitHub Flow ────────────────────────────────────

    } else if (inputType === "github") {
      await scrapeAndSearch(
        input,
        input.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/[/?#].*$/, ""),
      );

    // ─── X (Twitter) Flow ────────────────────────────────

    } else if (inputType === "x") {
      await scrapeAndSearch(
        input,
        input.replace(/^https?:\/\/(x\.com|twitter\.com)\//, "").replace(/[/?#].*$/, ""),
      );

    // ─── Instagram Flow ──────────────────────────────────

    } else if (inputType === "instagram") {
      await scrapeAndSearch(
        input,
        input.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/[/?#].*$/, ""),
      );

    // ─── Name Search Flow ───────────────────────────────

    } else if (inputType === "name") {
      searchQueryRef.current = input;
      if (rawProfileText) {
        await showView({
          statusText: "Building your personalized plan...",
          snippetLines: extractSnippetLines(rawProfileText),
        });
      } else {
        try {
          const res = await fetch("/api/search-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: input }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.text) {
              rawProfileText = data.text;
              searchCitations = data.citations ?? [];
              await showView({
                statusText: "Building your personalized plan...",
                citations: searchCitations,
                snippetLines: extractSnippetLines(data.text),
              });
            }
          }
        } catch { /* continue */ }
      }

    // ─── Other URL Flow ─────────────────────────────────

    } else {
      await scrapeAndSearch(input, input);
    }

    // ─── Fetch resources + geo (likely already done) ────

    // Enforce minimum dwell on the last view before moving on
    const elapsed = Date.now() - lastViewChangeRef.current;
    if (elapsed < MIN_STEP_MS) {
      await minWait(MIN_STEP_MS - elapsed);
    }

    // Ensure we're showing "Building..." during recommendation generation
    setView((prev) => ({
      ...prev,
      statusText: "Building your personalized plan...",
    }));

    const [fetchedResources, fetchedGeo] = await bgFetch;
    resources = fetchedResources;
    geo = fetchedGeo;
    identifyGeo(geo.countryCode);

    // ─── Generate recommendations ───────────────────────

    const answers: UserAnswers = {
      time: "significant",
      profileUrl: inputType !== "name" ? input : undefined,
      profilePlatform: platform,
      enrichedProfile,
      profileText: rawProfileText,
    };

    const hasProfile = !!enrichedProfile || !!rawProfileText || !!input;
    let items: ResultItem[];

    if (hasProfile) {
      items = await computeClaudeRanking(resources, answers, geo, variant);
    } else {
      items = computeAlgorithmicRanking(resources, answers, geo, variant);
    }

    // Persist user data
    const userId = getUserId();
    if (userId) {
      upsertUser(userId, {
        ...(enrichedProfile ? { profile_data: enrichedProfile } : {}),
        ...(platform ? { profile_platform: platform } : {}),
        ...(input && inputType !== "name" ? { profile_url: input } : {}),
        answers,
      }).catch(() => {});
    }

    trackResultsViewed(
      variant,
      answers.time,
      answers.intent,
      answers.positioned,
      answers.positionType,
      items.length,
      hasProfile ? "claude_personalized" : "algorithmic",
      Date.now() - startTimeRef.current,
    );

    onComplete(items, geo, answers);
  }

  // ── Ranking helpers ────────────────────────────────────

  async function computeClaudeRanking(
    resources: Resource[],
    userAnswers: UserAnswers,
    geoData: GeoData,
    v: Variant,
  ): Promise<ResultItem[]> {
    try {
      const userId = getUserId();
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: userAnswers.enrichedProfile,
          answers: userAnswers,
          geo: geoData,
          resources: resources.filter((r) => r.enabled),
          userId,
        }),
      });

      if (!res.ok) throw new Error("Recommendation API failed");

      const data = await res.json();
      const recs: RecommendedResource[] = data.recommendations || [];

      // Separate event/community from other recommendations
      const merged: ResultItem[] = [];
      let eventCommunityRec: RecommendedResource | null = null;
      let eventCommunityResource: Resource | null = null;

      for (const rec of recs) {
        const resource = resources.find((r) => r.id === rec.resourceId);
        if (!resource) continue;

        if (resource.category === "events" || resource.category === "communities") {
          if (!eventCommunityRec) {
            eventCommunityRec = rec;
            eventCommunityResource = resource;
          }
          continue;
        }

        merged.push({
          kind: "resource",
          scored: { resource, score: 1 / rec.rank, matchReasons: [] },
          customDescription: rec.description,
        });
      }

      // Build local card with Claude's chosen event/community as anchor
      const algorithmicLocalCard = buildLocalCard(resources, userAnswers, geoData, v);

      if (eventCommunityRec && eventCommunityResource) {
        const anchor: ScoredResource = {
          resource: eventCommunityResource,
          score: 1 / eventCommunityRec.rank,
          matchReasons: [],
        };
        const extras = algorithmicLocalCard
          ? [algorithmicLocalCard.anchor, ...algorithmicLocalCard.extras]
              .filter(s => s.resource.id !== eventCommunityResource!.id)
          : [];
        const localItem: ResultItem = {
          kind: "local",
          card: { anchor, extras, score: anchor.score, anchorDescription: eventCommunityRec.description },
        };
        const insertIdx = Math.min(eventCommunityRec.rank - 1, merged.length);
        merged.splice(insertIdx, 0, localItem);
      }
      // When Claude doesn't recommend an event/community, don't show the local card at all

      return merged.length > 0
        ? merged
        : computeAlgorithmicRanking(resources, userAnswers, geoData, v);
    } catch (err) {
      console.error("[processing] Claude ranking failed, falling back:", err);
      return computeAlgorithmicRanking(resources, userAnswers, geoData, v);
    }
  }

  function computeAlgorithmicRanking(
    resources: Resource[],
    userAnswers: UserAnswers,
    geoData: GeoData,
    v: Variant,
  ): ResultItem[] {
    const ranked = rankResources(resources, userAnswers, geoData, v);
    const localCard = buildLocalCard(resources, userAnswers, geoData, v);

    const merged: ResultItem[] = ranked.map((scored) => ({
      kind: "resource" as const,
      scored,
    }));

    if (localCard) {
      const insertIdx = merged.findIndex(
        (item) => item.kind === "resource" && item.scored.score < localCard.score,
      );
      if (insertIdx === -1) {
        merged.push({ kind: "local", card: localCard });
      } else {
        merged.splice(insertIdx, 0, { kind: "local", card: localCard });
      }
    } else {
      merged.push({ kind: "local", card: null });
    }

    return merged;
  }

  // ── Render ─────────────────────────────────────────────

  // Determine which visual element is active (URL bar, search bar, or fallback icon)
  const showUrlBar = !view.profile && !view.snippetLines && !view.citations &&
    inputType !== "name" && view.statusText.includes("Looking up");
  // Search bar only when no profile card is visible — avoids clutter
  const showSearchBar = !view.profile && !view.snippetLines && !view.citations &&
    view.statusText.includes("Searching") && searchQueryRef.current;
  const showStepIcon = !showUrlBar && !showSearchBar;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center"
          >
            {/* URL bar — shown while fetching a profile URL, before profile card appears */}
            <AnimatePresence>
              {showUrlBar && <FetchingUrlBar url={input} />}
            </AnimatePresence>

            {/* Profile card — fades in when available, fades out when search results arrive */}
            <AnimatePresence>
              {view.profile && !view.snippetLines && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.4 }}
                  className="mb-6 flex items-center gap-3"
                >
                  {view.profile.photo && (
                    <img
                      src={view.profile.photo}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    {view.profile.fullName && (
                      <p className="text-base font-semibold text-foreground">
                        {view.profile.fullName}
                      </p>
                    )}
                    {view.profile.headline && (
                      <p className="truncate text-sm text-muted-foreground">
                        {view.profile.headline}
                      </p>
                    )}
                    {!view.profile.headline &&
                      view.profile.currentTitle &&
                      view.profile.currentCompany && (
                        <p className="truncate text-sm text-muted-foreground">
                          {view.profile.currentTitle} at{" "}
                          {view.profile.currentCompany}
                        </p>
                      )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Detail tags — skills, experience, repos from enrichment */}
            <AnimatePresence>
              {view.details && view.details.length > 0 && !view.snippetLines && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.35 }}
                  className="mb-6 w-full max-w-sm"
                >
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {view.details.map((tag, i) => (
                      <motion.span
                        key={tag}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.08, duration: 0.2 }}
                        className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground"
                      >
                        {tag}
                      </motion.span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search bar — shown while searching for a person online */}
            <AnimatePresence>
              {showSearchBar && (
                <SearchQueryBar query={searchQueryRef.current} />
              )}
            </AnimatePresence>

            {/* Research card — snippets + sources integrated */}
            <AnimatePresence>
              {view.snippetLines && view.snippetLines.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.35 }}
                  className="mb-5 w-full max-w-sm"
                >
                  <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
                    <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                      {view.snippetLines.map((line, i) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.15, duration: 0.25 }}
                          className="flex gap-2"
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/50" />
                          <span>{line}</span>
                        </motion.li>
                      ))}
                    </ul>
                    {view.citations && view.citations.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: (view.snippetLines.length) * 0.15 + 0.2, duration: 0.3 }}
                        className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5"
                      >
                        {view.citations.slice(0, 4).map((url) => (
                          <span
                            key={url}
                            className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted"
                          >
                            {urlToHost(url)}
                          </span>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step icon + status text */}
            <div className="flex flex-col items-center gap-3">
              {showStepIcon && <StepIcon statusText={view.statusText} />}
              <AnimatePresence mode="wait">
                <motion.p
                  key={view.statusText}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-sm"
                >
                  <ShimmerText>{view.statusText.replace(/\.{3}$/, "")}</ShimmerText>
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

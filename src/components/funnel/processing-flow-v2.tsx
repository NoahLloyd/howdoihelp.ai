"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Sparkles, Check } from "lucide-react";
import { fetchResources } from "@/lib/data";
import { rankResources, buildLocalCard } from "@/lib/ranking";
import { getGeoData } from "@/lib/geo";
import { getUserId, upsertUser } from "@/lib/user";
import { identifyGeo, trackResultsViewed } from "@/lib/tracking";
import { detectPlatform } from "@/lib/profile";
import type {
  EnrichedProfile,
  Resource,
  GeoData,
  UserAnswers,
  ScoredResource,
  LocalCard,
  RecommendedResource,
  GuideRecommendation,
} from "@/types";

// Re-export the same ResultItem type used by the results page
export type ResultItem =
  | { kind: "resource"; scored: ScoredResource; customDescription?: string }
  | { kind: "local"; card: LocalCard | null }
  | { kind: "guide"; recommendation: GuideRecommendation };

// ─── Types ──────────────────────────────────────────────────

interface ProcessingFlowV2Props {
  text: string;
  urls: string[];
  onComplete: (
    items: ResultItem[],
    geo: GeoData,
    answers: UserAnswers,
  ) => void;
}

// ─── Helpers ────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitAtLeast(ms: number, since: number) {
  const remaining = ms - (Date.now() - since);
  if (remaining > 0) await wait(remaining);
}

function urlToHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function platformLabel(url: string): string {
  const platform = detectPlatform(url);
  const labels: Record<string, string> = {
    linkedin: "LinkedIn",
    github: "GitHub",
    x: "X",
    instagram: "Instagram",
    facebook: "Facebook",
    personal_website: urlToHost(url),
  };
  return labels[platform] ?? urlToHost(url);
}

function platformColor(url: string): string {
  const platform = detectPlatform(url);
  const colors: Record<string, string> = {
    linkedin: "#0A66C2",
    github: "#8B5CF6",
    x: "#1DA1F2",
    instagram: "#E4405F",
  };
  return colors[platform] ?? "var(--primary)";
}

function buildDetailTags(profile: EnrichedProfile): string[] {
  const tags: string[] = [];
  if (profile.currentTitle && profile.currentCompany) {
    tags.push(`${profile.currentTitle} at ${profile.currentCompany}`);
  } else if (profile.currentCompany) {
    tags.push(profile.currentCompany);
  }
  for (const skill of (profile.skills || []).slice(0, 4)) {
    if (skill.length < 40 && !skill.startsWith("Volunteer:") && !skill.startsWith("Publication:") && !skill.startsWith("Language:")) {
      tags.push(skill);
    }
  }
  if (profile.repos) {
    for (const repo of profile.repos.slice(0, 3)) {
      tags.push(repo.language ? `${repo.name} (${repo.language})` : repo.name);
    }
  }
  for (const edu of (profile.education || []).slice(0, 2)) {
    if (edu.school) tags.push(edu.school);
  }
  return tags.slice(0, 6);
}

// ─── Shared transition ──────────────────────────────────────

const EASE = [0.25, 0.1, 0.25, 1] as const;

const sceneTransition = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.45, ease: EASE },
};

// ─── Scene Components ───────────────────────────────────────

/**
 * Browser chrome card for fetching a URL.
 * When `done` flips to true the progress bar fills, a check replaces
 * the lock, and the status text updates — all in-place, no scene change.
 */
function SceneFetching({
  url,
  color,
  done,
}: {
  url: string;
  color: string;
  done: boolean;
}) {
  return (
    <motion.div {...sceneTransition} className="flex w-full flex-col items-center gap-5">
      <div className="w-full max-w-xs overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Browser dots */}
        <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-2">
          <div className="h-[7px] w-[7px] rounded-full bg-muted/20" />
          <div className="h-[7px] w-[7px] rounded-full bg-muted/20" />
          <div className="h-[7px] w-[7px] rounded-full bg-muted/20" />
        </div>

        {/* Address bar */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div
                key="check"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
              >
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color }} strokeWidth={2.5} />
              </motion.div>
            ) : (
              <motion.div key="lock" exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
                <Lock className="h-3 w-3 shrink-0 text-muted/40" strokeWidth={2} />
              </motion.div>
            )}
          </AnimatePresence>
          <span className="truncate text-xs text-muted-foreground">{urlToHost(url)}</span>
        </div>

        {/* Progress bar */}
        <div className="h-[2px] bg-border/30">
          <motion.div
            className="h-full"
            style={{ backgroundColor: color }}
            initial={{ width: "0%" }}
            animate={{ width: done ? "100%" : "85%" }}
            transition={
              done
                ? { duration: 0.3, ease: "easeOut" }
                : { duration: 8, ease: "easeOut" }
            }
          />
        </div>
      </div>

      {/* Status text — fades out but keeps its space so the card doesn't jump */}
      <motion.p
        animate={{ opacity: done ? 0 : 1 }}
        transition={{ duration: 0.25 }}
        className="text-sm"
        aria-hidden={done}
      >
        <ShimmerText>{`Fetching your ${platformLabel(url)}`}</ShimmerText>
      </motion.p>
    </motion.div>
  );
}

/** Getting to know the user from free-text input */
function SceneReading() {
  return (
    <motion.div {...sceneTransition} className="flex flex-col items-center gap-5">
      {/* Blinking cursor bar */}
      <div className="flex items-center gap-2">
        <div className="flex gap-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="h-4 rounded-[2px] bg-accent/25"
              initial={{ width: 0 }}
              animate={{ width: [0, 12 + i * 6, 12 + i * 6] }}
              transition={{ delay: 0.3 + i * 0.12, duration: 0.4, ease: "easeOut" }}
            />
          ))}
        </div>
        <motion.div
          className="h-5 w-[2px] rounded-full bg-accent"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear", times: [0, 0.5, 1] }}
        />
      </div>
      <p className="text-sm">
        <ShimmerText>Getting to know you</ShimmerText>
      </p>
    </motion.div>
  );
}

/** Profile card with detail tags */
function SceneProfile({ profile }: { profile: EnrichedProfile }) {
  const tags = buildDetailTags(profile);

  return (
    <motion.div {...sceneTransition} className="flex w-full flex-col items-center gap-5">
      <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {profile.photo && (
            <motion.img
              src={profile.photo}
              alt=""
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 350, damping: 25, delay: 0.15 }}
              className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-border"
            />
          )}
          <div className="min-w-0">
            {profile.fullName && (
              <p className="text-[15px] font-semibold text-foreground leading-tight">
                {profile.fullName}
              </p>
            )}
            {(profile.headline || (profile.currentTitle && profile.currentCompany)) && (
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground leading-tight">
                {profile.headline || `${profile.currentTitle} at ${profile.currentCompany}`}
              </p>
            )}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <motion.span
                key={tag}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.07 }}
                className="rounded-full border border-border bg-card-hover px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {tag}
              </motion.span>
            ))}
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">Found you</p>
    </motion.div>
  );
}

/**
 * Building recommendations — circular progress ring that fills smoothly
 * over time using a decelerating curve, then snaps to 100% when `done`.
 *
 * The ring targets ~90% over 15s using requestAnimationFrame with an
 * ease-out curve (fast start, slows down toward the end). When `done`
 * flips to true it jumps to 100%.
 */
function SceneRecommending({ done }: { done: boolean }) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (done) {
      cancelAnimationFrame(rafRef.current);
      setProgress(1);
      return;
    }

    const DURATION = 15_000; // 15s to reach ~90%
    const MAX = 0.9;

    function tick() {
      const elapsed = Date.now() - startRef.current;
      const t = Math.min(elapsed / DURATION, 1);
      // ease-out cubic — fast start, decelerates
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased * MAX);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [done]);

  const size = 56;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <motion.div {...sceneTransition} className="flex flex-col items-center gap-5">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        {/* Track ring */}
        <svg className="absolute inset-0" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-border/40"
            strokeWidth={strokeWidth}
          />
        </svg>

        {/* Progress ring */}
        <svg
          className="absolute inset-0"
          width={size}
          height={size}
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: done ? "stroke-dashoffset 0.4s ease-out" : "none" }}
          />
        </svg>

        {/* Inner glow */}
        <motion.div
          className="absolute inset-3 rounded-full bg-accent/6"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Icon */}
        <Sparkles className="relative h-5 w-5 text-accent" strokeWidth={1.5} />
      </div>

      <p className="text-sm">
        <ShimmerText>Building your personalized plan</ShimmerText>
      </p>
    </motion.div>
  );
}

// ─── Tiny shared visuals ────────────────────────────────────

function ShimmerText({ children }: { children: string }) {
  return <span className="shimmer text-muted-foreground/70">{children}</span>;
}

function PulsingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-accent/60"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

type Scene =
  | { kind: "reading" }
  | { kind: "fetching"; url: string; color: string; done: boolean }
  | { kind: "profile"; profile: EnrichedProfile }
  | { kind: "recommending"; done: boolean };

export function ProcessingFlowV2({
  text,
  urls,
  onComplete,
}: ProcessingFlowV2Props) {
  const [scene, setScene] = useState<Scene>(
    urls.length > 0
      ? { kind: "fetching", url: urls[0], color: platformColor(urls[0]), done: false }
      : { kind: "reading" },
  );
  const hasRun = useRef(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPipeline() {
    try {
      await runPipelineInner();
    } catch (err) {
      console.error("[processing-flow] Pipeline crashed:", err);
      // Fall back to algorithmic results so the user never sees "Something went wrong"
      try {
        const [resources, geo] = await Promise.all([fetchResources(), getGeoData()]);
        const answers: UserAnswers = { time: "significant", profileText: text };
        const ranked = rankResources(resources, answers, geo, "A");
        const localCard = buildLocalCard(resources, answers, geo, "A");
        const items: ResultItem[] = ranked.map((scored) => ({ kind: "resource" as const, scored }));
        if (localCard) items.push({ kind: "local", card: localCard });
        else items.push({ kind: "local", card: null });
        onComplete(items, geo, answers);
      } catch {
        // Even the fallback failed — show empty results rather than crashing
        onComplete([], { country: "Unknown", countryCode: "XX", isAuthoritarian: false }, { time: "significant" });
      }
    }
  }

  async function runPipelineInner() {
    let enrichedProfile: EnrichedProfile | undefined;
    let rawProfileText: string | undefined;

    // Start background work immediately — warm up serverless functions
    const bgFetch = Promise.all([fetchResources(), getGeoData()]);

    // ─── Phase 1: Fetch URLs ────────────────────────────
    // Fire ALL scrape requests in parallel immediately so serverless
    // cold starts overlap, but display them sequentially in the UI.

    if (urls.length > 0) {
      // Kick off all fetches at once
      const scrapePromises = urls.map((url) =>
        fetch("/api/scrape-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
          .then(async (res) => (res.ok ? (await res.json()).profile : null))
          .catch(() => null),
      );

      // Show each URL scene sequentially, but the network is already in flight
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const color = platformColor(url);
        const sceneStart = Date.now();

        setScene({ kind: "fetching", url, color, done: false });

        // Wait for THIS url's scrape to finish (already running in background)
        const profile = await scrapePromises[i];
        if (profile) {
          if (!enrichedProfile) {
            enrichedProfile = profile;
          } else {
            mergeProfile(enrichedProfile, profile);
          }
        }

        // Ensure the scene was visible long enough for the animation
        await waitAtLeast(1800, sceneStart);

        // Flip to done — check + filled bar animate in-place
        setScene({ kind: "fetching", url, color, done: true });
        await wait(700);
      }

      // Show profile card if we found one
      if (enrichedProfile && (enrichedProfile.fullName || enrichedProfile.photo)) {
        setScene({ kind: "profile", profile: enrichedProfile });
        await wait(2200);
      }

    } else {
      // No URLs — just reading text
      await wait(1800);
    }

    // ─── Phase 2: Recommendations ───────────────────────

    setScene({ kind: "recommending", done: false });

    // Build profile text
    const scrapedParts: string[] = [];
    if (text) scrapedParts.push(`[User's self-description]\n${text}`);
    if (enrichedProfile?.fullName) {
      const parts: string[] = [];
      if (enrichedProfile.fullName) parts.push(`Name: ${enrichedProfile.fullName}`);
      if (enrichedProfile.headline) parts.push(`Headline: ${enrichedProfile.headline}`);
      if (enrichedProfile.currentTitle && enrichedProfile.currentCompany) {
        parts.push(`Role: ${enrichedProfile.currentTitle} at ${enrichedProfile.currentCompany}`);
      }
      scrapedParts.push(`[Profile data]\n${parts.join(", ")}`);
    }
    rawProfileText = scrapedParts.join("\n\n") || text;

    const [resources, geo] = await bgFetch;
    identifyGeo(geo.countryCode);

    const answers: UserAnswers = {
      time: "significant",
      profilePlatform: "other",
      enrichedProfile,
      profileText: rawProfileText,
    };

    let items: ResultItem[];
    try {
      items = await computeClaudeRanking(resources, answers, geo);
    } catch {
      items = computeAlgorithmicRanking(resources, answers, geo);
    }

    // Snap ring to 100%
    setScene({ kind: "recommending", done: true });
    await wait(500);

    const userId = getUserId();
    if (userId) {
      upsertUser(userId, {
        ...(enrichedProfile ? { profile_data: enrichedProfile } : {}),
        profile_platform: "other",
        answers,
      }).catch(() => {});
    }

    trackResultsViewed(
      "A",
      answers.time,
      answers.intent,
      answers.positioned,
      answers.positionType,
      items.length,
      "claude_personalized",
      Date.now() - startTimeRef.current,
    );

    await wait(500);
    onComplete(items, geo, answers);
  }

  // ── Profile merge ───────────────────────────────────────

  function mergeProfile(base: EnrichedProfile, extra: EnrichedProfile) {
    if (!base.fullName && extra.fullName) base.fullName = extra.fullName;
    if (!base.headline && extra.headline) base.headline = extra.headline;
    if (!base.currentTitle && extra.currentTitle) base.currentTitle = extra.currentTitle;
    if (!base.currentCompany && extra.currentCompany) base.currentCompany = extra.currentCompany;
    if (!base.photo && extra.photo) base.photo = extra.photo;
    if (extra.skills?.length > 0) {
      if (!base.skills) base.skills = [];
      const existing = new Set(base.skills);
      for (const s of extra.skills) {
        if (!existing.has(s)) base.skills.push(s);
      }
    }
    if (extra.experience?.length > 0) {
      if (!base.experience) base.experience = [];
      base.experience.push(...extra.experience);
    }
    if (extra.education?.length > 0) {
      if (!base.education) base.education = [];
      base.education.push(...extra.education);
    }
    if (extra.repos && extra.repos.length > 0) base.repos = [...(base.repos || []), ...extra.repos];
  }

  // ── Ranking helpers ────────────────────────────────────

  async function computeClaudeRanking(
    resources: Resource[],
    userAnswers: UserAnswers,
    geoData: GeoData,
  ): Promise<ResultItem[]> {
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
    const guideRec: GuideRecommendation | undefined = data.guideRecommendation;

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

    const algorithmicLocalCard = buildLocalCard(resources, userAnswers, geoData, "A");

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

    if (guideRec) {
      const guideIdx = Math.min(guideRec.rank - 1, merged.length);
      merged.splice(guideIdx, 0, { kind: "guide", recommendation: guideRec });
    }

    return merged.length > 0
      ? merged
      : computeAlgorithmicRanking(resources, userAnswers, geoData);
  }

  function computeAlgorithmicRanking(
    resources: Resource[],
    userAnswers: UserAnswers,
    geoData: GeoData,
  ): ResultItem[] {
    const ranked = rankResources(resources, userAnswers, geoData, "A");
    const localCard = buildLocalCard(resources, userAnswers, geoData, "A");

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

  // Use url as key so same-url done-flip doesn't trigger a scene crossfade
  const sceneKey =
    scene.kind === "fetching" ? `fetch-${scene.url}` : scene.kind;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(13,147,115,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <AnimatePresence mode="wait">
          {scene.kind === "reading" && <SceneReading key="reading" />}
          {scene.kind === "fetching" && (
            <SceneFetching
              key={sceneKey}
              url={scene.url}
              color={scene.color}
              done={scene.done}
            />
          )}
          {scene.kind === "profile" && (
            <SceneProfile key="profile" profile={scene.profile} />
          )}
          {scene.kind === "recommending" && (
            <SceneRecommending key="recommending" done={scene.done} />
          )}
        </AnimatePresence>

      </div>
    </main>
  );
}

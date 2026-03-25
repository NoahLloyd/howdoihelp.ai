"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchResources } from "@/lib/data";
import { rankResources, buildLocalCard } from "@/lib/ranking";
import { getGeoData } from "@/lib/geo";
import { getUserId, upsertUser } from "@/lib/user";
import { identifyGeo, trackResultsViewed } from "@/lib/tracking";
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

function minWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main Component ─────────────────────────────────────────

export function ProcessingFlowV2({
  text,
  urls,
  onComplete,
}: ProcessingFlowV2Props) {
  const [profile, setProfile] = useState<EnrichedProfile | undefined>();
  const [statusText, setStatusText] = useState("Reading your profile");
  const [elapsed, setElapsed] = useState(0);
  const hasRun = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Elapsed time counter
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPipeline() {
    let enrichedProfile: EnrichedProfile | undefined;
    let rawProfileText: string | undefined;
    let resources: Resource[] = [];
    let geo: GeoData = { country: "Unknown", countryCode: "XX", isAuthoritarian: false };

    const bgFetch = Promise.all([fetchResources(), getGeoData()]);

    // ─── Summarize profile ──────────────────────────────

    try {
      const res = await fetch("/api/summarize-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, urls }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          enrichedProfile = data.profile;
          setProfile(data.profile);
        }
        if (data.profileText) {
          rawProfileText = data.profileText;
        }
      }
    } catch { /* continue */ }

    if (!rawProfileText) rawProfileText = text;

    setStatusText("Finding your matches");

    // ─── Fetch resources + geo ──────────────────────────

    const [fetchedResources, fetchedGeo] = await bgFetch;
    resources = fetchedResources;
    geo = fetchedGeo;
    identifyGeo(geo.countryCode);

    // ─── Generate recommendations ───────────────────────

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

    await minWait(400);
    onComplete(items, geo, answers);
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

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center">
        {/* Profile card */}
        <AnimatePresence>
          {profile && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-8 flex items-center gap-3"
            >
              {profile.photo && (
                <img
                  src={profile.photo}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              )}
              <div className="min-w-0">
                {profile.fullName && (
                  <p className="text-[15px] font-semibold text-foreground">
                    {profile.fullName}
                  </p>
                )}
                {(profile.headline || (profile.currentTitle && profile.currentCompany)) && (
                  <p className="truncate text-[13px] text-muted-foreground">
                    {profile.headline || `${profile.currentTitle} at ${profile.currentCompany}`}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spinner + status */}
        <div className="flex flex-col items-center gap-4">
          {/* Pulsing dot */}
          <motion.div
            className="h-2 w-2 rounded-full bg-accent"
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Status text */}
          <AnimatePresence mode="wait">
            <motion.p
              key={statusText}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-[13px] text-muted-foreground"
            >
              {statusText}
            </motion.p>
          </AnimatePresence>

          {/* Elapsed time */}
          <p className="text-[11px] text-muted/40">
            {elapsed}s
          </p>
        </div>
      </div>
    </main>
  );
}

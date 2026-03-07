"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchResources, trackClick } from "@/lib/data";
import { rankResources, buildLocalCard } from "@/lib/ranking";
import { getGeoData } from "@/lib/geo";
import {
  trackResultsViewed,
  trackResourceClicked,
  trackStackExpanded,
} from "@/lib/tracking";
import { getUserId, upsertUser } from "@/lib/user";
import { identifyGeo } from "@/lib/tracking";
import type {
  Resource,
  UserAnswers,
  Variant,
  GeoData,
  ScoredResource,
  LocalCard,
  RecommendedResource,
  GuideRecommendation,
} from "@/types";
import { ResourceCard } from "@/components/results/resource-card";
import { GuideCard } from "@/components/results/guide-card";
import { LocationPicker } from "@/components/results/location-picker";

/** A result item is either a normal scored resource, the local card, or a guide recommendation */
type ResultItem =
  | { kind: "resource"; scored: ScoredResource; customDescription?: string; matchReason?: string }
  | { kind: "local"; card: LocalCard | null }
  | { kind: "guide"; recommendation: GuideRecommendation };

interface ResultsProps {
  variant: Variant;
  answers: UserAnswers;
  /** Pre-computed items from ProcessingFlow (Variant A) - skips init when provided */
  precomputedItems?: ResultItem[];
  /** Pre-computed geo from ProcessingFlow */
  precomputedGeo?: GeoData;
}

export function Results({ variant, answers, precomputedItems, precomputedGeo }: ResultsProps) {
  const [items, setItems] = useState<ResultItem[]>(precomputedItems ?? []);
  const [geo, setGeo] = useState<GeoData | null>(precomputedGeo ?? null);
  const [localGeo, setLocalGeo] = useState<GeoData | null>(precomputedGeo ?? null);
  const [allResources, setAllResources] = useState<Resource[] | null>(null);
  const [loading, setLoading] = useState(!precomputedItems);
  const localCardIndexRef = useRef<number | null>(null);
  const startTimeRef = useRef(Date.now());

  // When precomputed items are provided, find the local card index
  // and fetch resources for location change support
  useEffect(() => {
    if (!precomputedItems) return;
    const idx = precomputedItems.findIndex((item) => item.kind === "local");
    localCardIndexRef.current = idx >= 0 ? idx : null;
    fetchResources().then(setAllResources);
  }, [precomputedItems]);

  useEffect(() => {
    // Skip init when precomputed items are provided (Variant A processing flow)
    if (precomputedItems) return;

    async function init() {
      const resources = await fetchResources();
      const geoData: GeoData = await getGeoData();
      setAllResources(resources);
      setGeo(geoData);
      setLocalGeo(geoData);
      identifyGeo(geoData.countryCode);

      const hasProfile = !!answers.enrichedProfile || !!answers.profileUrl || !!answers.profileText;
      let merged: ResultItem[];
      let resultSource: "algorithmic" | "claude_personalized" = "algorithmic";

      if (hasProfile) {
        resultSource = "claude_personalized";
        merged = await computeClaudeRanking(resources, answers, geoData);
      } else {
        merged = computeAlgorithmicRanking(resources, answers, geoData, variant);
      }

      setItems(merged);

      // Persist user data
      const userId = getUserId();
      if (userId) {
        upsertUser(userId, {
          ...(answers.enrichedProfile ? { profile_data: answers.enrichedProfile } : {}),
          ...(answers.profilePlatform ? { profile_platform: answers.profilePlatform } : {}),
          ...(answers.profileUrl ? { profile_url: answers.profileUrl } : {}),
          answers,
        }).catch(() => {});
      }

      trackResultsViewed(
        variant,
        answers.time,
        answers.intent,
        answers.positioned,
        answers.positionType,
        merged.length,
        resultSource,
        Date.now() - startTimeRef.current
      );

      setLoading(false);
    }

    init();
  }, [variant, answers, precomputedItems]);

  /** Claude-powered ranking for Variant A with profile data */
  async function computeClaudeRanking(
    resources: Resource[],
    userAnswers: UserAnswers,
    geoData: GeoData
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
      const guideRec: GuideRecommendation | undefined = data.guideRecommendation;

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
          matchReason: rec.matchReason,
        });
      }

      // Build local card with Claude's chosen event/community as anchor
      const algorithmicLocalCard = buildLocalCard(resources, userAnswers, geoData, variant);

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
        const localIdx = Math.min(eventCommunityRec.rank - 1, merged.length);
        localCardIndexRef.current = localIdx;
        merged.splice(localIdx, 0, {
          kind: "local",
          card: { anchor, extras, score: anchor.score, anchorDescription: eventCommunityRec.description },
        });
      }
      // When Claude doesn't recommend an event/community, don't show the local card at all

      // Insert guide recommendation at its rank position
      if (guideRec) {
        const guideIdx = Math.min(guideRec.rank - 1, merged.length);
        merged.splice(guideIdx, 0, { kind: "guide", recommendation: guideRec });
      }

      return merged.length > 0
        ? merged
        : computeAlgorithmicRanking(resources, userAnswers, geoData, variant);
    } catch (err) {
      console.error("[results] Claude ranking failed, falling back:", err);
      return computeAlgorithmicRanking(resources, userAnswers, geoData, variant);
    }
  }

  /** Standard algorithmic ranking */
  function computeAlgorithmicRanking(
    resources: Resource[],
    userAnswers: UserAnswers,
    geoData: GeoData,
    v: Variant
  ): ResultItem[] {
    const ranked = rankResources(resources, userAnswers, geoData, v);
    const localCard = buildLocalCard(resources, userAnswers, geoData, v);

    const merged: ResultItem[] = ranked.map((scored) => ({
      kind: "resource" as const,
      scored,
    }));

    const localItem: ResultItem = { kind: "local", card: localCard };

    if (localCard) {
      const insertIdx = merged.findIndex(
        (item) =>
          item.kind === "resource" && item.scored.score < localCard.score
      );
      if (insertIdx === -1) {
        localCardIndexRef.current = merged.length;
        merged.push(localItem);
      } else {
        localCardIndexRef.current = insertIdx;
        merged.splice(insertIdx, 0, localItem);
      }
    } else {
      localCardIndexRef.current = merged.length;
      merged.push(localItem);
    }

    return merged;
  }

  // Re-rank only the local card when the user picks a new location
  const handleLocationChange = useCallback(
    (newGeo: GeoData) => {
      setLocalGeo(newGeo);
      if (!allResources || localCardIndexRef.current === null) return;

      const newLocalCard = buildLocalCard(allResources, answers, newGeo, variant);

      setItems((prev) => {
        const updated = [...prev];
        const idx = localCardIndexRef.current!;
        updated[idx] = { kind: "local", card: newLocalCard };
        return updated;
      });
    },
    [allResources, answers, variant]
  );

  const handleResourceClick = useCallback(
    (resourceId: string, position: number) => {
      if (geo) {
        trackClick(resourceId, variant, answers, geo.countryCode);

        let found: ScoredResource | undefined;
        for (const item of items) {
          if (item.kind === "resource" && item.scored.resource.id === resourceId) {
            found = item.scored;
            break;
          }
          if (item.kind === "local" && item.card) {
            if (item.card.anchor.resource.id === resourceId) {
              found = item.card.anchor;
              break;
            }
            found = item.card.extras.find((e) => e.resource.id === resourceId);
            if (found) break;
          }
        }

        if (found) {
          trackResourceClicked(
            resourceId,
            found.resource.title,
            found.resource.category,
            variant,
            position
          );
        }
      }
    },
    [answers, variant, geo, items]
  );

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="shimmer text-muted-foreground/70 text-sm">Finding the best ways you can help</span>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Here&apos;s how you can help.
          </h1>
        </motion.div>

        {/* All Recommendations — ranked equally */}
        {items.length > 0 && (
          <motion.div
            className="mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <div className="flex flex-col gap-3">
              {items.map((item, i) => {
                const key =
                  item.kind === "resource"
                    ? item.scored.resource.id
                    : item.kind === "guide"
                      ? `guide-${item.recommendation.guideId}`
                      : "local-card";
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                  >
                    <ResultItemRenderer
                      item={item}
                      variant={variant}
                      geo={localGeo}
                      onClickTrack={(id) => handleResourceClick(id, i)}
                      onLocationChange={handleLocationChange}
                    />
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        <div className="pb-8" />
      </div>
    </main>
  );
}

// ─── Result Item Renderer ────────────────────────────────────

interface ResultItemRendererProps {
  item: ResultItem;
  variant: Variant;
  geo: GeoData | null;
  isPrimary?: boolean;
  onClickTrack: (resourceId: string) => void;
  onLocationChange: (geo: GeoData) => void;
}

function ResultItemRenderer({
  item,
  variant,
  geo,
  isPrimary,
  onClickTrack,
  onLocationChange,
}: ResultItemRendererProps) {
  if (item.kind === "local") {
    return (
      <LocalCardGroup
        card={item.card}
        variant={variant}
        geo={geo}
        onClickTrack={onClickTrack}
        onLocationChange={onLocationChange}
      />
    );
  }

  if (item.kind === "guide") {
    return (
      <GuideCard
        recommendation={item.recommendation}
        isPrimary={isPrimary}
      />
    );
  }

  return (
    <ResourceCard
      scored={item.scored}
      variant={variant}
      isPrimary={isPrimary}
      customDescription={item.customDescription}
      matchReason={item.matchReason}
      onClickTrack={(id) => onClickTrack(id)}
    />
  );
}

// ─── Local Card Group Component ──────────────────────────────

interface LocalCardGroupProps {
  card: LocalCard | null;
  variant: Variant;
  geo: GeoData | null;
  onClickTrack: (resourceId: string) => void;
  onLocationChange: (geo: GeoData) => void;
}

function LocalCardGroup({ card, variant, geo, onClickTrack, onLocationChange }: LocalCardGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const extras = card?.extras ?? [];

  // Build a label from what's actually in the card
  const hasCommunities = card
    ? (card.anchor.resource.category === "communities" ||
       card.extras.some((e) => e.resource.category === "communities"))
    : false;
  const hasEvents = card
    ? (card.anchor.resource.category === "events" ||
       card.extras.some((e) => e.resource.category === "events"))
    : false;
  const label = hasCommunities && hasEvents
    ? "communities & events"
    : hasCommunities
      ? "communities"
      : hasEvents
        ? "events"
        : "communities & events";

  if (!card) {
    // Empty state - no events/communities at this location
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-5">
        <p className="text-sm text-muted-foreground">
          No {label} found
          {geo ? (
            <> near <LocationPicker geo={geo} onLocationChange={onLocationChange} /></>
          ) : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <ResourceCard
        scored={card.anchor}
        variant={variant}
        customDescription={card.anchorDescription}
        onClickTrack={onClickTrack}
      />

      {/* Expand bar with integrated location picker */}
      {extras.length > 0 && (
        <div className="relative mt-[-4px] ml-2 mr-2">
          {!expanded && (
            <div className="absolute inset-x-1 top-0 h-3 rounded-b-xl border border-t-0 border-border bg-card/60" />
          )}

          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              const willExpand = !expanded;
              setExpanded(willExpand);
              if (willExpand) {
                trackStackExpanded(variant, extras.length);
              }
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
            className="relative z-10 mt-1 flex w-full cursor-pointer items-center justify-between rounded-b-xl border border-t-0 border-border bg-card/80 px-4 py-2.5 text-left transition-colors hover:bg-card-hover"
          >
            <span className="text-xs text-muted-foreground">
              {extras.length} more {label}
              {geo && (
                <> near<LocationPicker geo={geo} onLocationChange={onLocationChange} /></>
              )}
            </span>
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-muted-foreground text-xs"
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
                      variant={variant}
                      onClickTrack={onClickTrack}
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
            Near <LocationPicker geo={geo} onLocationChange={onLocationChange} />
          </div>
        </div>
      )}
    </div>
  );
}

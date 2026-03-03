"use client";

import { useState, useEffect, useCallback } from "react";
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
import type {
  UserAnswers,
  Variant,
  GeoData,
  ScoredResource,
  LocalCard,
  Resource,
  RecommendedResource,
} from "@/types";
import { ResourceCard } from "@/components/results/resource-card";

/** A result item is either a normal scored resource or the local card */
type ResultItem =
  | { kind: "resource"; scored: ScoredResource; customTitle?: string; customDescription?: string }
  | { kind: "local"; card: LocalCard };

interface ResultsProps {
  variant: Variant;
  answers: UserAnswers;
}

export function Results({ variant, answers }: ResultsProps) {
  const [items, setItems] = useState<ResultItem[]>([]);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Finding the best ways you can help...");

  useEffect(() => {
    async function compute() {
      const resources = await fetchResources();
      const geoData: GeoData = await getGeoData();
      setGeo(geoData);

      const hasProfileData = !!answers.enrichedProfile || !!answers.profileUrl;
      let merged: ResultItem[];

      if (hasProfileData) {
        // Claude-powered ranking — works with full profile or just a URL
        setLoadingMessage("Personalizing your recommendations...");
        merged = await computeClaudeRanking(resources, answers, geoData);
      } else {
        // Algorithmic ranking (fallback — no profile at all)
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
        answers.intents || answers.intent,
        answers.positioned,
        answers.positionType,
        merged.length
      );

      setLoading(false);
    }

    compute();
  }, [variant, answers]);

  /** Use Claude to rank resources when we have an enriched profile */
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
          resources,
          userId: userId || undefined,
        }),
      });

      if (!res.ok) throw new Error("Recommendation API failed");

      const data = await res.json();
      const recommendations: RecommendedResource[] = data.recommendations || [];

      // Save recommendations to user record
      if (userId && recommendations.length > 0) {
        upsertUser(userId, { last_recommendations: recommendations }).catch(() => {});
      }

      // Build result items from Claude's ranking
      const resourceMap = new Map(resources.map((r) => [r.id, r]));
      const pickedIds = new Set<string>();
      const items: ResultItem[] = [];

      for (const rec of recommendations) {
        const resource = resourceMap.get(rec.resourceId);
        if (!resource) continue;
        pickedIds.add(rec.resourceId);

        items.push({
          kind: "resource",
          scored: {
            resource,
            score: 1 - rec.rank / recommendations.length,
            matchReasons: [rec.description],
          },
          customTitle: rec.title,
          customDescription: rec.description,
        });
      }

      // Build a local card from remaining events/communities Claude didn't pick
      const remainingLocal = resources.filter(
        (r) => !pickedIds.has(r.id) && (r.category === "events" || r.category === "communities")
      );
      if (remainingLocal.length > 0) {
        const localCard = buildLocalCard(remainingLocal, userAnswers, geoData, variant);
        if (localCard) {
          // Insert after Claude's picked event/community, or at the end
          const eventIdx = items.findIndex(
            (i) => i.kind === "resource" &&
              (i.scored.resource.category === "events" || i.scored.resource.category === "communities")
          );
          const insertAt = eventIdx >= 0 ? eventIdx + 1 : items.length;
          items.splice(insertAt, 0, { kind: "local", card: localCard });
        }
      }

      return items;
    } catch {
      // Fall back to algorithmic ranking
      return computeAlgorithmicRanking(resources, userAnswers, geoData, variant);
    }
  }

  /** Standard algorithmic ranking (no profile) */
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

    if (localCard) {
      const insertIdx = merged.findIndex(
        (item) =>
          item.kind === "resource" && item.scored.score < localCard.score
      );
      const localItem: ResultItem = { kind: "local", card: localCard };

      if (insertIdx === -1) {
        merged.push(localItem);
      } else {
        merged.splice(insertIdx, 0, localItem);
      }
    }

    return merged;
  }

  const handleResourceClick = useCallback(
    (resourceId: string, position: number) => {
      if (geo) {
        trackClick(resourceId, variant, answers, geo.countryCode);

        // Find the resource across all items for richer tracking
        let found: ScoredResource | undefined;
        for (const item of items) {
          if (item.kind === "resource" && item.scored.resource.id === resourceId) {
            found = item.scored;
            break;
          }
          if (item.kind === "local") {
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
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-muted-foreground">{loadingMessage}</p>
        </motion.div>
      </main>
    );
  }

  const primary = items[0];
  const secondary = items.slice(1);

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

        {/* Primary Recommendation */}
        {primary && (
          <motion.div
            className="mt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-accent">
              Your #1 action
            </p>
            <ResultItemRenderer
              item={primary}
              variant={variant}
              geo={geo}
              isPrimary
              onClickTrack={(id) => handleResourceClick(id, 0)}
            />
          </motion.div>
        )}

        {/* Secondary Recommendations */}
        {secondary.length > 0 && (
          <motion.div
            className="mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            <p className="mb-3 text-sm text-muted-foreground">
              Also check out
            </p>
            <div className="flex flex-col gap-3">
              {secondary.map((item, i) => {
                const key =
                  item.kind === "resource"
                    ? item.scored.resource.id
                    : `local-card-${item.card.anchor.resource.id}`;
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                  >
                    <ResultItemRenderer
                      item={item}
                      variant={variant}
                      geo={geo}
                      onClickTrack={(id) => handleResourceClick(id, i + 1)}
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
}

function ResultItemRenderer({
  item,
  variant,
  geo,
  isPrimary,
  onClickTrack,
}: ResultItemRendererProps) {
  if (item.kind === "local") {
    return (
      <StackedGroup
        anchor={item.card.anchor}
        extras={item.card.extras}
        variant={variant}
        geo={geo}
        onClickTrack={onClickTrack}
      />
    );
  }

  return (
    <ResourceCard
      scored={item.scored}
      variant={variant}
      isPrimary={isPrimary}
      customTitle={item.customTitle}
      customDescription={item.customDescription}
      onClickTrack={(id) => onClickTrack(id)}
    />
  );
}

// ─── Stacked Group Component ─────────────────────────────────

interface StackedGroupProps {
  anchor: ScoredResource;
  extras: ScoredResource[];
  variant: Variant;
  geo: GeoData | null;
  onClickTrack: (resourceId: string) => void;
}

function StackedGroup({ anchor, extras, variant, geo, onClickTrack }: StackedGroupProps) {
  const [expanded, setExpanded] = useState(false);

  // Build a label from what's actually in the extras
  const hasCommunities =
    anchor.resource.category === "communities" ||
    extras.some((e) => e.resource.category === "communities");
  const hasEvents =
    anchor.resource.category === "events" ||
    extras.some((e) => e.resource.category === "events");
  const label = hasCommunities && hasEvents
    ? "communities & events"
    : hasCommunities
      ? "communities"
      : hasEvents
        ? "events"
        : "more";

  return (
    <div className="relative">
      <ResourceCard
        scored={anchor}
        variant={variant}
        onClickTrack={onClickTrack}
      />

      {extras.length > 0 && (
        <div className="relative mt-[-4px] ml-2 mr-2">
          {!expanded && (
            <div className="absolute inset-x-1 top-0 h-3 rounded-b-xl border border-t-0 border-border bg-card/60" />
          )}

          <button
            onClick={() => {
              const willExpand = !expanded;
              setExpanded(willExpand);
              if (willExpand) {
                trackStackExpanded(variant, extras.length);
              }
            }}
            className={`relative z-10 flex w-full items-center justify-between rounded-b-xl border border-t-0 border-border bg-card/80 px-4 py-2.5 text-left transition-colors hover:bg-card-hover ${
              !expanded ? "mt-1" : ""
            }`}
          >
            <span className="text-xs text-muted-foreground">
              {expanded
                ? "Hide"
                : `${extras.length} more ${label}${geo?.city && geo.city !== "Unknown" ? ` near ${geo.city}` : ""}`}
            </span>
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-muted-foreground text-xs"
            >
              ↓
            </motion.span>
          </button>

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
    </div>
  );
}

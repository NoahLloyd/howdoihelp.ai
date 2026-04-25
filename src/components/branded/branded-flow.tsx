"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { questionOne } from "@/data/questions";
import { posthog } from "@/lib/posthog";
import { getBrandedVariant } from "@/lib/branded-variant";
import {
  trackFunnelStarted,
  trackQuestionAnswered,
  trackProfileProvided,
  trackProfileSkipped,
  identifyVariant,
} from "@/lib/tracking";
import { Questions } from "@/components/funnel/questions";
import { ProcessingFlowV2 } from "@/components/funnel/processing-flow-v2";
import type { ResultItem } from "@/components/funnel/processing-flow-v2";
import {
  Results,
  hasSavedRecommendations,
  loadRecommendationSession,
} from "@/components/funnel/results";
import { BrowseResults } from "@/components/funnel/browse-results";
import { ProfileStepV2 } from "@/components/funnel/profile-step-v2";
import {
  BrandedHeader,
  BrandedSkeleton,
  type BrandConfig,
} from "./branded-header";
import { JoshLinktree } from "./josh-linktree";
import type {
  Variant,
  TimeCommitment,
  UserAnswers,
  GeoData,
} from "@/types";

type Step = "home" | "questions" | "processing" | "results" | "browse";

/**
 * Shared branded-landing-page implementation used by /vin and /aimworried.
 *
 * Splits visitors across the three existing funnels (Profile / Browse /
 * Guided) via a per-brand cookie, and renders each flow with a persistent
 * branded header so the page always looks like it belongs to the creator.
 *
 * PostHog tracking:
 *  - All events captured on this page are tagged with the super properties
 *    `branded_page` and `branded_variant` so funnel events (question_answered,
 *    resource_clicked, results_viewed, etc.) can be sliced by brand.
 *  - One-time `{brand}_page_viewed` and `{brand}_variant_assigned` events are
 *    captured for top-of-funnel analysis.
 *  - Existing funnel tracking (identifyVariant, trackFunnelStarted, etc.) is
 *    still called so all downstream dashboards keep working unchanged.
 */
export function BrandedFlow({ brand }: { brand: BrandConfig }) {
  const [variant, setVariant] = useState<Variant | null>(null);
  const [step, setStep] = useState<Step>("home");
  const [answers, setAnswers] = useState<UserAnswers>({ time: "significant" });
  const [isPositioned, setIsPositioned] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Shared precomputed state for results flow
  const [precomputedItems, setPrecomputedItems] = useState<ResultItem[] | null>(null);
  const [precomputedGeo, setPrecomputedGeo] = useState<GeoData | null>(null);

  // Profile flow input state
  const [profileText, setProfileText] = useState("");
  const [profileUrls, setProfileUrls] = useState<string[]>([]);

  // Questions flow positioned-user text state
  const [positionedText, setPositionedText] = useState("");
  const [positionedUrls, setPositionedUrls] = useState<string[]>([]);

  const [savedRecs, setSavedRecs] = useState(false);

  // Wrapper so every branded-specific event shares consistent base props.
  const trackBrandEvent = useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      posthog.capture(event, {
        branded_page: brand.id,
        ...properties,
      });
    },
    [brand.id]
  );

  // Assign variant + fire page-view / assignment events
  useEffect(() => {
    const { variant: v, assigned } = getBrandedVariant(brand.id);
    setVariant(v);

    // Session-scoped super properties so every downstream event is tagged
    // with branded context — but without persisting to localStorage, which
    // would otherwise leak `branded_page` into main-site events if the user
    // hard-reloads or closes the tab before React runs unmount cleanup.
    posthog.register_for_session({
      branded_page: brand.id,
      branded_variant: v,
    });

    identifyVariant(v);
    trackFunnelStarted(v);

    if (assigned) {
      trackBrandEvent(`${brand.id}_variant_assigned`, { variant: v });
    }
    trackBrandEvent(`${brand.id}_page_viewed`, {
      variant: v,
      newly_assigned: assigned,
    });

    // Capture landing UTMs so paid/social traffic is attributable per brand.
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const [key, value] of params) {
      if (key.startsWith("utm_")) utm[key] = value;
    }
    if (Object.keys(utm).length > 0) {
      trackBrandEvent(`${brand.id}_utm_landed`, { ...utm, variant: v });
    }

    setSavedRecs(hasSavedRecommendations());

    // Clear branded-context super props when leaving the page so they don't
    // bleed into other pages viewed in the same session.
    return () => {
      posthog.unregister_for_session("branded_page");
      posthog.unregister_for_session("branded_variant");
    };
  }, [brand.id, trackBrandEvent]);

  // Warm serverless endpoints used by the profile funnel
  useEffect(() => {
    if (variant !== "A") return;
    fetch("/api/scrape-profile").catch(() => {});
    fetch("/api/recommend").catch(() => {});
  }, [variant]);

  // Scroll depth per branded page
  const scrollMilestones = useRef(new Set<number>());
  useEffect(() => {
    if (!variant) return;
    function onScroll() {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      const pct = Math.round((window.scrollY / total) * 100);
      for (const milestone of [25, 50, 75, 100]) {
        if (pct >= milestone && !scrollMilestones.current.has(milestone)) {
          scrollMilestones.current.add(milestone);
          trackBrandEvent(`${brand.id}_scroll_depth`, {
            depth_percent: milestone,
            variant,
          });
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant, brand.id, trackBrandEvent]);

  // Back-button support
  function goTo(nextStep: Step) {
    history.pushState({ step: nextStep }, "");
    setStep(nextStep);
  }
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const prevStep = (e.state?.step as Step) || "home";
      setStep(prevStep);
    }
    window.addEventListener("popstate", onPopState);
    history.replaceState({ step: "home" }, "");
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ─── Handlers ────────────────────────────────────────────

  function handleViewSavedRecs() {
    const saved = loadRecommendationSession();
    if (!saved) return;
    setPrecomputedItems(saved.items);
    setPrecomputedGeo(saved.geo);
    setAnswers(saved.answers);
    goTo("results");
  }

  // Variant A: profile input
  function handleProfileSubmit(text: string, urls: string[]) {
    if (!variant) return;
    trackProfileProvided("other", variant);
    trackBrandEvent(`${brand.id}_profile_submitted`, {
      variant,
      url_count: urls.length,
      text_length: text.length,
    });
    setProfileText(text);
    setProfileUrls(urls);
    goTo("processing");
  }
  function handleProfileSkip() {
    if (!variant) return;
    trackProfileSkipped(variant);
    trackBrandEvent(`${brand.id}_profile_skipped`, { variant });
    goTo("browse");
  }

  // Variant C: Q1 landing selection
  function handleQ1Select(optionId: string) {
    if (!variant) return;
    setSelectedOption(optionId);
    trackQuestionAnswered("readiness", optionId, variant, 0);
    trackBrandEvent(`${brand.id}_q1_answered`, {
      variant,
      option_id: optionId,
    });

    if (optionId === "positioned") {
      const newAnswers = { time: "significant" as TimeCommitment, positioned: true };
      setAnswers(newAnswers);
      setIsPositioned(true);
      sessionStorage.setItem("hdih_answers", JSON.stringify(newAnswers));
      sessionStorage.setItem("hdih_variant", variant);
      goTo("questions");
    } else {
      const time = optionId as TimeCommitment;
      const newAnswers = { time };
      setAnswers(newAnswers);
      setIsPositioned(false);
      sessionStorage.setItem("hdih_answers", JSON.stringify(newAnswers));
      sessionStorage.setItem("hdih_variant", variant);
      goTo("questions");
    }
  }

  const handleQuestionsComplete = useCallback((finalAnswers: UserAnswers) => {
    setAnswers(finalAnswers);
    goTo("results");
  }, []);

  const handlePositionedText = useCallback((text: string, urls: string[]) => {
    setPositionedText(text);
    setPositionedUrls(urls);
    goTo("processing");
  }, []);

  function handleProcessingComplete(
    items: ResultItem[],
    geo: GeoData,
    finalAnswers: UserAnswers,
  ) {
    if (!variant) return;
    setPrecomputedItems(items);
    setPrecomputedGeo(geo);
    setAnswers(finalAnswers);
    sessionStorage.setItem("hdih_answers", JSON.stringify(finalAnswers));
    sessionStorage.setItem("hdih_variant", variant);
    goTo("results");
  }

  function handleBrowseFromResults() {
    goTo("browse");
  }

  // ─── Render ───────────────────────────────────────────────

  // Wait for variant assignment before rendering anything — prevents a flash
  // of a non-chosen variant. The skeleton already shows the branded header
  // and placeholder shapes so the layout doesn't shift when the real variant
  // hydrates in.
  if (!variant) {
    return <BrandedSkeleton brand={brand} />;
  }

  // Every sub-step gets wrapped with the branded header.
  const withBrand = (content: React.ReactNode) => (
    <>
      <BrandedHeader brand={brand} />
      {content}
    </>
  );

  if (step === "questions") {
    return withBrand(
      <Questions
        variant={variant}
        answers={answers}
        isPositioned={isPositioned}
        onComplete={handleQuestionsComplete}
        onPositionedText={handlePositionedText}
      />
    );
  }

  if (step === "processing") {
    const text = variant === "A" ? profileText : positionedText;
    const urls = variant === "A" ? profileUrls : positionedUrls;
    return withBrand(
      <ProcessingFlowV2
        text={text}
        urls={urls}
        onComplete={handleProcessingComplete}
      />
    );
  }

  if (step === "results") {
    return withBrand(
      <Results
        variant={variant}
        answers={answers}
        precomputedItems={precomputedItems ?? undefined}
        precomputedGeo={precomputedGeo ?? undefined}
        onBrowse={handleBrowseFromResults}
      />
    );
  }

  if (step === "browse") {
    return withBrand(<BrowseResults variant={variant} />);
  }

  // ─── Home step — branches by variant ──────────────────────

  if (variant === "B") {
    return withBrand(<BrowseResults variant={variant} />);
  }

  if (variant === "A") {
    return withBrand(
      <>
        <ProfileStepV2 onSubmit={handleProfileSubmit} onSkip={handleProfileSkip} />
        {savedRecs && <SavedRecsLink onClick={handleViewSavedRecs} />}
      </>
    );
  }

  // Variant C, /josh only — Josh's Linktree-style page replaces the Q1 hero.
  // No BrandedHeader here: the Linktree itself shows Josh's avatar/name as the
  // central visual, and a sticky header would clash with that hierarchy.
  if (brand.id === "josh") {
    return (
      <JoshLinktree
        onTakeAction={() => goTo("browse")}
        onLinkClick={(linkId, href) =>
          trackBrandEvent(`${brand.id}_linktree_click`, {
            link_id: linkId,
            href,
            variant,
          })
        }
      />
    );
  }

  // Variant C — guided Q1 hero
  return withBrand(
    <>
      <main className="flex min-h-dvh flex-col items-center justify-center px-6">
        <motion.div
          className="flex max-w-lg flex-col items-center text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            You want to help.
          </h1>

          <motion.p
            className="mt-4 text-lg leading-relaxed text-muted-foreground sm:text-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            A few quick questions, then we&apos;ll find the best ways you can
            make a difference.
          </motion.p>

          <motion.div
            className="mt-10 w-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {questionOne.question}
            </h2>

            <div className="mt-6 flex flex-col gap-3">
              {questionOne.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleQ1Select(option.id)}
                  className={`w-full rounded-xl border px-4 py-4 text-left transition-all hover:border-accent/50 hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    selectedOption === option.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-card"
                  }`}
                >
                  <span className="block text-base font-medium">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
        {savedRecs && (
          <motion.div
            className="mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.4 }}
          >
            <button
              onClick={handleViewSavedRecs}
              className="text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              View your previous recommendations
            </button>
          </motion.div>
        )}
      </main>
    </>
  );
}

function SavedRecsLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="fixed bottom-12 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <motion.button
        onClick={onClick}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.4 }}
        className="pointer-events-auto text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground"
      >
        View your previous recommendations
      </motion.button>
    </div>
  );
}

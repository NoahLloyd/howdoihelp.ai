"use client";

import { useState, useEffect } from "react";
import {
  trackFunnelStarted,
  trackProfileProvided,
  trackProfileSkipped,
  identifyVariant,
} from "@/lib/tracking";
import { ProfileStepV2 } from "@/components/funnel/profile-step-v2";
import { ProcessingFlowV2 } from "@/components/funnel/processing-flow-v2";
import type { ResultItem } from "@/components/funnel/processing-flow-v2";
import { Results, hasSavedRecommendations, loadRecommendationSession } from "@/components/funnel/results";
import { BrowseResults } from "@/components/funnel/browse-results";
import { motion } from "framer-motion";
import type { UserAnswers, GeoData } from "@/types";

type Step = "input" | "processing" | "results" | "browse";

export default function ProfileFlowV2() {
  const [step, setStep] = useState<Step>("input");
  const [inputText, setInputText] = useState("");
  const [inputUrls, setInputUrls] = useState<string[]>([]);
  const [answers, setAnswers] = useState<UserAnswers>({ time: "significant" });
  const [precomputedItems, setPrecomputedItems] = useState<ResultItem[] | null>(null);
  const [precomputedGeo, setPrecomputedGeo] = useState<GeoData | null>(null);
  const [savedRecs, setSavedRecs] = useState(false);

  // Push virtual history entries for back button support
  function goTo(nextStep: Step) {
    history.pushState({ step: nextStep }, "");
    setStep(nextStep);
  }

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const prevStep = (e.state?.step as Step) || "input";
      setStep(prevStep);
    }
    window.addEventListener("popstate", onPopState);
    history.replaceState({ step: "input" }, "");
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    identifyVariant("A");
    trackFunnelStarted("A");
    setSavedRecs(hasSavedRecommendations());
  }, []);

  // ─── Handlers ──────────────────────────────────────────────

  function handleSubmit(text: string, urls: string[]) {
    trackProfileProvided("other", "A");
    setInputText(text);
    setInputUrls(urls);
    goTo("processing");
  }

  function handleProcessingComplete(
    items: ResultItem[],
    geo: GeoData,
    finalAnswers: UserAnswers,
  ) {
    setPrecomputedItems(items);
    setPrecomputedGeo(geo);
    setAnswers(finalAnswers);
    sessionStorage.setItem("hdih_answers", JSON.stringify(finalAnswers));
    sessionStorage.setItem("hdih_variant", "A");
    goTo("results");
  }

  function handleSkip() {
    trackProfileSkipped("A");
    goTo("browse");
  }

  function handleBrowseFromResults() {
    goTo("browse");
  }

  function handleViewSavedRecs() {
    const saved = loadRecommendationSession();
    if (!saved) return;
    setPrecomputedItems(saved.items);
    setPrecomputedGeo(saved.geo);
    setAnswers(saved.answers);
    goTo("results");
  }

  // ─── Render ────────────────────────────────────────────────

  if (step === "processing") {
    return (
      <ProcessingFlowV2
        text={inputText}
        urls={inputUrls}
        onComplete={handleProcessingComplete}
      />
    );
  }

  if (step === "results") {
    return (
      <Results
        variant="A"
        answers={answers}
        precomputedItems={precomputedItems ?? undefined}
        precomputedGeo={precomputedGeo ?? undefined}
        onBrowse={handleBrowseFromResults}
      />
    );
  }

  if (step === "browse") {
    return <BrowseResults variant="A" />;
  }

  // ─── Input step ────────────────────────────────────────────

  return (
    <>
      <ProfileStepV2
        onSubmit={handleSubmit}
        onSkip={handleSkip}
      />
      {savedRecs && (
        <div className="fixed bottom-12 left-0 right-0 z-40 flex justify-center pointer-events-none">
          <motion.button
            onClick={handleViewSavedRecs}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.4 }}
            className="pointer-events-auto text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          >
            View your previous recommendations
          </motion.button>
        </div>
      )}
    </>
  );
}

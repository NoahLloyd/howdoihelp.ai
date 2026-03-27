"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { questionOne } from "@/data/questions";
import {
  trackFunnelStarted,
  trackQuestionAnswered,
  identifyVariant,
} from "@/lib/tracking";
import { Questions } from "@/components/funnel/questions";
import { ProcessingFlowV2 } from "@/components/funnel/processing-flow-v2";
import type { ResultItem } from "@/components/funnel/processing-flow-v2";
import { Results, hasSavedRecommendations, loadRecommendationSession } from "@/components/funnel/results";
import { BrowseResults } from "@/components/funnel/browse-results";
import type { TimeCommitment, UserAnswers, GeoData } from "@/types";

type Step = "q1" | "questions" | "processing" | "results" | "browse";

export default function QuestionsPage() {
  const [step, setStep] = useState<Step>("q1");
  const [answers, setAnswers] = useState<UserAnswers>({ time: "significant" });
  const [isPositioned, setIsPositioned] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [precomputedItems, setPrecomputedItems] = useState<ResultItem[] | null>(null);
  const [precomputedGeo, setPrecomputedGeo] = useState<GeoData | null>(null);
  const [positionedText, setPositionedText] = useState("");
  const [positionedUrls, setPositionedUrls] = useState<string[]>([]);

  function goTo(nextStep: Step) {
    history.pushState({ step: nextStep }, "");
    setStep(nextStep);
  }

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const prevStep = (e.state?.step as Step) || "q1";
      setStep(prevStep);
    }
    window.addEventListener("popstate", onPopState);
    history.replaceState({ step: "q1" }, "");
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    identifyVariant("C");
    trackFunnelStarted("C");
  }, []);

  function handleQ1Select(optionId: string) {
    setSelectedOption(optionId);
    trackQuestionAnswered("readiness", optionId, "C", 0);

    if (optionId === "positioned") {
      const newAnswers = { time: "significant" as TimeCommitment, positioned: true };
      setAnswers(newAnswers);
      setIsPositioned(true);
      sessionStorage.setItem("hdih_answers", JSON.stringify(newAnswers));
      sessionStorage.setItem("hdih_variant", "C");
      goTo("questions");
    } else {
      const time = optionId as TimeCommitment;
      const newAnswers = { time };
      setAnswers(newAnswers);
      setIsPositioned(false);
      sessionStorage.setItem("hdih_answers", JSON.stringify(newAnswers));
      sessionStorage.setItem("hdih_variant", "C");
      goTo("questions");
    }
  }

  const handleQuestionsComplete = useCallback((finalAnswers: UserAnswers) => {
    setAnswers(finalAnswers);
    goTo("results");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePositionedText = useCallback((text: string, urls: string[]) => {
    setPositionedText(text);
    setPositionedUrls(urls);
    goTo("processing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleProcessingComplete(
    items: ResultItem[],
    geo: GeoData,
    finalAnswers: UserAnswers,
  ) {
    setPrecomputedItems(items);
    setPrecomputedGeo(geo);
    setAnswers(finalAnswers);
    sessionStorage.setItem("hdih_answers", JSON.stringify(finalAnswers));
    sessionStorage.setItem("hdih_variant", "C");
    goTo("results");
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

  if (step === "questions") {
    return (
      <Questions
        variant="C"
        answers={answers}
        isPositioned={isPositioned}
        onComplete={handleQuestionsComplete}
        onPositionedText={handlePositionedText}
      />
    );
  }

  if (step === "processing") {
    return (
      <ProcessingFlowV2
        text={positionedText}
        urls={positionedUrls}
        onComplete={handleProcessingComplete}
      />
    );
  }

  if (step === "results") {
    return (
      <Results
        variant="C"
        answers={answers}
        precomputedItems={precomputedItems ?? undefined}
        precomputedGeo={precomputedGeo ?? undefined}
        onBrowse={handleBrowseFromResults}
      />
    );
  }

  if (step === "browse") {
    return <BrowseResults variant="C" />;
  }

  const savedRecs = hasSavedRecommendations();

  return (
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
          A few quick questions, then we&apos;ll find the best ways
          you can make a difference.
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
  );
}

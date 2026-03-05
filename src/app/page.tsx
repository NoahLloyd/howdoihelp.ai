"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { questionOne } from "@/data/questions";
import { getVariant, setVariant as persistVariant } from "@/lib/variants";
import {
  trackFunnelStarted,
  trackQuestionAnswered,
  trackProfileProvided,
  trackProfileSkipped,
  identifyVariant,
} from "@/lib/tracking";
import { Questions } from "@/components/funnel/questions";
import { Results } from "@/components/funnel/results";
import { BrowseResults } from "@/components/funnel/browse-results";
import { ProfileStep } from "@/components/funnel/profile-step";
import { ProcessingFlow } from "@/components/funnel/processing-flow";
import type { ResultItem } from "@/components/funnel/processing-flow";
import type {
  Variant,
  TimeCommitment,
  UserAnswers,
  ProfilePlatform,
  GeoData,
} from "@/types";

type Step = "home" | "questions" | "processing" | "results" | "browse";

const VARIANTS: Variant[] = ["A", "B", "C"];

export default function Home() {
  const [variant, setVariantState] = useState<Variant>("C");
  const [step, setStep] = useState<Step>("home");
  const [answers, setAnswers] = useState<UserAnswers>({ time: "significant" });
  const [isPositioned, setIsPositioned] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Processing flow state
  const [processingInput, setProcessingInput] = useState("");
  const [processingInputType, setProcessingInputType] = useState<"linkedin" | "github" | "x" | "instagram" | "name" | "other_url">("linkedin");
  const [processingPlatform, setProcessingPlatform] = useState<ProfilePlatform>("other");
  const [processingProfileText, setProcessingProfileText] = useState<string | undefined>();
  const [precomputedItems, setPrecomputedItems] = useState<ResultItem[] | null>(null);
  const [precomputedGeo, setPrecomputedGeo] = useState<GeoData | null>(null);

  // Push a virtual history entry when advancing steps
  function goTo(nextStep: Step) {
    history.pushState({ step: nextStep }, "");
    setStep(nextStep);
  }

  // Listen for browser back button / swipe back
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const prevStep = (e.state?.step as Step) || "home";
      setStep(prevStep);
    }
    window.addEventListener("popstate", onPopState);
    history.replaceState({ step: "home" }, "");
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const v = getVariant();
    setVariantState(v);
    identifyVariant(v);
    trackFunnelStarted(v);
  }, []);

  function handleVariantChange(v: Variant) {
    setVariantState(v);
    persistVariant(v);
    identifyVariant(v);
    // Reset to home on variant change
    setStep("home");
    setAnswers({ time: "significant" });
    setIsPositioned(false);
    setSelectedOption(null);
    setPrecomputedItems(null);
    setPrecomputedGeo(null);
  }

  // ─── Variant A: Profile submission ────────────────────────

  function handleProfileSubmit(
    url: string,
    platform: ProfilePlatform,
    inputType: "linkedin" | "github" | "x" | "instagram" | "name" | "other_url",
    profileText?: string,
  ) {
    trackProfileProvided(platform, variant);
    setProcessingInput(url);
    setProcessingInputType(inputType);
    setProcessingPlatform(platform);
    setProcessingProfileText(profileText);
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
    sessionStorage.setItem("hdih_variant", variant);
    goTo("results");
  }

  function handleProfileSkip() {
    trackProfileSkipped(variant);
    goTo("browse");
  }

  // ─── Variant C: Q1 answer handler ────────────────────────

  function handleQ1Select(optionId: string) {
    setSelectedOption(optionId);
    trackQuestionAnswered("readiness", optionId, variant, 0);

    if (optionId === "positioned") {
      const newAnswers = {
        time: "significant" as TimeCommitment,
        positioned: true,
      };
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

  const handleQuestionsComplete = useCallback(
    (finalAnswers: UserAnswers) => {
      setAnswers(finalAnswers);
      goTo("results");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  );

  // ─── Sub-page renders ────────────────────────────────────

  if (step === "questions") {
    return (
      <>
        <Questions
          variant={variant}
          answers={answers}
          isPositioned={isPositioned}
          onComplete={handleQuestionsComplete}
        />
        <VariantSelector
          variant={variant}
          onVariantChange={handleVariantChange}
        />
      </>
    );
  }

  if (step === "processing") {
    return (
      <>
        <ProcessingFlow
          input={processingInput}
          inputType={processingInputType}
          platform={processingPlatform}
          variant={variant}
          profileText={processingProfileText}
          onComplete={handleProcessingComplete}
        />
        <VariantSelector
          variant={variant}
          onVariantChange={handleVariantChange}
        />
      </>
    );
  }

  if (step === "browse") {
    return (
      <>
        <BrowseResults variant={variant} />
        <VariantSelector
          variant={variant}
          onVariantChange={handleVariantChange}
        />
      </>
    );
  }

  if (step === "results") {
    return (
      <>
        <Results
          variant={variant}
          answers={answers}
          precomputedItems={precomputedItems ?? undefined}
          precomputedGeo={precomputedGeo ?? undefined}
        />
        <VariantSelector
          variant={variant}
          onVariantChange={handleVariantChange}
        />
      </>
    );
  }

  // ─── Home: render based on variant ───────────────────────

  // Variant B: Browse - straight to browsable results
  if (variant === "B") {
    return (
      <>
        <BrowseResults variant={variant} />
        <VariantSelector
          variant={variant}
          onVariantChange={handleVariantChange}
        />
      </>
    );
  }

  // Variant A: Profile - inviting header + profile input
  if (variant === "A") {
    return (
      <>
        <ProfileStep
          onSubmit={handleProfileSubmit}
          onSkip={handleProfileSkip}
        />
        <VariantSelector
          variant={variant}
          onVariantChange={handleVariantChange}
        />
      </>
    );
  }

  // Variant C: Guided - Q1 is the landing page
  return (
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
            A few quick questions, then we&apos;ll find the best ways for
            you to help with AI safety.
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
      </main>
      <VariantSelector
        variant={variant}
        onVariantChange={handleVariantChange}
      />
    </>
  );
}

// ─── Variant Selector ───────────────────────────────────────

function VariantSelector({
  variant,
  onVariantChange,
}: {
  variant: Variant;
  onVariantChange: (v: Variant) => void;
}) {
  return (
    <div className="group fixed bottom-4 right-4 z-50">
      {/* Tiny dot - visible at rest */}
      <div className="h-2 w-2 rounded-full bg-muted-foreground/20 transition-opacity group-hover:opacity-0" />

      {/* Full selector - visible on hover */}
      <div className="pointer-events-none absolute bottom-0 right-0 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <span>Variant:</span>
        {VARIANTS.map((v) => (
          <button
            key={v}
            onClick={() => onVariantChange(v)}
            className={`rounded px-2 py-1 font-medium transition-colors ${
              variant === v ? "bg-accent text-white" : "hover:bg-card-hover"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

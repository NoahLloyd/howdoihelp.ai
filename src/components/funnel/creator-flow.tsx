"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CreatorOverrides } from "@/lib/data";
import { ProfileStep } from "@/components/funnel/profile-step";
import { Results } from "@/components/funnel/results";
import { BrowseResults } from "@/components/funnel/browse-results";
import { ProcessingFlow } from "@/components/funnel/processing-flow";
import type { ResultItem } from "@/components/funnel/processing-flow";
import { QuestionCard } from "@/components/questions/question-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { questionOne, questionTwo, questionPositioned } from "@/data/questions";
import type {
  CreatorFlowStep,
  CreatorCustomQuestion,
  Question,
  UserAnswers,
  ProfilePlatform,
  GeoData,
  TimeCommitment,
  IntentTag,
} from "@/types";

interface CreatorFlowProps {
  flowConfig: CreatorFlowStep[];
  overrides: CreatorOverrides;
  slug: string;
}

/**
 * Renders a creator's custom flow by stepping through their configured steps.
 * Reuses the existing flow components (ProfileStep, Results, BrowseResults, etc.)
 */
export function CreatorFlow({ flowConfig, overrides, slug }: CreatorFlowProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<UserAnswers>({ time: "significant" });
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  // Processing flow state
  const [processingInput, setProcessingInput] = useState("");
  const [processingInputType, setProcessingInputType] = useState<"linkedin" | "github" | "x" | "instagram" | "name" | "other_url">("linkedin");
  const [processingPlatform, setProcessingPlatform] = useState<ProfilePlatform>("other");
  const [processingProfileText, setProcessingProfileText] = useState<string | undefined>();
  const [precomputedItems, setPrecomputedItems] = useState<ResultItem[] | null>(null);
  const [precomputedGeo, setPrecomputedGeo] = useState<GeoData | null>(null);
  const [showProcessing, setShowProcessing] = useState(false);

  // Push virtual history entries for back button support
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const prevStep = e.state?.stepIndex ?? 0;
      setCurrentStepIndex(prevStep);
      setShowProcessing(false);
    }
    window.addEventListener("popstate", onPopState);
    history.replaceState({ stepIndex: 0 }, "");
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function goToStep(index: number) {
    history.pushState({ stepIndex: index }, "");
    setCurrentStepIndex(index);
  }

  const currentStep = flowConfig[currentStepIndex];
  const isLastStep = currentStepIndex === flowConfig.length - 1;

  function advanceToNext() {
    if (!isLastStep) {
      goToStep(currentStepIndex + 1);
    }
  }

  // ─── Profile step handlers ─────────────────────────────

  function handleProfileSubmit(
    url: string,
    platform: ProfilePlatform,
    inputType: "linkedin" | "github" | "x" | "instagram" | "name" | "other_url",
    profileText?: string,
  ) {
    setProcessingInput(url);
    setProcessingInputType(inputType);
    setProcessingPlatform(platform);
    setProcessingProfileText(profileText);
    setShowProcessing(true);
  }

  function handleProcessingComplete(
    items: ResultItem[],
    geo: GeoData,
    finalAnswers: UserAnswers,
  ) {
    setPrecomputedItems(items);
    setPrecomputedGeo(geo);
    setAnswers(finalAnswers);
    setShowProcessing(false);
    advanceToNext();
  }

  function handleProfileSkip() {
    advanceToNext();
  }

  // ─── Render processing flow overlay ────────────────────

  if (showProcessing) {
    return (
      <ProcessingFlow
        input={processingInput}
        inputType={processingInputType}
        platform={processingPlatform}
        variant="A"
        profileText={processingProfileText}
        overrides={overrides}
        onComplete={handleProcessingComplete}
      />
    );
  }

  if (!currentStep) return null;

  // ─── Render current step ───────────────────────────────

  switch (currentStep.type) {
    case "welcome":
      return <WelcomeStep step={currentStep} onContinue={advanceToNext} />;

    case "questions":
      return (
        <QuestionsStep
          step={currentStep}
          answers={answers}
          customAnswers={customAnswers}
          onComplete={(updatedAnswers, updatedCustom) => {
            setAnswers(updatedAnswers);
            setCustomAnswers(updatedCustom);
            advanceToNext();
          }}
        />
      );

    case "profile":
      return (
        <ProfileStep
          onSubmit={handleProfileSubmit}
          onSkip={handleProfileSkip}
        />
      );

    case "results":
      if (currentStep.style === "browse") {
        return <BrowseResults variant="B" overrides={overrides} />;
      }
      return (
        <Results
          variant="A"
          answers={answers}
          precomputedItems={precomputedItems ?? undefined}
          precomputedGeo={precomputedGeo ?? undefined}
          overrides={overrides}
        />
      );

    default:
      return null;
  }
}

// ─── Welcome Step ──────────────────────────────────────────

function WelcomeStep({
  step,
  onContinue,
}: {
  step: { title: string; subtitle: string };
  onContinue: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <motion.div
        className="flex max-w-lg flex-col items-center text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {step.title}
        </h1>

        <motion.p
          className="mt-4 text-lg leading-relaxed text-muted-foreground sm:text-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          {step.subtitle}
        </motion.p>

        <motion.div
          className="mt-10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <button
            onClick={onContinue}
            className="inline-flex items-center rounded-xl bg-accent px-8 py-4 text-base font-medium text-white hover:bg-accent-hover transition-colors"
          >
            Get started
          </button>
        </motion.div>
      </motion.div>
    </main>
  );
}

// ─── Questions Step ────────────────────────────────────────

function QuestionsStep({
  step,
  answers: initialAnswers,
  customAnswers: initialCustom,
  onComplete,
}: {
  step: { useDefaults: boolean; customQuestions: CreatorCustomQuestion[] };
  answers: UserAnswers;
  customAnswers: Record<string, string>;
  onComplete: (answers: UserAnswers, customAnswers: Record<string, string>) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<UserAnswers>(initialAnswers);
  const [custom, setCustom] = useState<Record<string, string>>(initialCustom);

  // Build the question list
  const questions: Question[] = [];

  if (step.useDefaults) {
    questions.push(questionOne, questionTwo);
  }

  // Add custom questions
  for (const cq of step.customQuestions) {
    questions.push({
      id: cq.id,
      question: cq.question,
      options: cq.options.map((o) => ({ id: o.id, label: o.label })),
    });
  }

  if (questions.length === 0) {
    // No questions configured, skip
    onComplete(answers, custom);
    return null;
  }

  const currentQuestion = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  function handleSelect(questionId: string, optionId: string) {
    // Handle default questions
    if (questionId === "readiness") {
      const time = optionId === "positioned" ? "significant" : optionId as TimeCommitment;
      const updatedAnswers = { ...answers, time, positioned: optionId === "positioned" };
      setAnswers(updatedAnswers);

      if (isLast) {
        onComplete(updatedAnswers, custom);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    } else if (questionId === "intent") {
      const updatedAnswers = { ...answers, intent: optionId as IntentTag };
      setAnswers(updatedAnswers);

      if (isLast) {
        onComplete(updatedAnswers, custom);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    } else {
      // Custom question
      const updatedCustom = { ...custom, [questionId]: optionId };
      setCustom(updatedCustom);

      if (isLast) {
        onComplete(answers, updatedCustom);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    }
  }

  if (!currentQuestion) return null;

  return (
    <main className="flex min-h-dvh flex-col px-6 py-12">
      <div className="mx-auto w-full max-w-lg">
        <ProgressBar progress={progress} />

        <div className="relative mt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <QuestionCard
                question={currentQuestion}
                selectedAnswer={
                  custom[currentQuestion.id] ??
                  (currentQuestion.id === "readiness" ? undefined : undefined)
                }
                onSelect={handleSelect}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

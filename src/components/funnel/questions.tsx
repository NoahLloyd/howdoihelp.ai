"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { questionPositioned, questionTwo } from "@/data/questions";
import {
  trackQuestionAnswered,
  trackQuestionSkipped,
  trackProfileProvided,
  trackProfileSkipped,
} from "@/lib/tracking";
import { QuestionCard } from "@/components/questions/question-card";
import { ProfileStep } from "@/components/funnel/profile-step";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { Question, Variant, UserAnswers, IntentTag, PositionTag, ProfilePlatform } from "@/types";

interface QuestionsProps {
  variant: Variant;
  answers: UserAnswers;
  isPositioned: boolean;
  onComplete: (answers: UserAnswers) => void;
}

export function Questions({ variant, answers: initialAnswers, isPositioned, onComplete }: QuestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<UserAnswers>(initialAnswers);
  const [showProfileStep, setShowProfileStep] = useState(false);
  const answeredRef = useRef(false);
  const questionStartRef = useRef(Date.now());

  // Build question sequence - only used by Variant C
  // If positioned: position_type → intent
  // Otherwise: just intent (Q1 readiness was already answered on the home page)
  const questions: Question[] = isPositioned
    ? [questionPositioned, questionTwo]
    : [questionTwo];

  // Track skipped question on unmount if user didn't answer
  useEffect(() => {
    answeredRef.current = false;
    questionStartRef.current = Date.now();
    return () => {
      if (!answeredRef.current && questions[currentIndex]) {
        trackQuestionSkipped(questions[currentIndex].id, variant);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const currentQuestion = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 100;

  function finish(updatedAnswers: UserAnswers) {
    sessionStorage.setItem("hdih_answers", JSON.stringify(updatedAnswers));
    onComplete(updatedAnswers);
  }

  /** For variant B, show the profile step instead of finishing immediately */
  function finishOrProfile(updatedAnswers: UserAnswers) {
    if (variant === "B") {
      setAnswers(updatedAnswers);
      sessionStorage.setItem("hdih_answers", JSON.stringify(updatedAnswers));
      setShowProfileStep(true);
    } else {
      finish(updatedAnswers);
    }
  }

  function handleProfileSubmit(url: string, platform: ProfilePlatform, _inputType: "linkedin" | "github" | "x" | "instagram" | "name" | "other_url", _profileText?: string) {
    trackProfileProvided(platform, variant);
    const updatedAnswers: UserAnswers = {
      ...answers,
      profileUrl: url,
      profilePlatform: platform,
    };
    finish(updatedAnswers);
  }

  function handleProfileSkip() {
    trackProfileSkipped(variant);
    finish(answers);
  }

  function handleSelect(questionId: string, optionId: string) {
    answeredRef.current = true;
    const timeToAnswer = Date.now() - questionStartRef.current;

    if (questionId === "position_type") {
      trackQuestionAnswered(questionId, optionId, variant, currentIndex + 1, timeToAnswer);
      const updatedAnswers = {
        ...answers,
        positioned: true,
        positionType: optionId as PositionTag,
      };
      setAnswers(updatedAnswers);

      if (isLast) {
        finishOrProfile(updatedAnswers);
      } else {
        sessionStorage.setItem("hdih_answers", JSON.stringify(updatedAnswers));
        setCurrentIndex((prev) => prev + 1);
      }
    } else if (questionId === "intent") {
      trackQuestionAnswered(questionId, optionId, variant, currentIndex + 1, timeToAnswer);
      const updatedAnswers = { ...answers, intent: optionId as IntentTag };
      setAnswers(updatedAnswers);

      if (isLast) {
        finishOrProfile(updatedAnswers);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    }
  }

  function getSelectedAnswer(): string | string[] | undefined {
    if (!currentQuestion) return undefined;
    if (currentQuestion.id === "position_type") return answers.positionType;
    if (currentQuestion.id === "intent") return answers.intent;
    return undefined;
  }

  if (!currentQuestion) return null;

  if (showProfileStep) {
    return (
      <ProfileStep
        onSubmit={handleProfileSubmit}
        onSkip={handleProfileSkip}
      />
    );
  }

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
                selectedAnswer={getSelectedAnswer()}
                onSelect={handleSelect}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

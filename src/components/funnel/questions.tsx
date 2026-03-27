"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Mic, Square } from "lucide-react";
import { questionTwo } from "@/data/questions";
import {
  trackQuestionAnswered,
  trackQuestionSkipped,
  trackProfileProvided,
  trackProfileSkipped,
} from "@/lib/tracking";
import { QuestionCard } from "@/components/questions/question-card";
import { ProfileStep } from "@/components/funnel/profile-step";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { Question, Variant, UserAnswers, IntentTag, ProfilePlatform } from "@/types";

// ─── URL extraction ─────────────────────────────────────────

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s,)}\]>"']+/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)];
}

function urlToHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── Speech Recognition ─────────────────────────────────────

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

function useSpeechRecognition() {
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const onResultRef = useRef<((text: string, isFinal: boolean) => void) | null>(null);

  useEffect(() => {
    const supported = typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    setIsSupported(supported);
  }, []);

  const start = useCallback((onResult: (text: string, isFinal: boolean) => void) => {
    if (!isSupported) return;
    onResultRef.current = onResult;
    const recognition = createRecognition();
    if (!recognition) return;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) onResultRef.current?.(final, true);
      else if (interim) onResultRef.current?.(interim, false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  return { isListening, isSupported, start, stop };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createRecognition(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  return new SR();
}

function VoiceWaveform() {
  const bars = 5;
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-accent"
          animate={{ height: [8, 20 + Math.random() * 12, 8] }}
          transition={{
            duration: 0.6 + Math.random() * 0.3,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.08,
          }}
        />
      ))}
    </div>
  );
}

// ─── Positioned Text Input ──────────────────────────────────

const POSITIONED_EXAMPLES = [
  "I work at a major AI company",
  "I\u2019m a congressional staffer",
  "I have a large online audience",
  "I can fund important work",
];

interface PositionedInputProps {
  onSubmit: (text: string, urls: string[]) => void;
  onSkip: () => void;
}

function PositionedInput({ onSubmit, onSkip }: PositionedInputProps) {
  const [input, setInput] = useState("");
  const [interimText, setInterimText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isListening, isSupported, start, stop } = useSpeechRecognition();

  const hasInput = input.trim().length > 0;
  const urls = extractUrls(input);
  const displayText = isListening ? input + (interimText ? " " + interimText : "") : input;

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 80)}px`;
  }, [displayText]);

  function handleSubmit() {
    if (!hasInput) return;
    onSubmit(input.trim(), urls);
  }

  function toggleVoice() {
    if (isListening) {
      stop();
    } else {
      start((text, isFinal) => {
        if (isFinal) {
          setInput((prev) => (prev ? prev + " " + text : text));
          setInterimText("");
        } else {
          setInterimText(text);
        }
      });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Tell us about your position
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        What role, access, or expertise do you have? We&apos;ll use this to find
        the highest-impact ways you can help.
      </p>

      <div className="mt-6">
        <div
          className="group relative rounded-2xl border border-border bg-card transition-all focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/8"
        >
          <textarea
            ref={textareaRef}
            value={displayText}
            onChange={(e) => {
              setInput(e.target.value);
              setInterimText("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && hasInput) {
                handleSubmit();
              }
            }}
            placeholder="I work as..."
            rows={3}
            className="block w-full resize-none bg-transparent px-5 pb-14 pt-5 text-[15px] leading-relaxed outline-none placeholder:text-muted/60"
          />

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-2">
              {isSupported && (
                <button
                  onClick={toggleVoice}
                  className={`relative flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium transition-all ${
                    isListening
                      ? "bg-accent text-white"
                      : "bg-card-hover text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isListening ? (
                    <>
                      <Square className="h-3 w-3" fill="currentColor" />
                      <VoiceWaveform />
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5" />
                      <span>Speak</span>
                    </>
                  )}
                </button>
              )}

              <AnimatePresence>
                {urls.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex gap-1"
                  >
                    {urls.slice(0, 3).map((url) => (
                      <span
                        key={url}
                        className="rounded-full bg-accent/8 px-2 py-1 text-[11px] text-accent"
                      >
                        {urlToHost(url)}
                      </span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              onClick={handleSubmit}
              disabled={!hasInput}
              whileTap={{ scale: 0.95 }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-all disabled:opacity-20"
            >
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          </div>
        </div>

        {/* Example prompts */}
        {!hasInput && !isListening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="mt-4 flex flex-wrap gap-2"
          >
            {POSITIONED_EXAMPLES.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setInput(prompt)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-accent/30 hover:bg-card-hover hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}

        {/* Skip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="mt-8"
        >
          <button
            onClick={onSkip}
            className="text-[13px] text-muted/60 transition-colors hover:text-muted-foreground"
          >
            Skip and browse all resources
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Main Questions Component ───────────────────────────────

interface QuestionsProps {
  variant: Variant;
  answers: UserAnswers;
  isPositioned: boolean;
  onComplete: (answers: UserAnswers) => void;
  onPositionedText?: (text: string, urls: string[]) => void;
}

export function Questions({ variant, answers: initialAnswers, isPositioned, onComplete, onPositionedText }: QuestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<UserAnswers>(initialAnswers);
  const [showProfileStep, setShowProfileStep] = useState(false);
  const answeredRef = useRef(false);
  const questionStartRef = useRef(Date.now());

  // Build question sequence
  // If positioned: free text input (handled separately) → intent
  // Otherwise: just intent (Q1 readiness was already answered on the home page)
  const questions: Question[] = isPositioned
    ? [questionTwo]
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

  // For positioned users, show the free text input first
  const showPositionedInput = isPositioned && currentIndex === 0;
  // Positioned users see: text input + intent question (2 steps)
  // Non-positioned users see: just intent question (1 step)
  const totalSteps = isPositioned ? 2 : 1;
  const currentStep = isPositioned
    ? (showPositionedInput ? 1 : 2)
    : currentIndex + 1;
  const progress = (currentStep / totalSteps) * 100;

  const currentQuestion = questions[currentIndex];

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

  function handlePositionedSubmit(text: string, urls: string[]) {
    answeredRef.current = true;
    trackQuestionAnswered("position_type", "freetext", variant, 1, Date.now() - questionStartRef.current);
    if (onPositionedText) {
      onPositionedText(text, urls);
    }
  }

  function handlePositionedSkip() {
    trackProfileSkipped(variant);
    // Skip to browse
    const updatedAnswers = { ...answers, positioned: true };
    finish(updatedAnswers);
  }

  function handleSelect(questionId: string, optionId: string) {
    answeredRef.current = true;
    const timeToAnswer = Date.now() - questionStartRef.current;

    if (questionId === "intent") {
      trackQuestionAnswered(questionId, optionId, variant, currentIndex + 1, timeToAnswer);
      const updatedAnswers = { ...answers, intent: optionId as IntentTag };
      setAnswers(updatedAnswers);
      finishOrProfile(updatedAnswers);
    }
  }

  function getSelectedAnswer(): string | string[] | undefined {
    if (!currentQuestion) return undefined;
    if (currentQuestion.id === "intent") return answers.intent;
    return undefined;
  }

  if (!currentQuestion && !showPositionedInput) return null;

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
            {showPositionedInput ? (
              <PositionedInput
                key="positioned-input"
                onSubmit={handlePositionedSubmit}
                onSkip={handlePositionedSkip}
              />
            ) : (
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
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

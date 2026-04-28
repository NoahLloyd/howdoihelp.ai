"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Mic, Square, ArrowRight } from "lucide-react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { trackVoiceError, trackVoiceStarted, trackVoiceTranscribed } from "@/lib/tracking";
import type { Variant } from "@/types";

// ─── Types ──────────────────────────────────────────────────

interface ProfileStepV2Props {
  onSubmit: (text: string, urls: string[]) => void;
  onSkip: () => void;
  variant?: Variant;
}

type Mode = "idle" | "typing" | "listening" | "transcribing" | "transcribed";

// ─── Example Prompts ─────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  "I'm a student",
  "I work in tech",
  "I want to help but don't know how",
];

// ─── URL extraction ─────────────────────────────────────────

/** Common TLDs for detecting bare-domain URLs (e.g. linkedin.com/in/someone) */
const COMMON_TLDS = /\.(com|org|net|io|co|dev|ai|me|info|app|xyz|edu|gov|uk|de|fr|nl|dk|se|no|fi|jp|kr|ca|au|nz|in|br)\b/;

function extractUrls(text: string): string[] {
  const urls: string[] = [];

  // Match explicit https?:// URLs
  const explicit = text.match(/https?:\/\/[^\s,)}\]>"']+/gi) || [];
  urls.push(...explicit);

  // Match bare domains like linkedin.com/in/someone or github.com/user
  // Only if they contain a known TLD and aren't already captured above
  const bareRegex = /(?<!\/)(?:www\.)?([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}(?:\/[^\s,)}\]>"']*)?/gi;
  const bareMatches = text.match(bareRegex) || [];
  for (const m of bareMatches) {
    if (COMMON_TLDS.test(m)) {
      const full = m.startsWith("http") ? m : `https://${m}`;
      // Skip if we already captured this via the explicit regex
      if (!urls.some((u) => u.includes(m))) {
        urls.push(full);
      }
    }
  }

  return [...new Set(urls)];
}

function urlToHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── Animated Waveform ──────────────────────────────────────

function VoiceWaveform() {
  const bars = 5;
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-accent"
          animate={{
            height: [8, 20 + Math.random() * 12, 8],
          }}
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

// ─── Keyboard shortcut display ──────────────────────────────

function useIsMac() {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(navigator.platform?.toLowerCase().includes("mac") ?? true);
  }, []);
  return isMac;
}

// ─── Component ──────────────────────────────────────────────

export function ProfileStepV2({ onSubmit, onSkip, variant = "A" }: ProfileStepV2Props) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recordStartRef = useRef<number>(0);
  const isMac = useIsMac();

  const handleTranscribed = useCallback(
    (text: string) => {
      setInput((prev) => (prev ? prev + " " + text : text));
      const durationMs = recordStartRef.current ? Date.now() - recordStartRef.current : 0;
      trackVoiceTranscribed(variant, "profile", text.length, durationMs);
    },
    [variant]
  );

  const {
    state: voiceState,
    isSupported: voiceSupported,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
  } = useVoiceRecorder({ onTranscribed: handleTranscribed });

  const isListening = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

  const hasInput = input.trim().length > 0;
  const urls = extractUrls(input);

  // Track voice errors as they occur
  useEffect(() => {
    if (voiceState === "error" && voiceError) {
      trackVoiceError(variant, "profile", voiceError);
    }
  }, [voiceState, voiceError, variant]);

  // Auto-focus with delay so entrance animation plays first
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 800);
    return () => clearTimeout(t);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
  }, [input]);

  // Update mode based on state
  useEffect(() => {
    if (isListening) setMode("listening");
    else if (isTranscribing) setMode("transcribing");
    else if (hasInput) setMode("typing");
    else setMode("idle");
  }, [isListening, isTranscribing, hasInput]);

  function handleSubmit() {
    if (!hasInput) return;
    onSubmit(input.trim(), urls);
  }

  function handleExampleClick(example: string) {
    setInput(example);
    // Focus textarea so user can edit/extend
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function toggleVoice() {
    if (isListening) {
      stopVoice();
      return;
    }
    if (isTranscribing) return;
    recordStartRef.current = Date.now();
    trackVoiceStarted(variant, "profile");
    void startVoice();
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6">
      {/* Subtle background glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(13,147,115,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <h1 className="text-[2rem] font-semibold leading-[1.15] tracking-tight sm:text-[2.5rem]">
            Find your path into{" "}
            <span className="text-accent whitespace-nowrap">AI safety</span>
          </h1>
        </motion.div>

        {/* Input area */}
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="mt-8"
        >
          <div
            className="group relative rounded-2xl border border-border bg-card transition-all focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/8"
            style={{ boxShadow: "0 0 60px rgba(13,147,115,0.06)" }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && hasInput) {
                  handleSubmit();
                }
              }}
              placeholder="Tell us about yourself..."
              rows={3}
              disabled={isListening || isTranscribing}
              className="block w-full resize-none bg-transparent px-5 pb-14 pt-5 text-[15px] leading-relaxed outline-none placeholder:text-muted/60 disabled:opacity-70"
            />

            {/* Bottom toolbar inside the input */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-2">
                {/* Voice button */}
                {voiceSupported && (
                  <button
                    onClick={toggleVoice}
                    disabled={isTranscribing}
                    className={`relative flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium transition-all disabled:opacity-70 ${
                      isListening || isTranscribing
                        ? "bg-accent text-white"
                        : "bg-card-hover text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isListening ? (
                      <>
                        <Square className="h-3 w-3" fill="currentColor" />
                        <VoiceWaveform />
                      </>
                    ) : isTranscribing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Transcribing</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" />
                        <span>Speak</span>
                      </>
                    )}
                    {isListening && (
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-accent"
                        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                  </button>
                )}

                {/* Detected links */}
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
                      {urls.length > 3 && (
                        <span className="rounded-full bg-accent/8 px-2 py-1 text-[11px] text-accent">
                          +{urls.length - 3}
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit + shortcut hint (desktop only) */}
              <div className="flex items-center gap-2">
                <AnimatePresence>
                  {hasInput && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hidden text-[11px] text-muted/40 select-none sm:inline"
                    >
                      {isMac ? "⌘↵" : "Ctrl+↵"}
                    </motion.span>
                  )}
                </AnimatePresence>
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
          </div>

          {/* Contextual hint / voice error */}
          <AnimatePresence mode="wait">
            {voiceError ? (
              <motion.p
                key="voice-error"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="mt-3 text-[13px] text-rose-600 dark:text-rose-400"
              >
                {voiceError}
              </motion.p>
            ) : (
              <motion.p
                key={mode}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="mt-3 text-[13px] text-muted"
              >
                {mode === "idle" && "Your background, interests, links. Anything helps."}
                {mode === "typing" && "Drop any profile links in here too."}
                {mode === "listening" && "Listening... speak naturally."}
                {mode === "transcribing" && "Transcribing your recording..."}
                {mode === "transcribed" && "Drop any profile links in here too."}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Example prompts — hidden once user starts typing */}
        {!hasInput && mode === "idle" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
          >
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleExampleClick(prompt)}
                className="w-fit rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-accent/30 hover:bg-card-hover hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}

        {/* Skip link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="mt-10"
        >
          <button
            onClick={onSkip}
            className="text-[13px] text-muted/60 transition-colors hover:text-muted-foreground"
          >
            Skip and browse all resources
          </button>
        </motion.div>
      </div>
    </main>
  );
}

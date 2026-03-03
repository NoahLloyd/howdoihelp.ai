"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { detectPlatform } from "@/lib/profile";
import { ProfileConfirmation } from "@/components/funnel/profile-confirmation";
import type { ProfilePlatform, EnrichedProfile } from "@/types";

interface ProfileStepProps {
  onSubmit: (url: string, platform: ProfilePlatform, profile?: EnrichedProfile) => void;
  onSkip: () => void;
}

type Phase = "input" | "loading" | "confirm";
type InputMode = "empty" | "url" | "text";

// ─── Platform Config ────────────────────────────────────────

const PLATFORMS = [
  {
    key: "linkedin",
    label: "LinkedIn",
    openUrl: "https://www.linkedin.com/in/me/",
    buildUrl: (u: string) => `https://www.linkedin.com/in/${u}/`,
  },
  {
    key: "github",
    label: "GitHub",
    openUrl: "https://github.com",
    buildUrl: (u: string) => `https://github.com/${u}`,
  },
  {
    key: "x",
    label: "X",
    openUrl: "https://x.com",
    buildUrl: (u: string) => `https://x.com/${u}`,
  },
  {
    key: "instagram",
    label: "Instagram",
    openUrl: "https://www.instagram.com",
    buildUrl: (u: string) => `https://www.instagram.com/${u}/`,
  },
] as const;

// ─── Input Detection ────────────────────────────────────────

function detectInputMode(text: string): InputMode {
  const t = text.trim();
  if (!t) return "empty";
  if (/^https?:\/\//i.test(t)) return "url";
  if (/(linkedin\.com|github\.com|twitter\.com|x\.com|instagram\.com)/i.test(t)) return "url";
  if (/\.\w{2,}\/\S/i.test(t)) return "url";
  return "text";
}

/** Does the text look like a person's name? (capitalized words with spaces) */
function looksLikeName(text: string): boolean {
  const t = text.trim();
  if (!t.includes(" ")) return false;
  const words = t.split(/\s+/);
  // At least 2 words, most start with uppercase
  return words.length >= 2 && words.filter(w => /^[A-Z]/.test(w)).length >= 2;
}

/** Is the name short/generic enough to benefit from extra context? */
function isGenericName(text: string): boolean {
  const words = text.trim().split(/\s+/);
  // 2-3 word names with no extra context like job/company
  return words.length <= 3 && words.every(w => /^[A-Z][a-z]+$/.test(w));
}

/** Clean raw input into a usable username slug */
function toUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").replace(/\s+/g, "-").toLowerCase();
}

// ─── Platform Icons ─────────────────────────────────────────

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  switch (platform) {
    case "linkedin": return <LinkedInIcon className={className} />;
    case "github": return <GitHubIcon className={className} />;
    case "x": return <XIcon className={className} />;
    case "instagram": return <InstagramIcon className={className} />;
    default: return null;
  }
}

// ─── Animation Config ───────────────────────────────────────

const hintAnim = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.15 },
};

// ─── Component ──────────────────────────────────────────────

export function ProfileStep({ onSubmit, onSkip }: ProfileStepProps) {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [enrichedProfile, setEnrichedProfile] = useState<EnrichedProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState("Looking up your profile...");
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up auto-submit timer on unmount
  useEffect(() => {
    return () => {
      if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    };
  }, []);

  const inputMode = detectInputMode(input);

  // ─── Enrichment ─────────────────────────────────────

  const handleEnrich = useCallback(async (profileUrl: string) => {
    const platform = detectPlatform(profileUrl);
    setLoadingText("Looking up your profile...");
    setPhase("loading");
    setError(null);

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: profileUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setEnrichedProfile(data.profile);
          setPhase("confirm");
          return;
        }
      }

      setEnrichedProfile({
        skills: [], experience: [], education: [],
        platform, sourceUrl: profileUrl,
        fetchedAt: new Date().toISOString(),
      });
      setPhase("confirm");
    } catch {
      setEnrichedProfile({
        skills: [], experience: [], education: [],
        platform: detectPlatform(profileUrl), sourceUrl: profileUrl,
        fetchedAt: new Date().toISOString(),
      });
      setPhase("confirm");
    }
  }, []);

  // ─── Auto-submit on URL paste ───────────────────────

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    if (detectInputMode(pasted) === "url") {
      if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
      autoSubmitTimer.current = setTimeout(() => handleEnrich(pasted), 500);
    }
  }

  // ─── Platform lookup (works for usernames or names) ─

  function handlePlatformLookup(platformKey: string) {
    const platform = PLATFORMS.find(p => p.key === platformKey);
    if (!platform) return;
    handleEnrich(platform.buildUrl(toUsername(input)));
  }

  // ─── Name/text search (Perplexity placeholder) ──────

  async function handleSearch() {
    const query = input.trim();
    setLoadingText(`Searching for "${query}"...`);
    setPhase("loading");
    setError(null);

    try {
      const res = await fetch("/api/search-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          handleEnrich(data.url);
          return;
        }
      }

      setError("Couldn't find a matching profile. Try pasting a direct link instead.");
      setPhase("input");
    } catch {
      setError("Search failed. Try pasting a profile link instead.");
      setPhase("input");
    }
  }

  // ─── Main submit (Enter key / button) ───────────────

  function handleSubmit() {
    const t = input.trim();
    if (!t) return;

    if (detectInputMode(t) === "url") {
      handleEnrich(t);
    } else {
      // For any non-URL text, search online
      handleSearch();
    }
  }

  // ─── Confirm ────────────────────────────────────────

  function handleConfirm() {
    if (!enrichedProfile) return;
    const profileUrl = enrichedProfile.sourceUrl || input.trim();
    const platform = enrichedProfile.platform;
    const hasMeaningfulData = !!(
      enrichedProfile.fullName ||
      enrichedProfile.headline ||
      enrichedProfile.currentTitle ||
      enrichedProfile.skills.length > 0 ||
      enrichedProfile.experience.length > 0
    );
    onSubmit(profileUrl, platform, hasMeaningfulData ? enrichedProfile : undefined);
  }

  // ─── Confirmation Screen ────────────────────────────

  if (phase === "confirm" && enrichedProfile) {
    return (
      <ProfileConfirmation
        profile={enrichedProfile}
        onConfirm={handleConfirm}
        onSkip={onSkip}
      />
    );
  }

  // ─── Loading Screen ─────────────────────────────────

  if (phase === "loading") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted-foreground">{loadingText}</p>
        </motion.div>
      </main>
    );
  }

  // ─── Input Screen ───────────────────────────────────

  const hasInput = input.trim().length > 0;

  return (
    <main className="flex min-h-dvh flex-col px-6 py-12">
      <div className="mx-auto w-full max-w-lg">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Link your profile
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Use your public profile to personalize recommendations
          </p>

          {error && (
            <p className="mt-3 text-sm text-rose-500">{error}</p>
          )}

          <div className="mt-6">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hasInput) handleSubmit();
              }}
              placeholder="Your name, profile link, or username..."
              autoFocus
              className="w-full rounded-xl border border-border bg-card px-4 py-4 text-base outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
            />
          </div>

          {/* Dynamic hints/actions based on input */}
          <div className="mt-4 min-h-[2.75rem]">
            <AnimatePresence mode="wait">
              {inputMode === "empty" && (
                <motion.div key="empty" {...hintAnim} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="mr-1">Find your profile on</span>
                  {PLATFORMS.map((p) => (
                    <a
                      key={p.key}
                      href={p.openUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:border-accent/30 hover:text-foreground"
                    >
                      <PlatformIcon platform={p.key} className="h-3.5 w-3.5" />
                      {p.label}
                    </a>
                  ))}
                </motion.div>
              )}

              {inputMode === "text" && (
                <motion.div key="text" {...hintAnim} className="flex flex-col gap-2">
                  {looksLikeName(input) ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        We&apos;ll search for your profile online
                      </p>
                      {isGenericName(input) && (
                        <p className="text-xs text-muted">
                          Common name? Add your company or job title for better results
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span className="mr-1">Try on</span>
                      {PLATFORMS.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => handlePlatformLookup(p.key)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:border-accent/30 hover:text-foreground"
                        >
                          <PlatformIcon platform={p.key} className="h-3.5 w-3.5" />
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {inputMode === "url" && (
                <motion.div key="url" {...hintAnim} className="text-sm text-muted-foreground">
                  Press Enter or tap Continue to look up this profile
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Skip
            </button>

            <button
              onClick={handleSubmit}
              disabled={!hasInput}
              className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-white transition-all hover:bg-accent-hover disabled:opacity-30 disabled:hover:bg-accent"
            >
              {inputMode === "text" ? "Search" : "Continue"}
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

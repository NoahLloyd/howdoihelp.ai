"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PublicGuide } from "@/app/api/guides/route";
import { MapPin, Globe, Calendar, ArrowRight } from "lucide-react";
import { GuideRequestModal } from "@/components/results/guide-request-modal";

// ─── Constants ──────────────────────────────────────────────

const HELP_TOPICS = [
  "Career transition into AI safety",
  "Technical alignment research",
  "AI governance & policy",
  "Effective altruism",
  "ML engineering",
  "Field building",
  "Communications & advocacy",
  "General career advice",
];

const CAREER_STAGES = [
  { value: "student", label: "Student" },
  { value: "early_career", label: "Early career (0-3 years)" },
  { value: "mid_career", label: "Mid-career (3-10 years)" },
  { value: "career_changer", label: "Career changer" },
  { value: "senior", label: "Senior / leadership" },
];

const BACKGROUNDS = [
  "Software engineering",
  "Machine learning / AI",
  "Philosophy / ethics",
  "Policy / government",
  "Nonprofit / EA orgs",
  "Academia / research",
  "Law",
  "Journalism / communications",
  "Product / design",
];

// ─── Matching ───────────────────────────────────────────────

function scoreGuide(
  guide: PublicGuide,
  topics: string[],
  careerStage: string | null,
  background: string | null
): number {
  let score = 0;

  // Topic match (strongest signal)
  const topicMatches = topics.filter((t) => guide.topics.includes(t)).length;
  score += topicMatches * 3;

  // Career stage match
  if (
    careerStage &&
    guide.preferred_career_stages.length > 0 &&
    guide.preferred_career_stages.includes(careerStage)
  ) {
    score += 2;
  }

  // If guide has no career stage preference, slight bonus (they're open to anyone)
  if (careerStage && guide.preferred_career_stages.length === 0) {
    score += 1;
  }

  // Background match
  if (
    background &&
    guide.preferred_backgrounds.length > 0 &&
    guide.preferred_backgrounds.includes(background)
  ) {
    score += 2;
  }

  // If guide has no background preference, slight bonus
  if (background && guide.preferred_backgrounds.length === 0) {
    score += 1;
  }

  return score;
}

// ─── Component ──────────────────────────────────────────────

interface GuidesListingProps {
  initialGuides: PublicGuide[];
}

export function GuidesListing({ initialGuides }: GuidesListingProps) {
  const [step, setStep] = useState<"form" | "results">("form");

  // Form state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [careerStage, setCareerStage] = useState<string | null>(null);
  const [background, setBackground] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  const matchedGuides = useMemo(() => {
    if (selectedTopics.length === 0) return [];

    const scored = initialGuides
      .map((guide) => ({
        guide,
        score: scoreGuide(guide, selectedTopics, careerStage, background),
      }))
      .filter((item) => item.score >= 2) // Minimum match threshold
      .sort((a, b) => b.score - a.score);

    return scored.map((item) => item.guide);
  }, [initialGuides, selectedTopics, careerStage, background]);

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  }

  function handleSubmit() {
    setStep("results");
  }

  if (initialGuides.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-lg text-muted-foreground">
          No guides available yet. Check back soon!
        </p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {step === "form" ? (
        <motion.div
          key="form"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {/* Topic selection */}
          <div>
            <label className="text-sm font-medium text-foreground">
              What would you like help with?
            </label>
            <p className="text-xs text-muted mt-1 mb-3">
              Select all that apply
            </p>
            <div className="flex flex-col gap-2">
              {HELP_TOPICS.map((topic) => {
                const selected = selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm transition-all cursor-pointer hover:border-accent/50 ${
                      selected
                        ? "border-accent bg-accent/10 font-medium text-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Career stage */}
          <div className="mt-8">
            <label className="text-sm font-medium text-foreground">
              Where are you in your career?
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {CAREER_STAGES.map((stage) => (
                <button
                  key={stage.value}
                  onClick={() =>
                    setCareerStage(
                      careerStage === stage.value ? null : stage.value
                    )
                  }
                  className={`rounded-full border px-3.5 py-2 text-sm transition-all cursor-pointer hover:border-accent/50 ${
                    careerStage === stage.value
                      ? "border-accent bg-accent/10 text-foreground font-medium"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {stage.label}
                </button>
              ))}
            </div>
          </div>

          {/* Background */}
          <div className="mt-8">
            <label className="text-sm font-medium text-foreground">
              Your background
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg}
                  onClick={() =>
                    setBackground(background === bg ? null : bg)
                  }
                  className={`rounded-full border px-3.5 py-2 text-sm transition-all cursor-pointer hover:border-accent/50 ${
                    background === bg
                      ? "border-accent bg-accent/10 text-foreground font-medium"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {bg}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="mt-8">
            <label
              htmlFor="guide-desc"
              className="text-sm font-medium text-foreground"
            >
              Anything else you want a guide to know?
            </label>
            <p className="text-xs text-muted mt-1 mb-2">Optional</p>
            <textarea
              id="guide-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. I'm a software engineer exploring a transition into alignment research, looking for someone who's done this recently"
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20 resize-none"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={selectedTopics.length === 0}
            className="mt-8 group w-full rounded-xl bg-accent px-6 py-4 text-base font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
          >
            Find my matches
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="results"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {matchedGuides.length > 0 ? (
            <>
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">
                  We found{" "}
                  <span className="font-medium text-foreground">
                    {matchedGuides.length}
                  </span>{" "}
                  {matchedGuides.length === 1 ? "guide" : "guides"} who{" "}
                  {matchedGuides.length === 1 ? "is" : "are"} a great fit
                  for you.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {matchedGuides.map((guide, i) => (
                  <GuideCard key={guide.id} guide={guide} index={i} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-card-hover flex items-center justify-center mb-5">
                <Calendar className="h-6 w-6 text-muted" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                No perfect matches yet
              </h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                We don&apos;t have a guide who&apos;s a strong match for your
                specific needs right now. We&apos;re growing our guide network
                and will have more options soon.
              </p>
            </div>
          )}

          <button
            onClick={() => setStep("form")}
            className="mt-8 w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Back to form
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Guide Card ─────────────────────────────────────────────

function GuideCard({ guide, index }: { guide: PublicGuide; index: number }) {
  const [showModal, setShowModal] = useState(false);
  const isDirectBooking = guide.booking_mode === "direct";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 * Math.min(index, 8), duration: 0.3 }}
        className="rounded-2xl border border-border bg-card p-5 hover:border-accent/30 hover:bg-card-hover transition-all"
      >
        <div className="flex items-start gap-3.5">
          {guide.avatar_url ? (
            <img
              src={guide.avatar_url}
              alt=""
              className="h-12 w-12 rounded-full border border-border object-cover shrink-0"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card-hover text-sm font-medium text-muted-foreground shrink-0">
              {(guide.display_name || "?")[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground truncate">
              {guide.display_name || "Guide"}
            </p>
            {guide.headline && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {guide.headline}
              </p>
            )}
          </div>
        </div>

        {guide.bio && (
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {guide.bio}
          </p>
        )}

        {guide.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {guide.topics.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
              >
                {t}
              </span>
            ))}
            {guide.topics.length > 3 && (
              <span className="rounded-full bg-card-hover px-2 py-0.5 text-[11px] font-medium text-muted">
                +{guide.topics.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {guide.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {guide.location}
            </span>
          )}
          {guide.languages.length > 1 && (
            <span className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {guide.languages.join(", ")}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            30 min video call
          </span>
        </div>

        {isDirectBooking ? (
          <a
            href={guide.calendar_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            <Calendar className="h-4 w-4" />
            Book a call
          </a>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
          >
            <Calendar className="h-4 w-4" />
            Request a call
          </button>
        )}
      </motion.div>

      {showModal && (
        <GuideRequestModal
          guide={guide}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

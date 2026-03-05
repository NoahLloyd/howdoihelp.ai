"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/providers/auth-provider";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  getGuideSettings,
  saveGuideSettings,
  getProfile,
  updateProfile,
  uploadAvatar,
} from "../actions";
import { LanguageSelect } from "@/components/ui/language-select";

// ─── Constants ──────────────────────────────────────────────

const TOPIC_OPTIONS = [
  "Career transition into AI safety",
  "Technical alignment research",
  "AI governance & policy",
  "Effective altruism",
  "ML engineering",
  "Field building",
  "Communications & advocacy",
  "General career advice",
];

const CAREER_STAGE_OPTIONS = [
  { value: "student", label: "Students", desc: "Undergrad, master's, or PhD" },
  {
    value: "early_career",
    label: "Early career",
    desc: "0-3 years of experience",
  },
  {
    value: "mid_career",
    label: "Mid-career professionals",
    desc: "3-10 years in their field",
  },
  {
    value: "career_changer",
    label: "Career changers",
    desc: "Pivoting from another field",
  },
  {
    value: "senior",
    label: "Senior / leadership",
    desc: "10+ years, director level+",
  },
];

const BACKGROUND_OPTIONS = [
  "Software engineering",
  "Machine learning / AI",
  "Philosophy / ethics",
  "Policy / government",
  "Nonprofit / EA orgs",
  "Academia / research",
  "Law",
  "Journalism / communications",
  "Product / design",
  "Other",
];

const EXPERIENCE_LEVEL_OPTIONS = [
  {
    value: "brand_new",
    label: "Brand new to AI safety",
    desc: "Just starting to learn about the field",
  },
  {
    value: "exploring",
    label: "Actively exploring",
    desc: "Reading, taking courses, attending events",
  },
  {
    value: "transitioning",
    label: "Transitioning in",
    desc: "Applying to roles, doing research",
  },
  {
    value: "working",
    label: "Already working in AI safety",
    desc: "Looking for guidance on next steps",
  },
];

const GEO_OPTIONS = [
  { value: "anywhere", label: "Anyone, anywhere", desc: "No geographic restrictions" },
  { value: "same_timezone", label: "Only same timezone", desc: "Easier to schedule calls" },
  { value: "same_country", label: "Only same country", desc: "Shared context and culture" },
  { value: "same_city", label: "Only same city", desc: "Option for in-person meetups" },
];

type GuideStatus = "draft" | "active" | "paused";

const TOTAL_STEPS = 4;

// ─── Animations ─────────────────────────────────────────────

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
  }),
};

// ─── Component ──────────────────────────────────────────────

export default function GuideSettingsPage() {
  const { profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  // Form state - intro
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Form state - topics
  const [topics, setTopics] = useState<string[]>([]);
  const [bestFor, setBestFor] = useState("");
  const [customTopic, setCustomTopic] = useState("");

  // Form state - who to talk to
  const [customBackground, setCustomBackground] = useState("");
  const [preferredCareerStages, setPreferredCareerStages] = useState<string[]>(
    []
  );
  const [preferredBackgrounds, setPreferredBackgrounds] = useState<string[]>(
    []
  );
  const [preferredExperienceLevel, setPreferredExperienceLevel] = useState<
    string[]
  >([]);
  const [notAGoodFit, setNotAGoodFit] = useState("");

  // Form state - availability
  const [calendarLink, setCalendarLink] = useState("");
  const [location, setLocation] = useState("");
  const [isAvailableInPerson, setIsAvailableInPerson] = useState(false);
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [geographicPreference, setGeographicPreference] =
    useState("anywhere");

  // Form state - booking
  const [bookingMode, setBookingMode] = useState<"direct" | "approval_required">("direct");

  // Form state - review
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [status, setStatus] = useState<GuideStatus>("draft");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing data
  useEffect(() => {
    Promise.all([getGuideSettings(), getProfile()])
      .then(([guide, profile]) => {
        if (guide) {
          setHeadline(guide.headline || "");
          setCalendarLink(guide.calendar_link || "");
          setTopics(guide.topics || []);
          setBestFor(guide.best_for || "");
          setLocation(guide.location || "");
          setIsAvailableInPerson(guide.is_available_in_person);
          setLinkedinUrl(guide.linkedin_url || "");
          setWebsiteUrl(guide.website_url || "");
          setStatus(guide.status);
          setPreferredCareerStages(guide.preferred_career_stages || []);
          setPreferredBackgrounds(guide.preferred_backgrounds || []);
          setPreferredExperienceLevel(guide.preferred_experience_level || []);
          setLanguages(
            guide.languages?.length ? guide.languages : ["English"]
          );
          setNotAGoodFit(guide.not_a_good_fit || "");
          setGeographicPreference(guide.geographic_preference || "anywhere");
          setBookingMode(guide.booking_mode || "direct");
        }
        if (profile) {
          setBio(profile.bio || "");
          setAvatarUrl(profile.avatar_url);
          if (!guide?.location && profile.location) {
            setLocation(profile.location);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ─── Navigation ─────────────────────────────────────────

  const progress = ((stepIndex + 1) / TOTAL_STEPS) * 100;

  function goNext() {
    if (stepIndex >= TOTAL_STEPS - 1) return;
    setDirection(1);
    setStepIndex((i) => i + 1);
  }

  function goBack() {
    if (stepIndex <= 0) return;
    setDirection(-1);
    setStepIndex((i) => i - 1);
  }

  function toggleInArray(
    arr: string[],
    val: string,
    setter: (v: string[]) => void
  ) {
    setter(
      arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]
    );
  }

  // ─── Avatar Upload ────────────────────────────────────────

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB");
      return;
    }

    setUploadingAvatar(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = await uploadAvatar(formData);
      setAvatarUrl(url);
      refreshProfile?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload image"
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  // ─── Save ─────────────────────────────────────────────────

  async function handleSave(finalStatus: GuideStatus) {
    setSaving(true);
    setError(null);

    try {
      await updateProfile({ bio, location });
      await saveGuideSettings({
        status: finalStatus,
        headline,
        calendar_link: calendarLink || null,
        capacity_per_month: null,
        meeting_duration_minutes: 30,
        topics,
        expertise_areas: [],
        best_for: bestFor || null,
        location: location || null,
        is_available_in_person: isAvailableInPerson,
        linkedin_url: linkedinUrl || null,
        website_url: websiteUrl || null,
        preferred_career_stages: preferredCareerStages,
        preferred_backgrounds: preferredBackgrounds,
        preferred_experience_level: preferredExperienceLevel,
        call_format: "one_off",
        languages,
        not_a_good_fit: notAGoodFit || null,
        geographic_preference: geographicPreference,
        booking_mode: bookingMode,
      });

      setStatus(finalStatus);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  // ─── Loading ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const displayName =
    authProfile?.display_name ||
    authProfile?.email?.split("@")[0] ||
    "there";
  const firstName = displayName.split(" ")[0];
  const currentAvatar = avatarUrl || authProfile?.avatar_url;

  // ─── Render ─────────────────────────────────────────────

  return (
    <div>
      <ProgressBar progress={progress} />

      <div className="relative mt-10 min-h-[480px]">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ── Step 0: Intro ─────────────────────────────────── */}
          {stepIndex === 0 && (
            <motion.div
              key="about"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                First, introduce yourself.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                This is what someone sees before deciding to book time with
                you. Make it personal.
              </p>

              {/* Avatar upload */}
              <div className="mt-8 flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="relative group shrink-0 cursor-pointer"
                >
                  {currentAvatar ? (
                    <img
                      src={currentAvatar}
                      alt=""
                      className="h-20 w-20 rounded-full border-2 border-border object-cover transition-opacity group-hover:opacity-80"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-card-hover border-2 border-dashed border-border text-xl font-medium text-muted-foreground transition-colors group-hover:border-accent/50 group-hover:text-foreground">
                      {firstName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingAvatar ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <svg
                        className="h-5 w-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                        />
                      </svg>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </button>

                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {currentAvatar ? "Change photo" : "Add a photo"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Helps people feel like they know you
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-5">
                <div>
                  <label
                    htmlFor="headline"
                    className="text-sm font-medium text-foreground"
                  >
                    One-line headline
                  </label>
                  <input
                    id="headline"
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="AI policy researcher at RAND · happy to chat about governance careers"
                    maxLength={120}
                    autoFocus
                    className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-4 text-base outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="bio"
                    className="text-sm font-medium text-foreground"
                  >
                    About you
                  </label>
                  <textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="What's your background? Why do you care about AI safety? What kind of conversations do you enjoy having?"
                    rows={5}
                    className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-4 text-base outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20 resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 1: Topics ────────────────────────────────── */}
          {stepIndex === 1 && (
            <motion.div
              key="topics"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                What can you help with?
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                We&apos;ll use this to match you with the right people. Pick
                as many as you like.
              </p>

              <div className="mt-8 flex flex-col gap-2.5">
                {TOPIC_OPTIONS.map((topic) => {
                  const selected = topics.includes(topic);
                  return (
                    <button
                      key={topic}
                      onClick={() =>
                        toggleInArray(topics, topic, setTopics)
                      }
                      className={`w-full rounded-xl border px-4 py-4 text-left text-base transition-all cursor-pointer hover:border-accent/50 hover:bg-card-hover ${
                        selected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <span className="font-medium">{topic}</span>
                    </button>
                  );
                })}

                {/* Custom topics added by the user */}
                {topics
                  .filter((t) => !TOPIC_OPTIONS.includes(t))
                  .map((t) => (
                    <button
                      key={t}
                      onClick={() => setTopics(topics.filter((x) => x !== t))}
                      className="w-full rounded-xl border border-accent bg-accent/10 px-4 py-4 text-left text-base transition-all cursor-pointer hover:border-accent/50 hover:bg-card-hover group"
                    >
                      <span className="font-medium flex items-center justify-between">
                        {t}
                        <span className="text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          Remove
                        </span>
                      </span>
                    </button>
                  ))}

                {/* Add custom topic */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = customTopic.trim();
                    if (trimmed && !topics.includes(trimmed)) {
                      setTopics([...topics, trimmed]);
                      setCustomTopic("");
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="Add your own topic..."
                    className="flex-1 rounded-xl border border-dashed border-border bg-card px-4 py-4 text-base outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />
                  {customTopic.trim() && (
                    <button
                      type="submit"
                      className="shrink-0 rounded-xl bg-accent px-4 py-4 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  )}
                </form>
              </div>

              <div className="mt-6">
                <label
                  htmlFor="bestFor"
                  className="text-sm font-medium text-foreground"
                >
                  Anything else about who you&apos;re best for?
                </label>
                <input
                  id="bestFor"
                  type="text"
                  value={bestFor}
                  onChange={(e) => setBestFor(e.target.value)}
                  placeholder="e.g. people pivoting from software engineering, grad students considering alignment research"
                  className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Who do you want to talk to ────────────── */}
          {stepIndex === 2 && (
            <motion.div
              key="who"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Who do you want to talk to?
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Help us send you people you&apos;ll actually enjoy helping.
                Leave anything blank if you don&apos;t have a preference.
              </p>

              <div className="mt-8 flex flex-col gap-8">
                {/* Career stage */}
                <div>
                  <label className="text-sm font-medium text-foreground">
                    What career stage?
                  </label>
                  <div className="mt-3 flex flex-col gap-2">
                    {CAREER_STAGE_OPTIONS.map((opt) => {
                      const selected = preferredCareerStages.includes(
                        opt.value
                      );
                      return (
                        <button
                          key={opt.value}
                          onClick={() =>
                            toggleInArray(
                              preferredCareerStages,
                              opt.value,
                              setPreferredCareerStages
                            )
                          }
                          className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all cursor-pointer hover:border-accent/50 ${
                            selected
                              ? "border-accent bg-accent/10"
                              : "border-border bg-card"
                          }`}
                        >
                          <span className="block text-sm font-medium text-foreground">
                            {opt.label}
                          </span>
                          <span className="block text-xs text-muted mt-0.5">
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Background */}
                <div>
                  <label className="text-sm font-medium text-foreground">
                    What backgrounds?
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BACKGROUND_OPTIONS.filter((bg) => bg !== "Other").map((bg) => {
                      const selected = preferredBackgrounds.includes(bg);
                      return (
                        <button
                          key={bg}
                          onClick={() =>
                            toggleInArray(
                              preferredBackgrounds,
                              bg,
                              setPreferredBackgrounds
                            )
                          }
                          className={`rounded-full border px-3.5 py-2 text-sm transition-all cursor-pointer hover:border-accent/50 ${
                            selected
                              ? "border-accent bg-accent/10 text-foreground font-medium"
                              : "border-border bg-card text-muted-foreground"
                          }`}
                        >
                          {bg}
                        </button>
                      );
                    })}

                    {/* Custom backgrounds */}
                    {preferredBackgrounds
                      .filter((bg) => !BACKGROUND_OPTIONS.includes(bg))
                      .map((bg) => (
                        <button
                          key={bg}
                          onClick={() =>
                            setPreferredBackgrounds(
                              preferredBackgrounds.filter((x) => x !== bg)
                            )
                          }
                          className="rounded-full border border-accent bg-accent/10 px-3.5 py-2 text-sm font-medium text-foreground transition-all cursor-pointer hover:border-accent/50 group"
                        >
                          {bg}
                          <span className="ml-1.5 text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                            ×
                          </span>
                        </button>
                      ))}
                  </div>

                  {/* Add custom background */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = customBackground.trim();
                      if (
                        trimmed &&
                        !preferredBackgrounds.includes(trimmed)
                      ) {
                        setPreferredBackgrounds([
                          ...preferredBackgrounds,
                          trimmed,
                        ]);
                        setCustomBackground("");
                      }
                    }}
                    className="mt-2 flex gap-2"
                  >
                    <input
                      type="text"
                      value={customBackground}
                      onChange={(e) => setCustomBackground(e.target.value)}
                      placeholder="Add another background..."
                      className="flex-1 rounded-full border border-dashed border-border bg-card px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                    />
                    {customBackground.trim() && (
                      <button
                        type="submit"
                        className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                    )}
                  </form>
                </div>

                {/* AI safety experience */}
                <div>
                  <label className="text-sm font-medium text-foreground">
                    How familiar with AI safety?
                  </label>
                  <div className="mt-3 flex flex-col gap-2">
                    {EXPERIENCE_LEVEL_OPTIONS.map((opt) => {
                      const selected = preferredExperienceLevel.includes(
                        opt.value
                      );
                      return (
                        <button
                          key={opt.value}
                          onClick={() =>
                            toggleInArray(
                              preferredExperienceLevel,
                              opt.value,
                              setPreferredExperienceLevel
                            )
                          }
                          className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all cursor-pointer hover:border-accent/50 ${
                            selected
                              ? "border-accent bg-accent/10"
                              : "border-border bg-card"
                          }`}
                        >
                          <span className="block text-sm font-medium text-foreground">
                            {opt.label}
                          </span>
                          <span className="block text-xs text-muted mt-0.5">
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Not a good fit */}
                <div>
                  <label
                    htmlFor="notGoodFit"
                    className="text-sm font-medium text-foreground"
                  >
                    Who are you <em>not</em> a good fit for?
                  </label>
                  <p className="text-xs text-muted mt-0.5 mb-2">
                    Totally optional. Helps us avoid bad matches
                  </p>
                  <textarea
                    id="notGoodFit"
                    value={notAGoodFit}
                    onChange={(e) => setNotAGoodFit(e.target.value)}
                    placeholder="e.g. I don't have good advice for people looking to start AI companies, or anyone focused on near-term AI ethics rather than x-risk"
                    rows={3}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20 resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Availability + Review ─────────────────── */}
          {stepIndex === 3 && (
            <motion.div
              key="availability-review"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Almost there.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Add your booking link so people can schedule a 30-minute video
                call with you.
              </p>

              <div className="mt-8 flex flex-col gap-6">
                {/* Calendar */}
                <div>
                  <label
                    htmlFor="calendar"
                    className="text-sm font-medium text-foreground"
                  >
                    Booking link
                  </label>
                  <p className="text-xs text-muted mt-0.5 mb-2">
                    Required to go live. Calendly, Cal.com, or any scheduling
                    tool works.
                  </p>
                  <input
                    id="calendar"
                    type="url"
                    value={calendarLink}
                    onChange={(e) => setCalendarLink(e.target.value)}
                    placeholder="https://calendly.com/you/30min"
                    autoFocus
                    className="w-full rounded-xl border border-border bg-card px-4 py-4 text-base outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                {/* Booking mode */}
                <div>
                  <label className="text-sm font-medium text-foreground">
                    How should people book with you?
                  </label>
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setBookingMode("direct")}
                      className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all cursor-pointer hover:border-accent/50 ${
                        bookingMode === "direct"
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <span className="block text-sm font-medium text-foreground">
                        Direct booking
                      </span>
                      <span className="block text-xs text-muted mt-0.5">
                        Anyone matched with you can book directly through your link
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingMode("approval_required")}
                      className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all cursor-pointer hover:border-accent/50 ${
                        bookingMode === "approval_required"
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <span className="block text-sm font-medium text-foreground">
                        Review requests first
                      </span>
                      <span className="block text-xs text-muted mt-0.5">
                        People send you a message and you decide whether to share your booking link
                      </span>
                    </button>
                  </div>
                </div>

                {/* Languages */}
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Languages you can do calls in
                  </label>
                  <div className="mt-2">
                    <LanguageSelect
                      value={languages}
                      onChange={setLanguages}
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label
                    htmlFor="location"
                    className="text-sm font-medium text-foreground"
                  >
                    Where are you based?
                  </label>
                  <input
                    id="location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="San Francisco, CA"
                    className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />

                  {location.trim() && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-2 flex flex-col gap-2"
                    >
                      <button
                        onClick={() =>
                          setIsAvailableInPerson(!isAvailableInPerson)
                        }
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all cursor-pointer ${
                          isAvailableInPerson
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-accent/50"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                            isAvailableInPerson ? "bg-accent" : "bg-border"
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              isAvailableInPerson
                                ? "translate-x-4"
                                : "translate-x-0"
                            }`}
                          />
                        </span>
                        Also open to meeting in person
                      </button>
                    </motion.div>
                  )}
                </div>

                {/* Geographic preference */}
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Geographic preference for mentees
                  </label>
                  <div className="mt-3 flex flex-col gap-2">
                    {GEO_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setGeographicPreference(opt.value)}
                        className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all cursor-pointer hover:border-accent/50 ${
                          geographicPreference === opt.value
                            ? "border-accent bg-accent/10"
                            : "border-border bg-card"
                        }`}
                      >
                        <span className="block text-sm font-medium text-foreground">
                          {opt.label}
                        </span>
                        <span className="block text-xs text-muted mt-0.5">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional links */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="LinkedIn URL (optional)"
                    className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="Website (optional)"
                    className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              </div>

              {/* Preview card */}
              <div className="mt-10">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Preview
                </p>
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-start gap-4">
                    {currentAvatar ? (
                      <img
                        src={currentAvatar}
                        alt=""
                        className="h-14 w-14 rounded-full border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-card-hover text-base font-medium text-muted-foreground">
                        {firstName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold text-foreground">
                        {displayName}
                      </p>
                      {headline && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {headline}
                        </p>
                      )}
                    </div>
                  </div>

                  {bio && (
                    <p className="mt-4 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {bio}
                    </p>
                  )}

                  {topics.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {topics.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 text-xs text-muted">
                    30 min video call
                    {location ? ` · ${location}` : ""}
                    {languages.length > 1
                      ? ` · ${languages.join(", ")}`
                      : ""}
                  </div>

                  {calendarLink && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <span className="inline-flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                          />
                        </svg>
                        Book a call
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Save actions */}
              {error && (
                <p className="mt-4 text-sm text-rose-500">{error}</p>
              )}

              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={() => handleSave("active")}
                  disabled={saving || !calendarLink.trim()}
                  className="w-full rounded-xl bg-accent px-6 py-4 text-base font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Saving..." : "Go live"}
                </button>

                {!calendarLink.trim() && (
                  <p className="text-center text-xs text-muted">
                    Add a booking link to go live
                  </p>
                )}

                <button
                  onClick={() => handleSave("draft")}
                  disabled={saving}
                  className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Save as draft for now
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        {stepIndex > 0 ? (
          <button
            onClick={goBack}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Back
          </button>
        ) : (
          <span />
        )}

        {stepIndex < TOTAL_STEPS - 1 && (
          <button
            onClick={goNext}
            className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-white transition-all hover:bg-accent-hover cursor-pointer"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

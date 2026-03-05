"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getCreatorPage,
  saveCreatorPage,
  checkSlugAvailable,
} from "../actions";
import { fetchResources } from "@/lib/data";
import {
  ExternalLink,
  GripVertical,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Ban,
  Star,
} from "lucide-react";
import type {
  CreatorFlowStep,
  CreatorWelcomeStep,
  CreatorQuestionsStep,
  CreatorProfileStep,
  CreatorResultsStep,
  CreatorCustomQuestion,
  Resource,
} from "@/types";

// ─── Default flow config ────────────────────────────────────

const DEFAULT_FLOW: CreatorFlowStep[] = [
  {
    type: "welcome",
    title: "You want to help.",
    subtitle: "A few quick questions, then we'll find the best ways for you to help with AI safety.",
  },
  {
    type: "questions",
    useDefaults: true,
    customQuestions: [],
  },
  {
    type: "results",
    style: "browse",
  },
];

// ─── Step type labels ───────────────────────────────────────

const STEP_LABELS: Record<CreatorFlowStep["type"], string> = {
  welcome: "Welcome Screen",
  questions: "Questions",
  profile: "Profile Input",
  results: "Results",
};

const STEP_DESCRIPTIONS: Record<CreatorFlowStep["type"], string> = {
  welcome: "A hero screen with your custom title and subtitle",
  questions: "Ask visitors questions to personalize their results",
  profile: "Let visitors share their LinkedIn or social profile for personalized recommendations",
  results: "Show personalized or browsable results",
};

// ─── Available step templates ───────────────────────────────

const ADDABLE_STEPS: { type: CreatorFlowStep["type"]; create: () => CreatorFlowStep }[] = [
  {
    type: "welcome",
    create: () => ({
      type: "welcome",
      title: "Welcome",
      subtitle: "Let's get started.",
    }),
  },
  {
    type: "questions",
    create: () => ({
      type: "questions",
      useDefaults: true,
      customQuestions: [],
    }),
  },
  {
    type: "profile",
    create: () => ({ type: "profile" }),
  },
  {
    type: "results",
    create: () => ({ type: "results", style: "browse" as const }),
  },
];

// ─── Main Component ─────────────────────────────────────────

export default function CreatorPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Creator page state
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugValid, setSlugValid] = useState(false);
  const [status, setStatus] = useState<"draft" | "active" | "paused">("draft");
  const [steps, setSteps] = useState<CreatorFlowStep[]>(DEFAULT_FLOW);
  const [excludedResources, setExcludedResources] = useState<string[]>([]);
  const [boostedResources, setBoostedResources] = useState<string[]>([]);
  const [resourceWeights, setResourceWeights] = useState<Record<string, number>>({});

  // Resources for the override editor
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [resourceSearch, setResourceSearch] = useState("");

  // Expanded sections
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [showResources, setShowResources] = useState(false);

  // Has existing page
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const [page, resources] = await Promise.all([
          getCreatorPage(),
          fetchResources(),
        ]);
        setAllResources(resources);

        if (page) {
          setHasExisting(true);
          setSlug(page.slug);
          setSlugValid(true);
          setStatus(page.status);
          setSteps(page.flow_config);
          setExcludedResources(page.excluded_resources);
          setBoostedResources(page.boosted_resources);
          setResourceWeights(page.resource_weights);
        }
      } catch {
        // No existing page
      }
      setLoading(false);
    }
    init();
  }, []);

  // Slug validation with debounce
  useEffect(() => {
    if (!slug) {
      setSlugError(null);
      setSlugValid(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setSlugChecking(true);
      const result = await checkSlugAvailable(slug);
      setSlugChecking(false);
      if (result.available) {
        setSlugError(null);
        setSlugValid(true);
      } else {
        setSlugError(result.reason || "Not available");
        setSlugValid(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [slug]);

  async function handleSave() {
    if (!slug || !slugValid) return;
    setSaving(true);
    try {
      await saveCreatorPage({
        slug,
        status,
        flow_config: steps,
        excluded_resources: excludedResources,
        boosted_resources: boostedResources,
        resource_weights: resourceWeights,
      });
      setHasExisting(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  }

  function moveStep(index: number, direction: -1 | 1) {
    const newSteps = [...steps];
    const target = index + direction;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    setSteps(newSteps);
    setExpandedStep(target);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setExpandedStep(null);
  }

  function updateStep(index: number, updated: CreatorFlowStep) {
    setSteps((prev) => prev.map((s, i) => (i === index ? updated : s)));
  }

  function addStep(step: CreatorFlowStep) {
    setSteps((prev) => [...prev, step]);
    setShowAddStep(false);
    setExpandedStep(steps.length);
  }

  // Resource override helpers
  const toggleExclude = useCallback((id: string) => {
    setExcludedResources((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
    // Remove from boosted if excluding
    setBoostedResources((prev) => prev.filter((r) => r !== id));
  }, []);

  const toggleBoost = useCallback((id: string) => {
    setBoostedResources((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
    // Remove from excluded if boosting
    setExcludedResources((prev) => prev.filter((r) => r !== id));
  }, []);

  const filteredResources = allResources.filter((r) => {
    if (!resourceSearch) return true;
    const q = resourceSearch.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.source_org.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="pb-16"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Creator Page
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-lg">
            Build a custom flow for your audience. They&apos;ll visit your
            personalized URL and get a tailored experience.
          </p>
        </div>
      </div>

      {/* ── Slug Picker ──────────────────────────────────── */}
      <section className="mt-8">
        <label className="block text-sm font-medium text-foreground mb-2">
          Your URL
        </label>
        <div className="flex items-center gap-0">
          <span className="rounded-l-xl border border-r-0 border-border bg-card-hover px-3 py-3 text-sm text-muted-foreground">
            howdoihelp.ai/
          </span>
          <div className="relative flex-1">
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                setSlug(v);
              }}
              placeholder="your-name"
              className="w-full rounded-r-xl border border-border bg-card px-3 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
            />
            {slug && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugChecking ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-accent" />
                ) : slugValid ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : slugError ? (
                  <X className="h-4 w-4 text-rose-500" />
                ) : null}
              </div>
            )}
          </div>
        </div>
        {slugError && (
          <p className="mt-1.5 text-xs text-rose-500">{slugError}</p>
        )}
        {slugValid && slug && (
          <p className="mt-1.5 text-xs text-emerald-600">
            howdoihelp.ai/{slug} is available
          </p>
        )}
      </section>

      {/* ── Flow Builder ─────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Flow Steps</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the steps visitors go through. Drag to reorder, expand to customize.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {steps.map((step, index) => (
            <div
              key={`${step.type}-${index}`}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Step header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-card-hover transition-colors"
                onClick={() => setExpandedStep(expandedStep === index ? null : index)}
              >
                <GripVertical className="h-4 w-4 text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {index + 1}. {STEP_LABELS[step.type]}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {STEP_DESCRIPTIONS[step.type]}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {index > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); moveStep(index, -1); }}
                      className="rounded p-1 text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {index < steps.length - 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); moveStep(index, 1); }}
                      className="rounded p-1 text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {steps.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeStep(index); }}
                      className="rounded p-1 text-muted hover:text-rose-500 hover:bg-card-hover transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded editor */}
              <AnimatePresence>
                {expandedStep === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border px-4 py-4">
                      <StepEditor
                        step={step}
                        onChange={(updated) => updateStep(index, updated)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Add step button */}
        <div className="mt-3">
          {showAddStep ? (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Add a step</p>
              <div className="flex flex-wrap gap-2">
                {ADDABLE_STEPS.map((s) => (
                  <button
                    key={s.type}
                    onClick={() => addStep(s.create())}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:border-accent/50 hover:bg-card-hover transition-all"
                  >
                    {STEP_LABELS[s.type]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAddStep(false)}
                className="mt-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddStep(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:border-accent/50 hover:text-foreground transition-all w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              Add step
            </button>
          )}
        </div>
      </section>

      {/* ── Resource Overrides ───────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Resource Overrides</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control which resources your audience sees.
        </p>

        <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
          {/* Card header — always visible */}
          <div
            className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-card-hover transition-colors"
            onClick={() => setShowResources(!showResources)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {excludedResources.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">
                    <Ban className="h-3 w-3" />
                    {excludedResources.length} hidden
                  </span>
                )}
                {boostedResources.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                    <Star className="h-3 w-3" fill="currentColor" />
                    {boostedResources.length} boosted
                  </span>
                )}
                {excludedResources.length === 0 && boostedResources.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No overrides set. All resources will be shown.
                  </span>
                )}
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                Click <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><Star className="h-3 w-3" fill="currentColor" /> boost</span> to prioritize or <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400"><Ban className="h-3 w-3" /> hide</span> to exclude from your page
              </p>
            </div>
            <button className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card-hover transition-colors">
              {showResources ? "Collapse" : "Edit"}
            </button>
          </div>

          {/* Expanded resource list */}
          <AnimatePresence>
            {showResources && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="border-t border-border px-5 py-4">
                  {/* Search */}
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      value={resourceSearch}
                      onChange={(e) => setResourceSearch(e.target.value)}
                      placeholder="Search resources..."
                      className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
                    {filteredResources.map((resource) => {
                      const isExcluded = excludedResources.includes(resource.id);
                      const isBoosted = boostedResources.includes(resource.id);

                      return (
                        <div
                          key={resource.id}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                            isExcluded
                              ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/30 dark:bg-rose-950/20"
                              : isBoosted
                                ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20"
                                : "border-border bg-card"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isExcluded ? "text-muted-foreground line-through" : "text-foreground"}`}>
                              {resource.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {resource.source_org} · {resource.category}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleBoost(resource.id)}
                              className={`rounded-lg p-1.5 text-xs transition-colors ${
                                isBoosted
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                  : "text-muted hover:text-foreground hover:bg-card-hover"
                              }`}
                              title={isBoosted ? "Remove boost" : "Boost this resource"}
                            >
                              <Star className="h-3.5 w-3.5" fill={isBoosted ? "currentColor" : "none"} />
                            </button>
                            <button
                              onClick={() => toggleExclude(resource.id)}
                              className={`rounded-lg p-1.5 text-xs transition-colors ${
                                isExcluded
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
                                  : "text-muted hover:text-foreground hover:bg-card-hover"
                              }`}
                              title={isExcluded ? "Show this resource" : "Hide this resource"}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── Status & Save ────────────────────────────────── */}
      <section className="mt-10 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Page Status</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {status === "active"
                ? "Your page is live and accessible"
                : status === "paused"
                  ? "Your page is hidden from visitors"
                  : "Your page is saved as a draft"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {["draft", "active", "paused"].map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s as typeof status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  status === s
                    ? s === "active"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : s === "paused"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !slug || !slugValid}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>

          {hasExisting && status === "active" && (
            <a
              href={`/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent/50 hover:bg-card-hover transition-all"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View page
            </a>
          )}
        </div>
      </section>
    </motion.div>
  );
}

// ─── Step Editor ──────────────────────────────────────────

function StepEditor({
  step,
  onChange,
}: {
  step: CreatorFlowStep;
  onChange: (step: CreatorFlowStep) => void;
}) {
  switch (step.type) {
    case "welcome":
      return <WelcomeEditor step={step} onChange={onChange} />;
    case "questions":
      return <QuestionsEditor step={step} onChange={onChange} />;
    case "profile":
      return <ProfileEditor />;
    case "results":
      return <ResultsEditor step={step} onChange={onChange} />;
    default:
      return null;
  }
}

function WelcomeEditor({
  step,
  onChange,
}: {
  step: CreatorWelcomeStep;
  onChange: (step: CreatorFlowStep) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Title
        </label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => onChange({ ...step, title: e.target.value })}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Subtitle
        </label>
        <textarea
          value={step.subtitle}
          onChange={(e) => onChange({ ...step, subtitle: e.target.value })}
          rows={2}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 resize-none"
        />
      </div>
    </div>
  );
}

function QuestionsEditor({
  step,
  onChange,
}: {
  step: CreatorQuestionsStep;
  onChange: (step: CreatorFlowStep) => void;
}) {
  function addCustomQuestion() {
    const id = `q_${Date.now()}`;
    const newQ: CreatorCustomQuestion = {
      id,
      question: "",
      options: [
        { id: `${id}_a`, label: "" },
        { id: `${id}_b`, label: "" },
      ],
    };
    onChange({
      ...step,
      customQuestions: [...step.customQuestions, newQ],
    });
  }

  function updateQuestion(index: number, updated: CreatorCustomQuestion) {
    const newQuestions = [...step.customQuestions];
    newQuestions[index] = updated;
    onChange({ ...step, customQuestions: newQuestions });
  }

  function removeQuestion(index: number) {
    onChange({
      ...step,
      customQuestions: step.customQuestions.filter((_, i) => i !== index),
    });
  }

  function addOption(qIndex: number) {
    const q = step.customQuestions[qIndex];
    const optId = `${q.id}_${String.fromCharCode(97 + q.options.length)}`;
    updateQuestion(qIndex, {
      ...q,
      options: [...q.options, { id: optId, label: "" }],
    });
  }

  function updateOption(qIndex: number, oIndex: number, label: string) {
    const q = step.customQuestions[qIndex];
    const newOptions = [...q.options];
    newOptions[oIndex] = { ...newOptions[oIndex], label };
    updateQuestion(qIndex, { ...q, options: newOptions });
  }

  function removeOption(qIndex: number, oIndex: number) {
    const q = step.customQuestions[qIndex];
    if (q.options.length <= 2) return; // Minimum 2 options
    updateQuestion(qIndex, {
      ...q,
      options: q.options.filter((_, i) => i !== oIndex),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Default questions toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={step.useDefaults}
          onChange={(e) => onChange({ ...step, useDefaults: e.target.checked })}
          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
        />
        <span className="text-sm text-foreground">
          Include default questions (time commitment & intent)
        </span>
      </label>

      {/* Custom questions */}
      {step.customQuestions.map((q, qi) => (
        <div key={q.id} className="rounded-lg border border-border p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={q.question}
                onChange={(e) => updateQuestion(qi, { ...q, question: e.target.value })}
                placeholder="Your question..."
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50"
              />
            </div>
            <button
              onClick={() => removeQuestion(qi)}
              className="rounded p-1.5 text-muted hover:text-rose-500 hover:bg-card-hover transition-colors shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-1.5">
            {q.options.map((opt, oi) => (
              <div key={opt.id} className="flex items-center gap-2">
                <span className="text-xs text-muted w-4 text-center shrink-0">
                  {String.fromCharCode(65 + oi)}
                </span>
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => updateOption(qi, oi, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50"
                />
                {q.options.length > 2 && (
                  <button
                    onClick={() => removeOption(qi, oi)}
                    className="rounded p-1 text-muted hover:text-rose-500 transition-colors shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => addOption(qi)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add option
          </button>
        </div>
      ))}

      <button
        onClick={addCustomQuestion}
        className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-accent/50 hover:text-foreground transition-all"
      >
        <Plus className="h-4 w-4" />
        Add custom question
      </button>
    </div>
  );
}

function ProfileEditor() {
  return (
    <p className="text-sm text-muted-foreground">
      Visitors will be asked for their LinkedIn, social profile, or name.
      We&apos;ll use this to personalize their results.
    </p>
  );
}

function ResultsEditor({
  step,
  onChange,
}: {
  step: CreatorResultsStep;
  onChange: (step: CreatorFlowStep) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2">
        Results Style
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => onChange({ ...step, style: "browse" })}
          className={`flex-1 rounded-lg border px-3 py-3 text-left transition-all ${
            step.style === "browse"
              ? "border-accent bg-accent/5"
              : "border-border bg-card hover:border-accent/30"
          }`}
        >
          <p className="text-sm font-medium text-foreground">Browse</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Browsable list grouped by category with search and filters
          </p>
        </button>
        <button
          onClick={() => onChange({ ...step, style: "ranked" })}
          className={`flex-1 rounded-lg border px-3 py-3 text-left transition-all ${
            step.style === "ranked"
              ? "border-accent bg-accent/5"
              : "border-border bg-card hover:border-accent/30"
          }`}
        >
          <p className="text-sm font-medium text-foreground">Ranked</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Personalized ranked recommendations based on visitor profile
          </p>
        </button>
      </div>
    </div>
  );
}

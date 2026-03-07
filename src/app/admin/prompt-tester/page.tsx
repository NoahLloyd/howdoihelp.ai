"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import {
  DEFAULT_PROMPTS,
  detectTemplateVariables,
  interpolateTemplate,
  type PromptKey,
  type PromptVersion,
} from "@/lib/prompts";
import { AVAILABLE_MODELS } from "@/lib/llm";
import type { Resource } from "@/types";
import {
  fetchPromptVersions,
  savePromptVersion,
  activatePromptVersion,
  deactivatePromptVersion,
  fetchTesterData,
  fetchRecentEventCandidates,
  fetchRecentCommunityCandidates,
  type GuideForTester,
  type CandidateSample,
} from "../actions";

// ─── Types ──────────────────────────────────────────────────

type SearchProvider = "perplexity" | "exa" | "tavily";

interface RunResult {
  text: string;
  parsedJson?: unknown;
  citations?: string[];
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
  model: string;
  prompt: string;
  query: string;
  timestamp: number;
  provider?: string;
}

const TABS: { key: PromptKey; label: string; shortLabel: string }[] = [
  { key: "recommend", label: "Recommend", shortLabel: "REC" },
  { key: "extract", label: "Extract", shortLabel: "EXT" },
  { key: "search", label: "Search", shortLabel: "SRC" },
  { key: "evaluate-event", label: "Eval Event", shortLabel: "EVT" },
  { key: "evaluate-community", label: "Eval Community", shortLabel: "COM" },
];

const DRAFT_KEY = (key: PromptKey) => `prompt-workbench-draft-${key}`;

// ─── Variable Builder Types ─────────────────────────────────

interface ProfileVars {
  fullName: string;
  headline: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  summary: string;
  skills: string;
  experience: string;
  education: string;
  dataSource: string;
  platform: string;
}

interface AnswerVars {
  time: "" | "minutes" | "hours" | "significant";
  intent: "" | "understand" | "connect" | "impact" | "do_part";
  positioned: boolean;
  positionType: string;
}

interface GeoVars {
  country: string;
  countryCode: string;
  city: string;
  region: string;
}

const defaultProfile: ProfileVars = {
  fullName: "",
  headline: "",
  currentTitle: "",
  currentCompany: "",
  location: "",
  summary: "",
  skills: "",
  experience: "",
  education: "",
  dataSource: "bright_data",
  platform: "linkedin",
};

const defaultAnswers: AnswerVars = {
  time: "",
  intent: "",
  positioned: false,
  positionType: "",
};

const defaultGeo: GeoVars = {
  country: "United States",
  countryCode: "US",
  city: "",
  region: "",
};

// ─── Sample Presets ──────────────────────────────────────────

interface SamplePreset {
  label: string;
  profile: ProfileVars;
  answers: AnswerVars;
  geo: GeoVars;
}

const SAMPLE_PRESETS: SamplePreset[] = [
  {
    label: "ML Engineer @ Google",
    profile: {
      fullName: "Sarah Chen",
      headline: "Senior ML Engineer at Google DeepMind | NeurIPS reviewer",
      currentTitle: "Senior ML Engineer",
      currentCompany: "Google DeepMind",
      location: "San Francisco, CA",
      summary: "Building safe and beneficial AI systems. Previously at OpenAI working on RLHF. PhD in Computer Science from Stanford with focus on alignment and interpretability.",
      skills: "Machine Learning, AI Safety, Reinforcement Learning, Python, PyTorch, Transformers, Interpretability",
      experience: "Senior ML Engineer at Google DeepMind (2023-present)\nResearch Engineer at OpenAI (2020-2023)\nML Engineer at Anthropic (2019-2020)",
      education: "PhD Computer Science, Stanford University (2019)\nBS Computer Science, MIT (2015)",
      dataSource: "bright_data",
      platform: "linkedin",
    },
    answers: { time: "hours", intent: "impact", positioned: true, positionType: "ai_tech" },
    geo: { country: "United States", countryCode: "US", city: "San Francisco", region: "California" },
  },
  {
    label: "Policy Researcher",
    profile: {
      fullName: "James Morrison",
      headline: "AI Policy Fellow at Brookings | Georgetown Law",
      currentTitle: "AI Policy Fellow",
      currentCompany: "Brookings Institution",
      location: "Washington, DC",
      summary: "Researching governance frameworks for advanced AI systems. Focus on international AI regulation and safety standards.",
      skills: "AI Policy, Technology Governance, International Relations, Legal Analysis, Research",
      experience: "AI Policy Fellow at Brookings (2024-present)\nLegislative Aide, US Senate Commerce Committee (2022-2024)\nResearch Assistant at Georgetown CSET (2021-2022)",
      education: "JD Georgetown Law (2022)\nBA Political Science, Yale (2019)",
      dataSource: "bright_data",
      platform: "linkedin",
    },
    answers: { time: "significant", intent: "impact", positioned: true, positionType: "policy_gov" },
    geo: { country: "United States", countryCode: "US", city: "Washington", region: "District of Columbia" },
  },
  {
    label: "CS Student (Curious)",
    profile: {
      fullName: "Alex Rivera",
      headline: "CS undergrad @ UC Berkeley | Interested in AI alignment",
      currentTitle: "Student",
      currentCompany: "UC Berkeley",
      location: "Berkeley, CA",
      summary: "Third-year CS student exploring AI safety research. Completed AGISF and looking to get more involved.",
      skills: "Python, Machine Learning, Deep Learning, Mathematics, Research",
      experience: "",
      education: "BS Computer Science, UC Berkeley (expected 2026)",
      dataSource: "scraper",
      platform: "linkedin",
    },
    answers: { time: "hours", intent: "understand", positioned: false, positionType: "" },
    geo: { country: "United States", countryCode: "US", city: "Berkeley", region: "California" },
  },
];

const EXTRACT_SAMPLES = [
  { label: "LinkedIn - AI researcher", url: "https://www.linkedin.com/in/geoffreyhinton/" },
  { label: "GitHub - ML engineer", url: "https://github.com/karpathy" },
];

const SEARCH_SAMPLES = [
  { label: "ML researcher", query: "Sarah Chen AI safety researcher DeepMind" },
  { label: "Policy person", query: "James Morrison AI policy Brookings Institution" },
  { label: "Student", query: "Alex Rivera UC Berkeley AI alignment" },
];

// ─── Auto-populated variable names per tab ───────────────────

const AUTO_VARS: Record<PromptKey, string[]> = {
  recommend: ["profile", "answers", "location", "resources", "guides_section", "guides_instruction"],
  extract: ["raw_text"],
  search: ["query"],
  "evaluate-event": ["scraped_text", "existing_events"],
  "evaluate-community": ["scraped_text", "existing_communities"],
};

// ─── Collapsible Section (stable component, outside render) ──

function Section({
  id,
  title,
  children,
  badge,
  expandedSection,
  setExpandedSection,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  badge?: string;
  expandedSection: string | null;
  setExpandedSection: Dispatch<SetStateAction<string | null>>;
}) {
  const isOpen = expandedSection === id;
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpandedSection(isOpen ? null : id)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className={`transition-transform text-[8px] ${isOpen ? "rotate-90" : ""}`}>&#9654;</span>
          {title}
        </div>
        {badge && (
          <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">{badge}</span>
        )}
      </button>
      {isOpen && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ─── Variable Value Builders ─────────────────────────────────

function buildProfileValue(profile: ProfileVars): string {
  const lines: string[] = [];

  if (profile.dataSource) {
    const confidence = profile.dataSource === "bright_data" || profile.dataSource === "github_api" ? "high" : "medium";
    lines.push(`Data source: ${profile.dataSource} (${confidence} confidence)`);
  }
  if (profile.fullName) lines.push(`Name: ${profile.fullName}`);
  if (profile.headline) lines.push(`Headline: ${profile.headline}`);
  if (profile.currentTitle && profile.currentCompany) {
    lines.push(`Current role: ${profile.currentTitle} at ${profile.currentCompany}`);
  } else if (profile.currentTitle) {
    lines.push(`Current role: ${profile.currentTitle}`);
  }
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.currentCompany && !profile.currentTitle) {
    lines.push(`Company: ${profile.currentCompany}`);
  }
  if (profile.summary) lines.push(`Summary: ${profile.summary}`);
  if (profile.skills.trim()) {
    const skillList = profile.skills.split(",").map((s) => s.trim()).filter(Boolean);
    lines.push(`Background & credentials:\n${skillList.map((s) => `  - ${s}`).join("\n")}`);
  }
  if (profile.experience.trim()) {
    lines.push(`Experience:\n${profile.experience}`);
  }
  if (profile.education.trim()) {
    lines.push(`Education:\n${profile.education}`);
  }
  lines.push(`Profile platform: ${profile.platform}`);

  if (lines.length <= 2) {
    lines.push("No profile data available - personalize based on answers and location only.");
  }

  return lines.join("\n");
}

function buildAnswersValue(answers: AnswerVars): string {
  const lines: string[] = [];
  if (answers.time) lines.push(`Time commitment: ${answers.time}`);
  if (answers.intent) lines.push(`Intent: ${answers.intent}`);
  if (answers.positioned) lines.push(`Self-identified as uniquely positioned`);
  if (answers.positionType) lines.push(`Position type: ${answers.positionType}`);
  return lines.join("\n");
}

function buildLocationValue(geo: GeoVars): string {
  const lines: string[] = [];
  if (geo.city) lines.push(`City: ${geo.city}`);
  if (geo.region) lines.push(`Region: ${geo.region}`);
  lines.push(`Country: ${geo.country} (${geo.countryCode})`);
  return lines.join("\n");
}

function buildResourcesValue(resources: Resource[]): string {
  return resources.map((r) => {
    const tags = [
      r.category,
      r.location,
      `${r.min_minutes}min`,
      `ev=${r.ev_general}`,
      `friction=${r.friction}`,
    ];
    if (r.position_tags?.length) tags.push(`position_tags=[${r.position_tags.join(",")}]`);
    if (r.event_date) tags.push(`date=${r.event_date}`);
    if (r.deadline_date) tags.push(`deadline=${r.deadline_date}`);
    return `[${r.id}] "${r.title}" - ${r.description} (${tags.join(", ")})`;
  }).join("\n\n");
}

function buildGuidesValue(guides: GuideForTester[]): string {
  if (guides.length === 0) return "";
  return `\n<available_guides>\n${guides.map((g) => {
    const parts = [`[${g.id}] "${g.display_name || "Guide"}"${g.headline ? ` - ${g.headline}` : ""}`];
    if (g.topics.length > 0) parts.push(`  Topics: ${g.topics.join(", ")}`);
    if (g.best_for) parts.push(`  Best for: ${g.best_for}`);
    if (g.not_a_good_fit) parts.push(`  NOT a good fit for: ${g.not_a_good_fit}`);
    if (g.preferred_career_stages.length > 0) parts.push(`  Preferred career stages: ${g.preferred_career_stages.join(", ")}`);
    if (g.preferred_backgrounds.length > 0) parts.push(`  Preferred backgrounds: ${g.preferred_backgrounds.join(", ")}`);
    if (g.location) parts.push(`  Location: ${g.location}`);
    if (g.languages.length > 1) parts.push(`  Languages: ${g.languages.join(", ")}`);
    return parts.join("\n");
  }).join("\n\n")}\n</available_guides>`;
}

// ─── Component ──────────────────────────────────────────────

export default function PromptTesterPage() {
  // Active tab
  const [activeTab, setActiveTab] = useState<PromptKey>("recommend");

  // Template (single prompt with {{variables}})
  const [template, setTemplate] = useState(DEFAULT_PROMPTS.recommend);

  // Manual variable overrides (for non-auto variables or manual edits)
  const [manualVars, setManualVars] = useState<Record<string, string>>({});

  // Show interpolated preview vs template source
  const [showPreview, setShowPreview] = useState(false);

  // Variable builder state (recommend tab)
  const [profileVars, setProfileVars] = useState<ProfileVars>(defaultProfile);
  const [answerVars, setAnswerVars] = useState<AnswerVars>(defaultAnswers);
  const [geoVars, setGeoVars] = useState<GeoVars>(defaultGeo);
  const [resources, setResources] = useState<Resource[]>([]);
  const [guides, setGuides] = useState<GuideForTester[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("profile");

  // Candidate samples for eval tabs
  const [candidates, setCandidates] = useState<CandidateSample[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Scrape URL for extract/eval tabs
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [loadingScrape, setLoadingScrape] = useState(false);

  // Model / provider
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState<SearchProvider>("perplexity");
  const [maxTokens, setMaxTokens] = useState(8192);

  // Results
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [modelB, setModelB] = useState("");
  const [providerB, setProviderB] = useState<SearchProvider>("exa");
  const [resultB, setResultB] = useState<RunResult | null>(null);
  const [loadingB, setLoadingB] = useState(false);

  // Versioning
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");

  // History
  const [history, setHistory] = useState<RunResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const templateRef = useRef<HTMLTextAreaElement>(null);

  // ─── Detect variables from template ─────────────────────────

  const detectedVars = useMemo(() => detectTemplateVariables(template), [template]);
  const autoVarsForTab = AUTO_VARS[activeTab];
  const customVars = detectedVars.filter((v) => !autoVarsForTab.includes(v));

  // ─── Build complete variable map ────────────────────────────

  const variableValues = useMemo((): Record<string, string> => {
    const vars: Record<string, string> = { ...manualVars };

    if (activeTab === "recommend") {
      vars.profile = vars.profile ?? buildProfileValue(profileVars);
      vars.answers = vars.answers ?? buildAnswersValue(answerVars);
      vars.location = vars.location ?? buildLocationValue(geoVars);
      vars.resources = vars.resources ?? buildResourcesValue(resources);
      vars.guides_section = vars.guides_section ?? buildGuidesValue(guides);
      vars.guides_instruction = vars.guides_instruction ?? (guides.length > 0 ? " You may also include 1 guide if there's a strong match." : "");
    }

    return vars;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, profileVars, answerVars, geoVars, resources, guides, manualVars]);

  const interpolatedPrompt = useMemo(
    () => interpolateTemplate(template, variableValues),
    [template, variableValues],
  );

  // ─── Tab switch: load draft + defaults ─────────────────────

  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY(activeTab));
    setTemplate(draft || DEFAULT_PROMPTS[activeTab]);
    setResult(null);
    setResultB(null);
    setError(null);
    setManualVars({});
    setCandidates([]);

    if (activeTab === "extract") setMaxTokens(1500);
    else if (activeTab === "evaluate-event" || activeTab === "evaluate-community") setMaxTokens(2000);
    else setMaxTokens(8192);

    setModel("");
    setModelB("");
  }, [activeTab]);

  // Auto-save draft
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY(activeTab), template);
  }, [template, activeTab]);

  // ─── Load versions ────────────────────────────────────────

  const loadVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const v = await fetchPromptVersions(activeTab);
      setVersions(v);
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  // ─── Run prompt ───────────────────────────────────────────

  async function runPrompt(
    selectedModel: string,
    selectedProvider: SearchProvider,
    setter: (r: RunResult) => void,
    setLoadingFn: (b: boolean) => void,
  ) {
    const finalPrompt = interpolatedPrompt.trim();

    if (!finalPrompt) {
      setError("Template is empty");
      return;
    }

    // Check for unfilled variables
    const unfilled = detectedVars.filter((v) => !variableValues[v]?.trim());
    if (unfilled.length > 0) {
      setError(`Missing variable values: ${unfilled.join(", ")}`);
      return;
    }

    setError(null);
    setLoadingFn(true);

    try {
      // For search with exa/tavily, the query goes directly (no system prompt)
      const isNonPerplexitySearch = activeTab === "search" && selectedProvider !== "perplexity";

      const res = await fetch("/api/admin/run-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptKey: activeTab,
          systemPrompt: isNonPerplexitySearch ? "" : "",
          userContent: finalPrompt,
          model: selectedModel || undefined,
          maxTokens,
          searchProvider: activeTab === "search" ? selectedProvider : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const r: RunResult = {
        ...data,
        prompt: finalPrompt,
        provider: activeTab === "search" ? selectedProvider : (selectedModel || "default"),
        query: finalPrompt.slice(0, 100),
        timestamp: Date.now(),
      };
      setter(r);
      setHistory((prev) => [r, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoadingFn(false);
    }
  }

  // ─── Keyboard shortcut ────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runPrompt(model, provider, setResult, setLoading);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, provider, activeTab, maxTokens, interpolatedPrompt]);

  // ─── Load data ─────────────────────────────────────────────

  async function handleLoadData() {
    setLoadingData(true);
    try {
      const data = await fetchTesterData();
      setResources(data.resources);
      setGuides(data.guides);
      setDataLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoadingData(false);
    }
  }

  async function handleLoadCandidates() {
    setLoadingCandidates(true);
    try {
      const data = activeTab === "evaluate-event"
        ? await fetchRecentEventCandidates()
        : await fetchRecentCommunityCandidates();
      setCandidates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function handleScrapeUrl() {
    const url = scrapeUrl.trim();
    if (!url) { setError("Enter a URL to scrape"); return; }
    setLoadingScrape(true);
    setError(null);
    try {
      const res = await fetch("/api/scrape-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(`Scrape failed: HTTP ${res.status}`);
      const data = await res.json();
      const text = JSON.stringify(data.profile, null, 2);
      // Set the appropriate variable
      if (activeTab === "extract") {
        setManualVars((prev) => ({ ...prev, raw_text: text }));
      } else {
        setManualVars((prev) => ({ ...prev, scraped_text: text }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      setLoadingScrape(false);
    }
  }

  // ─── Version actions ──────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      await savePromptVersion(activeTab, template, model || null, saveNote || null);
      setSaveNote("");
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: number) {
    try {
      await activatePromptVersion(id);
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    }
  }

  async function handleDeactivate(id: number) {
    try {
      await deactivatePromptVersion(id);
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivation failed");
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  const activeVersion = versions.find((v) => v.is_active);
  const isSearchTab = activeTab === "search";
  const isEvalTab = activeTab === "evaluate-event" || activeTab === "evaluate-community";
  const isRecommendTab = activeTab === "recommend";

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-muted hover:text-foreground text-xs">
            Dashboard
          </Link>
          <span className="text-border">/</span>
          <h1 className="text-sm font-semibold text-foreground">Prompt Playground</h1>
        </div>
        <div className="flex items-center gap-2">
          {activeVersion && (
            <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-1 rounded">
              v{activeVersion.version} active
            </span>
          )}
          <button
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) setShowVersions(false); }}
            className={`px-2.5 py-1 text-[11px] font-medium border rounded-md transition-colors cursor-pointer ${
              showHistory ? "bg-foreground/10 border-foreground/20 text-foreground" : "border-border text-muted hover:text-foreground"
            }`}
          >
            History ({history.length})
          </button>
          <button
            onClick={() => { setShowVersions(!showVersions); if (!showVersions) setShowHistory(false); }}
            className={`px-2.5 py-1 text-[11px] font-medium border rounded-md transition-colors cursor-pointer ${
              showVersions ? "bg-foreground/10 border-foreground/20 text-foreground" : "border-border text-muted hover:text-foreground"
            }`}
          >
            Versions
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-500 flex items-center justify-between shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline cursor-pointer ml-3">dismiss</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ─── Left Sidebar ──────────────────────────────────── */}
        <aside className="w-[280px] border-r border-border bg-card flex flex-col shrink-0 overflow-y-auto">
          {/* Prompt tabs */}
          <div className="p-3 border-b border-border">
            <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 block">Prompt</label>
            <div className="flex flex-col gap-0.5">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors cursor-pointer ${
                    activeTab === tab.key
                      ? "bg-foreground text-background font-medium"
                      : "text-muted hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <span className="font-mono text-[10px] mr-2 opacity-50">{tab.shortLabel}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model / Provider */}
          <div className="p-3 border-b border-border">
            <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 block">Config</label>
            {isSearchTab && (
              <div className="mb-2">
                <label className="text-[11px] text-muted mb-1 block">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as SearchProvider)}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground outline-none focus:border-accent cursor-pointer"
                >
                  <option value="perplexity">Perplexity</option>
                  <option value="exa">Exa</option>
                  <option value="tavily">Tavily</option>
                </select>
              </div>
            )}
            {!isSearchTab && (
              <div className="mb-2">
                <label className="text-[11px] text-muted mb-1 block">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground outline-none focus:border-accent cursor-pointer"
                >
                  <option value="">Default</option>
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="mb-2">
              <label className="text-[11px] text-muted mb-1 block">Max Tokens: {maxTokens}</label>
              <input
                type="range"
                min={256}
                max={16384}
                step={256}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                className="accent-accent"
              />
              Compare mode (A/B)
            </label>
          </div>

          {/* Compare B config */}
          {compareMode && (
            <div className="p-3 border-b border-border bg-foreground/[0.02]">
              <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 block">Compare B</label>
              {isSearchTab ? (
                <div className="mb-2">
                  <label className="text-[11px] text-muted mb-1 block">Provider B</label>
                  <select
                    value={providerB}
                    onChange={(e) => setProviderB(e.target.value as SearchProvider)}
                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="perplexity">Perplexity</option>
                    <option value="exa">Exa</option>
                    <option value="tavily">Tavily</option>
                  </select>
                </div>
              ) : (
                <div className="mb-2">
                  <label className="text-[11px] text-muted mb-1 block">Model B</label>
                  <select
                    value={modelB}
                    onChange={(e) => setModelB(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="">Default</option>
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ─── Variables Section ─────────────────────────────── */}
          <div className="border-b border-border">
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                Variables ({detectedVars.length})
              </label>
            </div>

            <div className="text-xs">
              {/* Recommend tab: structured builders */}
              {isRecommendTab && (
                <>
                  {/* Sample presets */}
                  <div className="px-4 py-2 border-b border-border/50">
                    <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1.5 block">Quick Load</label>
                    <div className="flex flex-wrap gap-1">
                      {SAMPLE_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => {
                            setProfileVars(preset.profile);
                            setAnswerVars(preset.answers);
                            setGeoVars(preset.geo);
                            // Clear any manual overrides for auto vars
                            setManualVars((prev) => {
                              const next = { ...prev };
                              delete next.profile;
                              delete next.answers;
                              delete next.location;
                              return next;
                            });
                          }}
                          className="px-2 py-1 text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 transition-colors cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Section id="profile" title="Profile" badge={profileVars.fullName || undefined} expandedSection={expandedSection} setExpandedSection={setExpandedSection}>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Full Name" value={profileVars.fullName} onChange={(e) => setProfileVars({ ...profileVars, fullName: e.target.value })}
                        className="col-span-2 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <input placeholder="Title" value={profileVars.currentTitle} onChange={(e) => setProfileVars({ ...profileVars, currentTitle: e.target.value })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <input placeholder="Company" value={profileVars.currentCompany} onChange={(e) => setProfileVars({ ...profileVars, currentCompany: e.target.value })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <input placeholder="Location" value={profileVars.location} onChange={(e) => setProfileVars({ ...profileVars, location: e.target.value })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <select value={profileVars.platform} onChange={(e) => setProfileVars({ ...profileVars, platform: e.target.value })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground outline-none focus:border-accent cursor-pointer">
                        <option value="linkedin">LinkedIn</option>
                        <option value="github">GitHub</option>
                        <option value="x">X</option>
                        <option value="other">Other</option>
                      </select>
                      <input placeholder="Headline" value={profileVars.headline} onChange={(e) => setProfileVars({ ...profileVars, headline: e.target.value })}
                        className="col-span-2 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <textarea placeholder="Summary" value={profileVars.summary} onChange={(e) => setProfileVars({ ...profileVars, summary: e.target.value })} rows={2}
                        className="col-span-2 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent resize-y" />
                      <input placeholder="Skills (comma-separated)" value={profileVars.skills} onChange={(e) => setProfileVars({ ...profileVars, skills: e.target.value })}
                        className="col-span-2 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <select value={profileVars.dataSource} onChange={(e) => setProfileVars({ ...profileVars, dataSource: e.target.value })}
                        className="col-span-2 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground outline-none focus:border-accent cursor-pointer">
                        <option value="bright_data">Bright Data (high confidence)</option>
                        <option value="github_api">GitHub API (high confidence)</option>
                        <option value="scraper">Scraper (medium confidence)</option>
                        <option value="llm_extracted">LLM Extracted (medium confidence)</option>
                      </select>
                    </div>
                  </Section>
                  <Section id="answers" title="Answers" expandedSection={expandedSection} setExpandedSection={setExpandedSection}>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={answerVars.time} onChange={(e) => setAnswerVars({ ...answerVars, time: e.target.value as AnswerVars["time"] })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground outline-none focus:border-accent cursor-pointer">
                        <option value="">No answer</option>
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="significant">Significant</option>
                      </select>
                      <select value={answerVars.intent} onChange={(e) => setAnswerVars({ ...answerVars, intent: e.target.value as AnswerVars["intent"] })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground outline-none focus:border-accent cursor-pointer">
                        <option value="">No intent</option>
                        <option value="understand">Understand</option>
                        <option value="connect">Connect</option>
                        <option value="impact">Impact</option>
                        <option value="do_part">Do my part</option>
                      </select>
                      <label className="col-span-2 flex items-center gap-2 text-[11px] text-muted cursor-pointer">
                        <input type="checkbox" checked={answerVars.positioned} onChange={(e) => setAnswerVars({ ...answerVars, positioned: e.target.checked })} className="accent-accent" />
                        Uniquely positioned
                      </label>
                      {answerVars.positioned && (
                        <select value={answerVars.positionType} onChange={(e) => setAnswerVars({ ...answerVars, positionType: e.target.value })}
                          className="col-span-2 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground outline-none focus:border-accent cursor-pointer">
                          <option value="">Select position type</option>
                          <option value="ai_tech">AI/Tech</option>
                          <option value="policy_gov">Policy/Government</option>
                          <option value="audience_platform">Audience/Platform</option>
                          <option value="donor">Donor</option>
                          <option value="student">Student</option>
                          <option value="other">Other</option>
                        </select>
                      )}
                    </div>
                  </Section>
                  <Section id="geo" title="Location" expandedSection={expandedSection} setExpandedSection={setExpandedSection}>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="City" value={geoVars.city} onChange={(e) => setGeoVars({ ...geoVars, city: e.target.value })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <input placeholder="Region" value={geoVars.region} onChange={(e) => setGeoVars({ ...geoVars, region: e.target.value })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <input placeholder="Country" value={geoVars.country} onChange={(e) => setGeoVars({ ...geoVars, country: e.target.value })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                      <input placeholder="Code" value={geoVars.countryCode} onChange={(e) => setGeoVars({ ...geoVars, countryCode: e.target.value })}
                        className="px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent" />
                    </div>
                  </Section>
                  <Section id="data" title="Resources & Guides" badge={dataLoaded ? `${resources.length}r / ${guides.length}g` : undefined} expandedSection={expandedSection} setExpandedSection={setExpandedSection}>
                    <button
                      onClick={handleLoadData}
                      disabled={loadingData}
                      className="w-full px-3 py-2 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-md hover:bg-accent/20 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {loadingData ? "Loading..." : dataLoaded ? `Reload (${resources.length} resources, ${guides.length} guides)` : "Load from DB"}
                    </button>
                    {dataLoaded && (
                      <p className="text-[10px] text-muted mt-1.5">Loaded {resources.length} resources and {guides.length} guides</p>
                    )}
                  </Section>
                </>
              )}

              {/* Extract tab: scrape helper */}
              {activeTab === "extract" && (
                <div className="px-4 py-3">
                  <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 block">Load Profile</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {EXTRACT_SAMPLES.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => { setScrapeUrl(s.url); }}
                        className="px-2 py-1 text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 transition-colors cursor-pointer"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    <input
                      type="text"
                      value={scrapeUrl}
                      onChange={(e) => setScrapeUrl(e.target.value)}
                      placeholder="LinkedIn / GitHub URL..."
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted outline-none focus:border-accent"
                      onKeyDown={(e) => { if (e.key === "Enter") handleScrapeUrl(); }}
                    />
                    <button
                      onClick={handleScrapeUrl}
                      disabled={loadingScrape}
                      className="px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-md hover:bg-accent/20 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      {loadingScrape ? "..." : "Scrape"}
                    </button>
                  </div>
                  {/* raw_text variable */}
                  <label className="text-[10px] font-medium text-muted mb-1 block">{"{{raw_text}}"}</label>
                  <textarea
                    value={manualVars.raw_text || ""}
                    onChange={(e) => setManualVars((prev) => ({ ...prev, raw_text: e.target.value }))}
                    placeholder="Paste raw LinkedIn/profile text..."
                    rows={4}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent resize-y font-mono"
                  />
                </div>
              )}

              {/* Search tab: sample queries */}
              {isSearchTab && (
                <div className="px-4 py-3">
                  <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 block">Sample Queries</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {SEARCH_SAMPLES.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => setManualVars((prev) => ({ ...prev, query: s.query }))}
                        className="px-2 py-1 text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 transition-colors cursor-pointer"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <label className="text-[10px] font-medium text-muted mb-1 block">{"{{query}}"}</label>
                  <input
                    type="text"
                    value={manualVars.query || ""}
                    onChange={(e) => setManualVars((prev) => ({ ...prev, query: e.target.value }))}
                    placeholder="e.g. Noah Lloyd AI safety Nashville"
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent"
                  />
                </div>
              )}

              {/* Eval tabs: load candidate samples */}
              {isEvalTab && (
                <div className="px-4 py-3">
                  <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 block">Test Data</label>
                  <div className="flex gap-1.5 mb-2">
                    <input
                      type="text"
                      value={scrapeUrl}
                      onChange={(e) => setScrapeUrl(e.target.value)}
                      placeholder="Event / community URL..."
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted outline-none focus:border-accent"
                      onKeyDown={(e) => { if (e.key === "Enter") handleScrapeUrl(); }}
                    />
                    <button
                      onClick={handleScrapeUrl}
                      disabled={loadingScrape}
                      className="px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-md hover:bg-accent/20 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      {loadingScrape ? "..." : "Scrape"}
                    </button>
                  </div>
                  <button
                    onClick={handleLoadCandidates}
                    disabled={loadingCandidates}
                    className="w-full px-3 py-1.5 text-xs font-medium bg-foreground/10 text-foreground border border-border rounded-md hover:bg-foreground/20 transition-colors disabled:opacity-40 cursor-pointer mb-2"
                  >
                    {loadingCandidates ? "Loading..." : candidates.length > 0 ? `Reload candidates (${candidates.length})` : "Load recent candidates"}
                  </button>
                  {candidates.length > 0 && (
                    <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto mb-3">
                      {candidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setManualVars((prev) => ({ ...prev, scraped_text: c.scraped_text || `[No scraped text for: ${c.title}]` }))}
                          className="w-full text-left px-2 py-1.5 text-[11px] rounded hover:bg-foreground/5 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-foreground truncate flex-1">{c.title}</span>
                            <span className={`text-[9px] shrink-0 ml-1 px-1 py-0.5 rounded ${
                              c.status === "promoted" ? "text-emerald-500 bg-emerald-500/10"
                              : c.status === "rejected" ? "text-rose-400 bg-rose-500/10"
                              : "text-muted bg-foreground/5"
                            }`}>{c.status}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="text-[10px] font-medium text-muted mb-1 block">{"{{scraped_text}}"}</label>
                  <textarea
                    value={manualVars.scraped_text || ""}
                    onChange={(e) => setManualVars((prev) => ({ ...prev, scraped_text: e.target.value }))}
                    placeholder="Paste scraped event/community page text..."
                    rows={4}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent resize-y font-mono"
                  />
                </div>
              )}

              {/* Custom variables (any {{var}} not in AUTO_VARS) */}
              {customVars.length > 0 && (
                <div className="px-4 py-3 border-t border-border/50">
                  <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 block">Custom Variables</label>
                  {customVars.map((varName) => (
                    <div key={varName} className="mb-2">
                      <label className="text-[10px] font-mono text-accent mb-1 block">{`{{${varName}}}`}</label>
                      <textarea
                        value={manualVars[varName] || ""}
                        onChange={(e) => setManualVars((prev) => ({ ...prev, [varName]: e.target.value }))}
                        placeholder={`Value for ${varName}...`}
                        rows={2}
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted/50 outline-none focus:border-accent resize-y font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Version management */}
          <div className="p-3 border-b border-border">
            <label className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 block">Save Version</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={saveNote}
                onChange={(e) => setSaveNote(e.target.value)}
                placeholder="Note..."
                className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted outline-none focus:border-accent"
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium bg-foreground/10 text-foreground border border-border rounded-md hover:bg-foreground/20 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                {saving ? "..." : "Save"}
              </button>
            </div>
            <p className="text-[10px] text-muted mt-1.5">
              Save the template (with {"{{variables}}"}) as a new version. Activate it from the Versions panel to make it the production prompt.
            </p>
          </div>

          {/* Run buttons */}
          <div className="p-3 mt-auto border-t border-border">
            <button
              onClick={() => {
                runPrompt(model, provider, setResult, setLoading);
                if (compareMode) {
                  runPrompt(modelB, providerB, setResultB, setLoadingB);
                }
              }}
              disabled={loading || loadingB}
              className="w-full py-2.5 text-xs font-medium bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
            >
              {loading || loadingB ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  Running...
                </span>
              ) : (
                <>{compareMode ? "Run Both" : "Run"} <span className="opacity-40 ml-1">Cmd+Enter</span></>
              )}
            </button>
          </div>
        </aside>

        {/* ─── Main Content ──────────────────────────────────── */}
        <main className="flex-1 flex min-w-0 overflow-hidden">
          {/* Template Editor + Output side by side */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Template Editor */}
            <div className="flex-1 flex flex-col min-h-0 border-b border-border">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-medium text-muted uppercase tracking-wider">Template</span>
                  {detectedVars.length > 0 && (
                    <span className="text-[10px] font-mono text-accent">
                      {detectedVars.length} variable{detectedVars.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer transition-colors ${
                      showPreview ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {showPreview ? "Preview" : "Source"}
                  </button>
                  <button
                    onClick={() => setTemplate(DEFAULT_PROMPTS[activeTab])}
                    className="text-[10px] text-muted hover:text-foreground cursor-pointer"
                  >
                    reset
                  </button>
                </div>
              </div>
              {showPreview ? (
                <div className="flex-1 overflow-auto">
                  <pre className="px-4 py-3 text-[11px] text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-words">
                    {interpolatedPrompt || "(Fill in variables to see preview)"}
                  </pre>
                </div>
              ) : (
                <textarea
                  ref={templateRef}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="flex-1 px-4 py-3 bg-background text-xs text-foreground font-mono leading-relaxed resize-none outline-none"
                  spellCheck={false}
                  placeholder="Enter prompt template with {{variables}}..."
                />
              )}
            </div>

            {/* Output */}
            <div className="flex-1 flex flex-col min-h-0">
              {compareMode ? (
                <div className="flex flex-1 min-h-0">
                  {/* Result A */}
                  <div className="flex-1 flex flex-col border-r border-border/50">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 shrink-0">
                      <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                        Output A
                        {result?.provider && <span className="ml-1 font-normal">({result.provider})</span>}
                      </span>
                      {result && (
                        <div className="flex items-center gap-2 text-[10px] font-mono text-muted">
                          <span>{result.latencyMs}ms</span>
                          {result.inputTokens > 0 && <span>{result.inputTokens}in/{result.outputTokens}out</span>}
                          <span>${result.estimatedCost.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-auto">
                      {result ? (
                        <pre className="px-4 py-3 text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-words">
                          {result.parsedJson ? JSON.stringify(result.parsedJson, null, 2) : result.text}
                        </pre>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted text-xs italic">
                          {loading ? (
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                              Running...
                            </span>
                          ) : "No result yet"}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Result B */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 shrink-0">
                      <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                        Output B
                        {resultB?.provider && <span className="ml-1 font-normal">({resultB.provider})</span>}
                      </span>
                      {resultB && (
                        <div className="flex items-center gap-2 text-[10px] font-mono text-muted">
                          <span>{resultB.latencyMs}ms</span>
                          {resultB.inputTokens > 0 && <span>{resultB.inputTokens}in/{resultB.outputTokens}out</span>}
                          <span>${resultB.estimatedCost.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-auto">
                      {resultB ? (
                        <pre className="px-4 py-3 text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-words">
                          {resultB.parsedJson ? JSON.stringify(resultB.parsedJson, null, 2) : resultB.text}
                        </pre>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted text-xs italic">
                          {loadingB ? (
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                              Running...
                            </span>
                          ) : "No result yet"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 shrink-0">
                    <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                      Output
                      {result?.model && result.model !== "default" && (
                        <span className="ml-1.5 font-mono font-normal">{result.model}</span>
                      )}
                    </span>
                    {result && (
                      <div className="flex items-center gap-3 text-[10px] font-mono text-muted">
                        <span>{result.latencyMs}ms</span>
                        {result.inputTokens > 0 && <span>{result.inputTokens} in / {result.outputTokens} out</span>}
                        <span>${result.estimatedCost.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {result ? (
                      <div>
                        <pre className="px-4 py-3 text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-words">
                          {result.parsedJson ? JSON.stringify(result.parsedJson, null, 2) : result.text}
                        </pre>
                        {result.citations && result.citations.length > 0 && (
                          <div className="px-4 pb-3 border-t border-border/30 pt-2">
                            <h3 className="text-[10px] font-medium text-muted mb-1.5 uppercase tracking-wider">Citations ({result.citations.length})</h3>
                            <div className="flex flex-col gap-0.5">
                              {result.citations.map((c, i) => (
                                <a key={i} href={c} target="_blank" rel="noopener noreferrer"
                                  className="text-[11px] text-accent hover:underline truncate block">{c}</a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted text-xs italic">
                        {loading ? (
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                            Running...
                          </span>
                        ) : "Run a prompt to see output"}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </main>

        {/* ─── Versions Panel (right sidebar) ────────────────── */}
        {showVersions && (
          <aside className="w-[320px] border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-medium text-foreground">Versions</h2>
                <span className="text-[10px] text-muted font-mono">{activeTab}</span>
                {loadingVersions && (
                  <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                )}
              </div>
              <button onClick={() => setShowVersions(false)} className="text-muted hover:text-foreground text-xs cursor-pointer">
                Close
              </button>
            </div>

            {versions.length === 0 && !loadingVersions && (
              <p className="px-4 py-6 text-xs text-muted italic text-center">No saved versions yet</p>
            )}

            <div className="flex flex-col">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className={`px-4 py-3 border-b border-border/50 transition-colors ${
                    v.is_active ? "bg-accent/5" : "hover:bg-foreground/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">v{v.version}</span>
                      {v.is_active && (
                        <span className="text-[9px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">active</span>
                      )}
                      {v.model && <span className="text-[10px] font-mono text-muted">{v.model}</span>}
                    </div>
                    <span className="text-[10px] text-muted">{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                  {v.note && <p className="text-[11px] text-muted mb-2 truncate">{v.note}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setTemplate(v.content); if (v.model) setModel(v.model); }}
                      className="text-[10px] text-accent hover:underline cursor-pointer"
                    >
                      Load
                    </button>
                    <span className="text-muted text-[10px]">|</span>
                    {v.is_active ? (
                      <button onClick={() => handleDeactivate(v.id)}
                        className="text-[10px] text-rose-400 hover:underline cursor-pointer">Deactivate</button>
                    ) : (
                      <button onClick={() => handleActivate(v.id)}
                        className="text-[10px] text-emerald-400 hover:underline cursor-pointer">Activate</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* ─── History Panel (right sidebar) ─────────────────── */}
        {showHistory && !showVersions && (
          <aside className="w-[320px] border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-xs font-medium text-foreground">History ({history.length})</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setHistory([])} className="text-[10px] text-muted hover:text-foreground cursor-pointer">clear</button>
                <button onClick={() => setShowHistory(false)} className="text-muted hover:text-foreground text-xs cursor-pointer">Close</button>
              </div>
            </div>

            {history.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted italic text-center">No runs yet</p>
            ) : (
              <div className="flex flex-col">
                {history.map((h, i) => (
                  <details key={i} className="group border-b border-border/50">
                    <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-foreground/[0.02] text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-foreground font-medium truncate">{h.query.slice(0, 40)}{h.query.length > 40 ? "..." : ""}</span>
                        {h.provider && (
                          <span className="text-[9px] font-mono text-accent/70 bg-accent/10 px-1 py-0.5 rounded shrink-0">{h.provider}</span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted shrink-0 ml-2">{h.latencyMs}ms</span>
                    </summary>
                    <div className="px-4 pb-3">
                      <pre className="text-[11px] text-muted-foreground font-mono bg-background p-3 rounded-lg overflow-auto max-h-[200px] whitespace-pre-wrap break-words border border-border/50">
                        {h.parsedJson ? JSON.stringify(h.parsedJson, null, 2) : h.text}
                      </pre>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

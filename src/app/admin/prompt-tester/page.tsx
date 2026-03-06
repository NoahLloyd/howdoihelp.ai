"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { DEFAULT_PROMPTS, type PromptKey, type PromptVersion } from "@/lib/prompts";
import { AVAILABLE_MODELS } from "@/lib/llm";
import {
  fetchPromptVersions,
  savePromptVersion,
  activatePromptVersion,
  deactivatePromptVersion,
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

interface ScrapeResult {
  profile: Record<string, unknown> | null;
  platform: string;
}

const TABS: { key: PromptKey; label: string }[] = [
  { key: "recommend", label: "Recommend" },
  { key: "extract", label: "Extract" },
  { key: "search", label: "Search" },
];

const DRAFT_KEY = (key: PromptKey) => `prompt-workbench-draft-${key}`;

// ─── Component ──────────────────────────────────────────────

export default function PromptTesterPage() {
  // Prompt type tab
  const [activeTab, setActiveTab] = useState<PromptKey>("search");

  // Input state
  const [query, setQuery] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // Prompt state (A/B)
  const [promptA, setPromptA] = useState(DEFAULT_PROMPTS.search);
  const [promptB, setPromptB] = useState("");

  // Provider state (search tab)
  const [providerA, setProviderA] = useState<SearchProvider>("perplexity");
  const [providerB, setProviderB] = useState<SearchProvider>("exa");

  // Model state (recommend/extract tabs)
  const [modelA, setModelA] = useState("");
  const [modelB, setModelB] = useState("");
  const [maxTokens, setMaxTokensState] = useState(8192);

  // Results
  const [resultA, setResultA] = useState<RunResult | null>(null);
  const [resultB, setResultB] = useState<RunResult | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [history, setHistory] = useState<RunResult[]>([]);

  // Loading
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [loadingScrape, setLoadingScrape] = useState(false);

  // Error
  const [error, setError] = useState<string | null>(null);

  // Versioning
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [diffVersions, setDiffVersions] = useState<[number | null, number | null]>([null, null]);

  const resultARef = useRef<HTMLDivElement>(null);
  const resultBRef = useRef<HTMLDivElement>(null);

  // ─── Sync prompt A with active tab ─────────────────────────

  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY(activeTab));
    setPromptA(draft || DEFAULT_PROMPTS[activeTab]);
    setPromptB("");
    setResultA(null);
    setResultB(null);
    setMaxTokensState(activeTab === "extract" ? 1500 : 8192);
    setModelA("");
    setModelB("");
  }, [activeTab]);

  // Auto-save draft
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY(activeTab), promptA);
  }, [promptA, activeTab]);

  // ─── Load versions ───────────────────────────────────────

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

  // ─── Run prompt ──────────────────────────────────────────

  async function runPrompt(
    prompt: string,
    provider: SearchProvider,
    model: string,
    setter: (r: RunResult) => void,
    setLoading: (b: boolean) => void,
  ) {
    const input = query.trim();
    if (!input) {
      setError("Enter a query or person's name");
      return;
    }

    // For search with exa/tavily, prompt is optional
    if (activeTab !== "search" || provider === "perplexity") {
      if (!prompt.trim()) {
        setError("Prompt is empty");
        return;
      }
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/run-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptKey: activeTab,
          systemPrompt: prompt,
          userContent: input,
          model: model || undefined,
          maxTokens,
          searchProvider: activeTab === "search" ? provider : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const result: RunResult = {
        ...data,
        prompt,
        provider: activeTab === "search" ? provider : (model || "default"),
        query: input,
        timestamp: Date.now(),
      };
      setter(result);
      setHistory((prev) => [result, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // ─── Cmd+Enter ────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runPrompt(promptA, providerA, modelA, setResultA, setLoadingA);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptA, providerA, modelA, query, activeTab, maxTokens]);

  // ─── Scrape / Enrich ─────────────────────────────────────

  async function runScrape() {
    const url = linkedinUrl.trim() || undefined;
    const q = query.trim() || undefined;
    if (!url && !q) {
      setError("Enter a LinkedIn URL or a person's name");
      return;
    }
    setError(null);
    setLoadingScrape(true);
    try {
      if (url) {
        const res = await fetch("/api/scrape-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) throw new Error(`Scrape failed: HTTP ${res.status}`);
        setScrapeResult(await res.json());
      } else if (q) {
        const res = await fetch("/api/search-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
        const data = await res.json();
        setScrapeResult({ profile: data, platform: "perplexity-search" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      setLoadingScrape(false);
    }
  }

  async function runEnrich() {
    const url = linkedinUrl.trim();
    if (!url) {
      setError("Enter a LinkedIn URL to run full enrichment");
      return;
    }
    setError(null);
    setLoadingScrape(true);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(`Enrich failed: HTTP ${res.status}`);
      const data = await res.json();
      setScrapeResult({ profile: data.profile, platform: "enriched" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrich failed");
    } finally {
      setLoadingScrape(false);
    }
  }

  // ─── Version actions ─────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      await savePromptVersion(activeTab, promptA, modelA || null, saveNote || null);
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

  // ─── Diff ────────────────────────────────────────────────

  const diffA = diffVersions[0] != null ? versions.find((v) => v.id === diffVersions[0]) : null;
  const diffB = diffVersions[1] != null ? versions.find((v) => v.id === diffVersions[1]) : null;

  function renderDiff(a: string, b: string) {
    const aLines = a.split("\n");
    const bLines = b.split("\n");
    const maxLen = Math.max(aLines.length, bLines.length);
    const lines: { type: "same" | "removed" | "added" | "changed"; a?: string; b?: string }[] = [];
    for (let i = 0; i < maxLen; i++) {
      const la = aLines[i];
      const lb = bLines[i];
      if (la === lb) lines.push({ type: "same", a: la });
      else if (la != null && lb != null) lines.push({ type: "changed", a: la, b: lb });
      else if (la != null) lines.push({ type: "removed", a: la });
      else lines.push({ type: "added", b: lb });
    }
    return (
      <div className="text-[11px] font-mono leading-relaxed max-h-[400px] overflow-auto">
        {lines.map((l, i) => (
          <div key={i}>
            {l.type === "same" && <div className="text-muted px-2 py-0.5">{l.a}</div>}
            {l.type === "removed" && <div className="text-rose-400 bg-rose-500/10 px-2 py-0.5">- {l.a}</div>}
            {l.type === "added" && <div className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5">+ {l.b}</div>}
            {l.type === "changed" && (
              <>
                <div className="text-rose-400 bg-rose-500/10 px-2 py-0.5">- {l.a}</div>
                <div className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5">+ {l.b}</div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ─── Helpers ─────────────────────────────────────────────

  const activeVersion = versions.find((v) => v.is_active);
  const isSearchTab = activeTab === "search";

  // Whether prompt textarea shows for a given provider (only perplexity needs a prompt)
  function showsPrompt(provider: SearchProvider) {
    return !isSearchTab || provider === "perplexity";
  }

  return (
    <div className="min-h-dvh bg-background px-6 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin" className="text-muted hover:text-foreground text-sm">
            Dashboard
          </Link>
          <span className="text-muted">/</span>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">
            Prompt Tester
          </h1>
        </div>
        <p className="text-sm text-muted mt-1">
          Test prompts and providers against real queries. Compare results side-by-side.
        </p>

        {/* Tab selector + version controls */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeTab === tab.key
                    ? "bg-foreground text-background"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {activeVersion && (
              <span className="text-[11px] font-mono text-accent bg-accent/10 px-2 py-1 rounded">
                v{activeVersion.version} active
              </span>
            )}
            <button
              onClick={() => setShowVersions(!showVersions)}
              className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors cursor-pointer ${
                showVersions
                  ? "bg-foreground/10 border-foreground/20 text-foreground"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              Versions
            </button>
          </div>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-500">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline cursor-pointer">dismiss</button>
        </div>
      )}

      {/* Version History Panel */}
      {showVersions && (
        <section className="mb-8 p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium text-foreground">
                Version History ({activeTab})
              </h2>
              {loadingVersions && (
                <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
              )}
            </div>
            {/* Save controls */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={saveNote}
                onChange={(e) => setSaveNote(e.target.value)}
                placeholder="Version note..."
                className="w-48 px-2.5 py-1.5 text-xs bg-background border border-border rounded-md
                  text-foreground placeholder:text-muted outline-none focus:border-accent"
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium bg-foreground/10 text-foreground
                  border border-border rounded-lg hover:bg-foreground/20 transition-colors
                  disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                {saving ? "Saving..." : "Save Prompt A"}
              </button>
            </div>
          </div>

          {versions.length === 0 && !loadingVersions && (
            <p className="text-xs text-muted italic">No saved versions yet.</p>
          )}

          {/* Diff controls */}
          {versions.length >= 2 && (
            <div className="mb-4 p-3 bg-background rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-[11px] font-medium text-muted">Compare:</h3>
                <select
                  value={diffVersions[0] ?? ""}
                  onChange={(e) => setDiffVersions([e.target.value ? Number(e.target.value) : null, diffVersions[1]])}
                  className="px-2 py-1 text-[11px] bg-card border border-border rounded-md text-foreground cursor-pointer"
                >
                  <option value="">Select A</option>
                  {versions.map((v) => <option key={v.id} value={v.id}>v{v.version}{v.note ? ` - ${v.note}` : ""}</option>)}
                </select>
                <span className="text-muted text-[11px]">vs</span>
                <select
                  value={diffVersions[1] ?? ""}
                  onChange={(e) => setDiffVersions([diffVersions[0], e.target.value ? Number(e.target.value) : null])}
                  className="px-2 py-1 text-[11px] bg-card border border-border rounded-md text-foreground cursor-pointer"
                >
                  <option value="">Select B</option>
                  {versions.map((v) => <option key={v.id} value={v.id}>v{v.version}{v.note ? ` - ${v.note}` : ""}</option>)}
                </select>
              </div>
              {diffA && diffB && (
                <div className="rounded-lg bg-background border border-border overflow-hidden">
                  {renderDiff(diffA.content, diffB.content)}
                </div>
              )}
            </div>
          )}

          {/* Version list */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`p-3 rounded-lg border transition-colors ${
                  v.is_active ? "border-accent/40 bg-accent/5" : "border-border bg-background hover:border-foreground/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">v{v.version}</span>
                    {v.is_active && (
                      <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">active</span>
                    )}
                    {v.model && <span className="text-[10px] font-mono text-muted">{v.model}</span>}
                  </div>
                  <span className="text-[10px] text-muted">{new Date(v.created_at).toLocaleDateString()}</span>
                </div>
                {v.note && <p className="text-[11px] text-muted mb-2 truncate">{v.note}</p>}
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { setPromptA(v.content); if (v.model) setModelA(v.model); }}
                    className="text-[11px] text-accent hover:underline cursor-pointer">Load A</button>
                  <span className="text-muted text-[10px]">|</span>
                  <button onClick={() => { setPromptB(v.content); if (v.model) setModelB(v.model); }}
                    className="text-[11px] text-accent hover:underline cursor-pointer">Load B</button>
                  <span className="text-muted text-[10px]">|</span>
                  {v.is_active ? (
                    <button onClick={() => handleDeactivate(v.id)}
                      className="text-[11px] text-rose-400 hover:underline cursor-pointer">Deactivate</button>
                  ) : (
                    <button onClick={() => handleActivate(v.id)}
                      className="text-[11px] text-emerald-400 hover:underline cursor-pointer">Activate</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Input Section */}
      <section className="mb-8 p-5 bg-card border border-border rounded-xl">
        <h2 className="text-sm font-medium text-foreground mb-4">Test Input</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">
              {isSearchTab ? "Person Name / Query" : activeTab === "extract" ? "Raw Profile Text / Query" : "User Content"}
            </label>
            {activeTab === "recommend" || activeTab === "extract" ? (
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={4}
                placeholder={activeTab === "recommend" ? "Paste full user prompt (profile + answers + resources)..." : "Paste raw LinkedIn text..."}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm
                  text-foreground placeholder:text-muted outline-none focus:border-accent font-mono text-xs leading-relaxed resize-y"
              />
            ) : (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Noah Lloyd AI safety Nashville"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm
                  text-foreground placeholder:text-muted outline-none focus:border-accent"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    runPrompt(promptA, providerA, modelA, setResultA, setLoadingA);
                  }
                }}
              />
            )}
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">LinkedIn URL (optional)</label>
            <input
              type="text"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/username"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm
                text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={runScrape}
                disabled={loadingScrape}
                className="px-4 py-2 text-xs font-medium bg-foreground/10 text-foreground
                  border border-border rounded-lg hover:bg-foreground/20 transition-colors
                  disabled:opacity-40 cursor-pointer"
              >
                {loadingScrape ? "Scraping..." : "Scrape Profile"}
              </button>
              <button
                onClick={runEnrich}
                disabled={loadingScrape || !linkedinUrl.trim()}
                className="px-4 py-2 text-xs font-medium bg-foreground/10 text-foreground
                  border border-border rounded-lg hover:bg-foreground/20 transition-colors
                  disabled:opacity-40 cursor-pointer"
              >
                {loadingScrape ? "..." : "Full Enrich"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Scrape Results */}
      {scrapeResult && (
        <section className="mb-8 p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">
              Scrape Result
              <span className="ml-2 text-xs text-muted font-mono">({scrapeResult.platform})</span>
            </h2>
            <button onClick={() => setScrapeResult(null)} className="text-xs text-muted hover:text-foreground cursor-pointer">clear</button>
          </div>
          <pre className="text-xs text-muted-foreground bg-background p-4 rounded-lg overflow-auto max-h-[400px] whitespace-pre-wrap break-words border border-border/50">
            {JSON.stringify(scrapeResult.profile, null, 2)}
          </pre>
        </section>
      )}

      {/* Prompt Editors - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Prompt A */}
        <section className="p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium text-foreground">Prompt A</h2>
              {isSearchTab && (
                <select
                  value={providerA}
                  onChange={(e) => setProviderA(e.target.value as SearchProvider)}
                  className="px-2 py-1 text-[11px] bg-background border border-border rounded-md text-foreground outline-none focus:border-accent cursor-pointer"
                >
                  <option value="perplexity">Perplexity</option>
                  <option value="exa">Exa</option>
                  <option value="tavily">Tavily</option>
                </select>
              )}
              {!isSearchTab && (
                <select
                  value={modelA}
                  onChange={(e) => setModelA(e.target.value)}
                  className="px-2 py-1 text-[11px] bg-background border border-border rounded-md text-foreground outline-none focus:border-accent cursor-pointer"
                >
                  <option value="">Default model</option>
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={() => setPromptA(DEFAULT_PROMPTS[activeTab])}
              className="text-xs text-muted hover:text-foreground cursor-pointer"
            >
              reset
            </button>
          </div>
          {showsPrompt(providerA) ? (
            <textarea
              value={promptA}
              onChange={(e) => setPromptA(e.target.value)}
              rows={6}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-xs
                text-foreground font-mono leading-relaxed resize-y outline-none focus:border-accent mb-3"
              spellCheck={false}
            />
          ) : (
            <p className="text-xs text-muted-foreground mb-3 px-1">
              {providerA === "exa" ? "Exa uses its people search index - no prompt needed." : "Tavily uses web search with domain filtering - no prompt needed."}
            </p>
          )}
          <button
            onClick={() => runPrompt(promptA, providerA, modelA, setResultA, setLoadingA)}
            disabled={loadingA}
            className="px-5 py-2.5 text-xs font-medium bg-foreground text-background
              rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {loadingA ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Running...
              </span>
            ) : (
              <>Run A{isSearchTab ? ` (${providerA})` : modelA ? ` (${AVAILABLE_MODELS.find(m => m.id === modelA)?.label || modelA})` : ""} <span className="opacity-50 ml-1">(Cmd+Enter)</span></>
            )}
          </button>
        </section>

        {/* Prompt B */}
        <section className="p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium text-foreground">Prompt B</h2>
              {isSearchTab && (
                <select
                  value={providerB}
                  onChange={(e) => setProviderB(e.target.value as SearchProvider)}
                  className="px-2 py-1 text-[11px] bg-background border border-border rounded-md text-foreground outline-none focus:border-accent cursor-pointer"
                >
                  <option value="perplexity">Perplexity</option>
                  <option value="exa">Exa</option>
                  <option value="tavily">Tavily</option>
                </select>
              )}
              {!isSearchTab && (
                <select
                  value={modelB}
                  onChange={(e) => setModelB(e.target.value)}
                  className="px-2 py-1 text-[11px] bg-background border border-border rounded-md text-foreground outline-none focus:border-accent cursor-pointer"
                >
                  <option value="">Default model</option>
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={() => setPromptB(promptA)}
              className="text-xs text-muted hover:text-foreground cursor-pointer"
            >
              copy from A
            </button>
          </div>
          {showsPrompt(providerB) ? (
            <textarea
              value={promptB}
              onChange={(e) => setPromptB(e.target.value)}
              rows={6}
              placeholder="Paste an alternative prompt here to compare..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-xs
                text-foreground font-mono leading-relaxed resize-y outline-none focus:border-accent
                placeholder:text-muted mb-3"
              spellCheck={false}
            />
          ) : (
            <p className="text-xs text-muted-foreground mb-3 px-1">
              {providerB === "exa" ? "Exa uses its people search index - no prompt needed." : "Tavily uses web search with domain filtering - no prompt needed."}
            </p>
          )}
          <button
            onClick={() => runPrompt(promptB, providerB, modelB, setResultB, setLoadingB)}
            disabled={loadingB || (showsPrompt(providerB) && !promptB.trim())}
            className="px-5 py-2.5 text-xs font-medium bg-foreground text-background
              rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {loadingB ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Running...
              </span>
            ) : (
              <>Run B{isSearchTab ? ` (${providerB})` : modelB ? ` (${AVAILABLE_MODELS.find(m => m.id === modelB)?.label || modelB})` : ""}</>
            )}
          </button>
        </section>
      </div>

      {/* Run Both Button */}
      <div className="flex justify-center mb-8">
        <button
          onClick={() => {
            runPrompt(promptA, providerA, modelA, setResultA, setLoadingA);
            if (!showsPrompt(providerB) || promptB.trim()) {
              runPrompt(promptB, providerB, modelB, setResultB, setLoadingB);
            }
          }}
          disabled={loadingA || loadingB || !query.trim()}
          className="px-8 py-3 text-sm font-medium bg-accent text-white
            rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
        >
          {loadingA || loadingB ? "Running..." : "Run Both"}
        </button>
      </div>

      {/* Results Comparison */}
      {(resultA || resultB) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Result A */}
          <section ref={resultARef} className="p-5 bg-card border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-foreground">
                Result A
                {resultA?.provider && <span className="ml-2 text-xs text-muted font-normal">({resultA.provider})</span>}
              </h2>
              {resultA && (
                <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
                  <span>{resultA.latencyMs}ms</span>
                  {resultA.inputTokens > 0 && <span>{resultA.inputTokens}in / {resultA.outputTokens}out</span>}
                  <span>${resultA.estimatedCost.toFixed(4)}</span>
                </div>
              )}
            </div>
            {resultA ? (
              <>
                <div className="text-xs text-muted-foreground bg-background p-4 rounded-lg overflow-auto max-h-[600px] whitespace-pre-wrap break-words border border-border/50 leading-relaxed">
                  {resultA.parsedJson ? JSON.stringify(resultA.parsedJson, null, 2) : resultA.text}
                </div>
                {resultA.citations && resultA.citations.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-[11px] font-medium text-muted mb-1.5">Citations ({resultA.citations.length})</h3>
                    <div className="flex flex-col gap-1">
                      {resultA.citations.map((c, i) => (
                        <a key={i} href={c} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-accent hover:underline truncate">{c}</a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-muted text-sm italic">No result yet</div>
            )}
          </section>

          {/* Result B */}
          <section ref={resultBRef} className="p-5 bg-card border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-foreground">
                Result B
                {resultB?.provider && <span className="ml-2 text-xs text-muted font-normal">({resultB.provider})</span>}
              </h2>
              {resultB && (
                <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
                  <span>{resultB.latencyMs}ms</span>
                  {resultB.inputTokens > 0 && <span>{resultB.inputTokens}in / {resultB.outputTokens}out</span>}
                  <span>${resultB.estimatedCost.toFixed(4)}</span>
                </div>
              )}
            </div>
            {resultB ? (
              <>
                <div className="text-xs text-muted-foreground bg-background p-4 rounded-lg overflow-auto max-h-[600px] whitespace-pre-wrap break-words border border-border/50 leading-relaxed">
                  {resultB.parsedJson ? JSON.stringify(resultB.parsedJson, null, 2) : resultB.text}
                </div>
                {resultB.citations && resultB.citations.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-[11px] font-medium text-muted mb-1.5">Citations ({resultB.citations.length})</h3>
                    <div className="flex flex-col gap-1">
                      {resultB.citations.map((c, i) => (
                        <a key={i} href={c} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-accent hover:underline truncate">{c}</a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-muted text-sm italic">
                {showsPrompt(providerB) && !promptB.trim() ? "Add a Prompt B to compare" : "No result yet"}
              </div>
            )}
          </section>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-foreground">
              History
              <span className="ml-2 text-xs text-muted font-normal">({history.length} runs)</span>
            </h2>
            <button onClick={() => setHistory([])} className="text-xs text-muted hover:text-foreground cursor-pointer">clear</button>
          </div>
          <div className="flex flex-col gap-2">
            {history.map((h, i) => (
              <details key={i} className="group">
                <summary className="flex items-center justify-between px-3 py-2 rounded-lg bg-background hover:bg-foreground/5 cursor-pointer text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-medium">{h.query.slice(0, 60)}{h.query.length > 60 ? "..." : ""}</span>
                    {h.provider && (
                      <span className="text-[10px] font-mono text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">{h.provider}</span>
                    )}
                    <span className="text-[11px] font-mono text-muted">{h.latencyMs}ms</span>
                    {h.inputTokens > 0 && (
                      <span className="text-[11px] font-mono text-muted">${h.estimatedCost.toFixed(4)}</span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-muted">{new Date(h.timestamp).toLocaleTimeString()}</span>
                </summary>
                <div className="mt-2 ml-3">
                  <pre className="text-xs text-muted-foreground bg-background p-3 rounded-lg overflow-auto max-h-[300px] whitespace-pre-wrap break-words border border-border/50">
                    {h.parsedJson ? JSON.stringify(h.parsedJson, null, 2) : h.text}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

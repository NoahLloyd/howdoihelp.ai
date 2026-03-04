"use client";

import { useState, useRef } from "react";
import Link from "next/link";

const DEFAULT_PERPLEXITY_PROMPT = `Search for this person and look them up anywhere you can find. Extract all information you can find about them. Output sections with bullet lists in each of every idea or thing about them you can find. This should be a fairly comprehensive overview extracting every single thing about them from their public presence.`;

interface PromptResult {
  text: string;
  citations: string[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  prompt: string;
  query: string;
  timestamp: number;
}

interface ScrapeResult {
  profile: Record<string, unknown> | null;
  platform: string;
}

export default function PromptTesterPage() {
  // Input state
  const [query, setQuery] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // Prompt state
  const [promptA, setPromptA] = useState(DEFAULT_PERPLEXITY_PROMPT);
  const [promptB, setPromptB] = useState("");

  // Results
  const [resultA, setResultA] = useState<PromptResult | null>(null);
  const [resultB, setResultB] = useState<PromptResult | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [history, setHistory] = useState<PromptResult[]>([]);

  // Loading
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [loadingScrape, setLoadingScrape] = useState(false);

  // Error
  const [error, setError] = useState<string | null>(null);

  const resultARef = useRef<HTMLDivElement>(null);
  const resultBRef = useRef<HTMLDivElement>(null);

  async function runPrompt(
    prompt: string,
    setter: (r: PromptResult) => void,
    setLoading: (b: boolean) => void,
  ) {
    if (!query.trim()) {
      setError("Enter a person's name or query");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/test-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), systemPrompt: prompt }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const result: PromptResult = {
        ...data,
        prompt,
        query: query.trim(),
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
        const data = await res.json();
        setScrapeResult(data);
      } else if (q) {
        // Use search-profile for name-based lookup
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
          Test Perplexity prompts against real queries. Compare results side-by-side.
        </p>
      </header>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-500">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 underline cursor-pointer"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Input Section */}
      <section className="mb-8 p-5 bg-card border border-border rounded-xl">
        <h2 className="text-sm font-medium text-foreground mb-4">Test Input</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Person Name / Query
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Noah Lloyd AI safety Nashville"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm
                text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">
              LinkedIn URL (optional)
            </label>
            <input
              type="text"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/username"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm
                text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
        </div>
        <div className="flex gap-2">
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
      </section>

      {/* Scrape Results */}
      {scrapeResult && (
        <section className="mb-8 p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">
              Scrape Result
              <span className="ml-2 text-xs text-muted font-mono">
                ({scrapeResult.platform})
              </span>
            </h2>
            <button
              onClick={() => setScrapeResult(null)}
              className="text-xs text-muted hover:text-foreground cursor-pointer"
            >
              clear
            </button>
          </div>
          <pre className="text-xs text-muted-foreground bg-background p-4 rounded-lg
            overflow-auto max-h-[400px] whitespace-pre-wrap break-words border border-border/50">
            {JSON.stringify(scrapeResult.profile, null, 2)}
          </pre>
        </section>
      )}

      {/* Prompt Editors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Prompt A */}
        <section className="p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">
              Prompt A
              <span className="ml-2 text-xs text-muted font-normal">(current)</span>
            </h2>
            <button
              onClick={() => setPromptA(DEFAULT_PERPLEXITY_PROMPT)}
              className="text-xs text-muted hover:text-foreground cursor-pointer"
            >
              reset
            </button>
          </div>
          <textarea
            value={promptA}
            onChange={(e) => setPromptA(e.target.value)}
            rows={6}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-xs
              text-foreground font-mono leading-relaxed resize-y outline-none focus:border-accent"
          />
          <button
            onClick={() => runPrompt(promptA, setResultA, setLoadingA)}
            disabled={loadingA}
            className="mt-3 px-5 py-2.5 text-xs font-medium bg-foreground text-background
              rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {loadingA ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Running...
              </span>
            ) : (
              "Run Prompt A"
            )}
          </button>
        </section>

        {/* Prompt B */}
        <section className="p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">
              Prompt B
              <span className="ml-2 text-xs text-muted font-normal">(experimental)</span>
            </h2>
            <button
              onClick={() => setPromptB(promptA)}
              className="text-xs text-muted hover:text-foreground cursor-pointer"
            >
              copy from A
            </button>
          </div>
          <textarea
            value={promptB}
            onChange={(e) => setPromptB(e.target.value)}
            rows={6}
            placeholder="Paste an alternative prompt here to compare..."
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-xs
              text-foreground font-mono leading-relaxed resize-y outline-none focus:border-accent
              placeholder:text-muted"
          />
          <button
            onClick={() => runPrompt(promptB, setResultB, setLoadingB)}
            disabled={loadingB || !promptB.trim()}
            className="mt-3 px-5 py-2.5 text-xs font-medium bg-foreground text-background
              rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {loadingB ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Running...
              </span>
            ) : (
              "Run Prompt B"
            )}
          </button>
        </section>
      </div>

      {/* Run Both Button */}
      <div className="flex justify-center mb-8">
        <button
          onClick={() => {
            runPrompt(promptA, setResultA, setLoadingA);
            if (promptB.trim()) {
              runPrompt(promptB, setResultB, setLoadingB);
            }
          }}
          disabled={loadingA || loadingB || !query.trim()}
          className="px-8 py-3 text-sm font-medium bg-accent text-white
            rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
        >
          {loadingA || loadingB ? "Running..." : `Run ${promptB.trim() ? "Both" : "Prompt A"}`}
        </button>
      </div>

      {/* Results Comparison */}
      {(resultA || resultB) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Result A */}
          <section ref={resultARef} className="p-5 bg-card border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-foreground">Result A</h2>
              {resultA && (
                <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
                  <span>{resultA.durationMs}ms</span>
                  <span>{resultA.inputTokens}in / {resultA.outputTokens}out</span>
                </div>
              )}
            </div>
            {resultA ? (
              <>
                <div className="text-xs text-muted-foreground bg-background p-4 rounded-lg
                  overflow-auto max-h-[600px] whitespace-pre-wrap break-words border border-border/50
                  leading-relaxed">
                  {resultA.text}
                </div>
                {resultA.citations.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-[11px] font-medium text-muted mb-1.5">
                      Citations ({resultA.citations.length})
                    </h3>
                    <div className="flex flex-col gap-1">
                      {resultA.citations.map((c, i) => (
                        <a
                          key={i}
                          href={c}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-accent hover:underline truncate"
                        >
                          {c}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-muted text-sm italic">
                No result yet
              </div>
            )}
          </section>

          {/* Result B */}
          <section ref={resultBRef} className="p-5 bg-card border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-foreground">Result B</h2>
              {resultB && (
                <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
                  <span>{resultB.durationMs}ms</span>
                  <span>{resultB.inputTokens}in / {resultB.outputTokens}out</span>
                </div>
              )}
            </div>
            {resultB ? (
              <>
                <div className="text-xs text-muted-foreground bg-background p-4 rounded-lg
                  overflow-auto max-h-[600px] whitespace-pre-wrap break-words border border-border/50
                  leading-relaxed">
                  {resultB.text}
                </div>
                {resultB.citations.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-[11px] font-medium text-muted mb-1.5">
                      Citations ({resultB.citations.length})
                    </h3>
                    <div className="flex flex-col gap-1">
                      {resultB.citations.map((c, i) => (
                        <a
                          key={i}
                          href={c}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-accent hover:underline truncate"
                        >
                          {c}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-muted text-sm italic">
                {promptB.trim() ? "No result yet" : "Add a Prompt B to compare"}
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
              <span className="ml-2 text-xs text-muted font-normal">
                ({history.length} runs)
              </span>
            </h2>
            <button
              onClick={() => setHistory([])}
              className="text-xs text-muted hover:text-foreground cursor-pointer"
            >
              clear
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {history.map((h, i) => (
              <details key={i} className="group">
                <summary className="flex items-center justify-between px-3 py-2 rounded-lg
                  bg-background hover:bg-foreground/5 cursor-pointer text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-medium">{h.query}</span>
                    <span className="text-[11px] font-mono text-muted">
                      {h.durationMs}ms
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted">
                    {new Date(h.timestamp).toLocaleTimeString()}
                  </span>
                </summary>
                <div className="mt-2 ml-3">
                  <div className="text-[11px] text-muted mb-2 font-mono bg-background/50 p-2 rounded">
                    Prompt: {h.prompt.slice(0, 120)}...
                  </div>
                  <pre className="text-xs text-muted-foreground bg-background p-3 rounded-lg
                    overflow-auto max-h-[300px] whitespace-pre-wrap break-words border border-border/50">
                    {h.text}
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

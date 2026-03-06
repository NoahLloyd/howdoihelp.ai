"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

type Provider = "perplexity" | "exa" | "tavily";

const PROVIDERS: { id: Provider; label: string; color: string; description: string }[] = [
  { id: "perplexity", label: "Perplexity", color: "text-blue-500", description: "AI search with custom prompt" },
  { id: "exa", label: "Exa", color: "text-violet-500", description: "People search index" },
  { id: "tavily", label: "Tavily", color: "text-amber-500", description: "Web search with domain filtering" },
];

const PROVIDER_COLORS: Record<Provider, { bg: string; border: string; text: string; dot: string }> = {
  perplexity: { bg: "bg-blue-500/5", border: "border-blue-500/20", text: "text-blue-500", dot: "bg-blue-500" },
  exa: { bg: "bg-violet-500/5", border: "border-violet-500/20", text: "text-violet-500", dot: "bg-violet-500" },
  tavily: { bg: "bg-amber-500/5", border: "border-amber-500/20", text: "text-amber-500", dot: "bg-amber-500" },
};

const DEFAULT_PERPLEXITY_PROMPT = `Search for this specific person and report ONLY facts you can verify from search results. Do NOT guess, infer, or fill in gaps.

Output these sections (skip any section where you found nothing):

## Identity
- Full name
- Current job title and company
- Location

## Professional Background
- Current and past roles (only those explicitly found in sources)
- Key skills or areas of expertise mentioned in their profiles

## Education
- Schools, degrees, fields of study (only if explicitly stated)

## Public Presence
- Notable projects, publications, talks, or open-source work
- Any public writing, blog posts, or media appearances

IMPORTANT RULES:
- If the name is common, only include information you are confident belongs to THIS specific person. Look for consistency across sources.
- NEVER fabricate roles, companies, education, or achievements. If you only found a name and headline, report only that.
- If you found very little, say so explicitly. A short accurate response is far better than a long fabricated one.
- Do NOT include generic biographical filler or assumptions about someone's interests based on their field.
- Each fact should be traceable to a search result.`;

interface PromptResult {
  text: string;
  citations: string[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  prompt: string;
  query: string;
  timestamp: number;
  provider?: Provider;
}

interface ScrapeResult {
  profile: Record<string, unknown> | null;
  platform: string;
}

function ProviderPill({
  provider,
  selected,
  onClick,
}: {
  provider: (typeof PROVIDERS)[number];
  selected: boolean;
  onClick: () => void;
}) {
  const colors = PROVIDER_COLORS[provider.id];
  return (
    <button
      onClick={onClick}
      className={`relative px-3 py-1.5 text-[11px] font-medium rounded-full border transition-all duration-150 cursor-pointer
        ${selected
          ? `${colors.bg} ${colors.border} ${colors.text}`
          : "bg-transparent border-border text-muted hover:text-foreground hover:border-border/80"
        }`}
    >
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${selected ? colors.dot : "bg-muted/50"}`} />
        {provider.label}
      </span>
    </button>
  );
}

function StatBadge({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono
        ${accent ? "bg-accent/10 text-accent" : "bg-foreground/5 text-muted"}`}
    >
      <span className="opacity-60">{label}</span>
      {value}
    </span>
  );
}

export default function PromptTesterPage() {
  // Input state
  const [query, setQuery] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // Prompt state
  const [promptA, setPromptA] = useState(DEFAULT_PERPLEXITY_PROMPT);
  const [promptB, setPromptB] = useState("");

  // Provider state
  const [providerA, setProviderA] = useState<Provider>("perplexity");
  const [providerB, setProviderB] = useState<Provider>("exa");

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
    provider: Provider,
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
        body: JSON.stringify({ query: query.trim(), systemPrompt: prompt, provider }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const result: PromptResult = {
        ...data,
        prompt,
        provider,
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

  function renderResult(result: PromptResult | null, label: string, ref: React.RefObject<HTMLDivElement | null>) {
    const providerInfo = result?.provider ? PROVIDER_COLORS[result.provider] : null;

    return (
      <motion.section
        ref={ref}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`p-5 rounded-xl border transition-colors
          ${providerInfo ? `${providerInfo.bg} ${providerInfo.border}` : "bg-card border-border"}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-foreground">{label}</h2>
            {result?.provider && (
              <span className={`flex items-center gap-1.5 text-[10px] font-mono ${PROVIDER_COLORS[result.provider].text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${PROVIDER_COLORS[result.provider].dot}`} />
                {result.provider}
              </span>
            )}
          </div>
          {result && (
            <div className="flex items-center gap-1.5">
              <StatBadge label="" value={`${result.durationMs}ms`} accent />
              {result.inputTokens > 0 && (
                <StatBadge label="" value={`${result.inputTokens}in / ${result.outputTokens}out`} />
              )}
            </div>
          )}
        </div>
        {result ? (
          <>
            <div className="text-[13px] text-muted-foreground bg-background/80 p-4 rounded-lg
              overflow-auto max-h-[600px] whitespace-pre-wrap break-words border border-border/30
              leading-relaxed backdrop-blur-sm">
              {result.text}
            </div>
            {result.citations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <h3 className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">
                  Citations ({result.citations.length})
                </h3>
                <div className="flex flex-col gap-1">
                  {result.citations.map((c, i) => (
                    <a
                      key={i}
                      href={c}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-accent hover:underline truncate block"
                    >
                      {c}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center">
            <div className="text-muted/40 text-2xl mb-2">~</div>
            <div className="text-muted text-xs italic">Waiting for results</div>
          </div>
        )}
      </motion.section>
    );
  }

  return (
    <div className="min-h-dvh bg-background px-6 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <motion.header
        className="mb-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 mb-1 text-sm">
          <Link href="/admin" className="text-muted hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <span className="text-border">/</span>
          <span className="text-foreground font-medium">Prompt Tester</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight mt-2">
          Search Provider Testing
        </h1>
        <p className="text-sm text-muted mt-1">
          Compare search providers and prompts side-by-side with real queries.
        </p>
      </motion.header>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="mb-6 px-4 py-3 bg-rose-500/8 border border-rose-500/15 rounded-xl text-sm text-rose-500
              flex items-center justify-between"
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-3 text-rose-500/60 hover:text-rose-500 text-xs cursor-pointer"
            >
              dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Section */}
      <motion.section
        className="mb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="p-6 bg-card border border-border rounded-2xl">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <h2 className="text-sm font-medium text-foreground">Test Input</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-2">
                Person / Query
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Noah Lloyd AI safety Nashville"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm
                  text-foreground placeholder:text-muted/50 outline-none focus:border-accent
                  focus:ring-1 focus:ring-accent/20 transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) {
                    runPrompt(promptA, providerA, setResultA, setLoadingA);
                    if (providerB !== "perplexity" || promptB.trim()) {
                      runPrompt(promptB, providerB, setResultB, setLoadingB);
                    }
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-2">
                Profile URL <span className="text-muted/50 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/username"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm
                  text-foreground placeholder:text-muted/50 outline-none focus:border-accent
                  focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runScrape}
              disabled={loadingScrape}
              className="px-4 py-2 text-xs font-medium bg-background text-foreground
                border border-border rounded-lg hover:bg-card-hover transition-colors
                disabled:opacity-40 cursor-pointer"
            >
              {loadingScrape ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                  Scraping...
                </span>
              ) : (
                "Scrape Profile"
              )}
            </button>
            <button
              onClick={runEnrich}
              disabled={loadingScrape || !linkedinUrl.trim()}
              className="px-4 py-2 text-xs font-medium bg-background text-foreground
                border border-border rounded-lg hover:bg-card-hover transition-colors
                disabled:opacity-40 cursor-pointer"
            >
              Full Enrich
            </button>
            <div className="flex-1" />
            <span className="text-[10px] text-muted/50 font-mono">
              enter to run both
            </span>
          </div>
        </div>
      </motion.section>

      {/* Scrape Results */}
      <AnimatePresence>
        {scrapeResult && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8"
          >
            <div className="p-6 bg-card border border-border rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h2 className="text-sm font-medium text-foreground">Scrape Result</h2>
                  <span className="text-[10px] font-mono text-muted bg-foreground/5 px-2 py-0.5 rounded-full">
                    {scrapeResult.platform}
                  </span>
                </div>
                <button
                  onClick={() => setScrapeResult(null)}
                  className="text-[11px] text-muted hover:text-foreground cursor-pointer transition-colors"
                >
                  clear
                </button>
              </div>
              <pre className="text-xs text-muted-foreground bg-background p-4 rounded-xl
                overflow-auto max-h-[400px] whitespace-pre-wrap break-words border border-border/50
                font-mono leading-relaxed">
                {JSON.stringify(scrapeResult.profile, null, 2)}
              </pre>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Provider Panels */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Panel A */}
        <div className="p-6 bg-card border border-border rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-foreground/8 text-[10px] font-bold text-foreground">
                A
              </span>
              <h2 className="text-sm font-medium text-foreground">Source A</h2>
            </div>
            <button
              onClick={() => setPromptA(DEFAULT_PERPLEXITY_PROMPT)}
              className="text-[11px] text-muted hover:text-foreground cursor-pointer transition-colors"
            >
              reset prompt
            </button>
          </div>

          {/* Provider pills */}
          <div className="flex gap-1.5 mb-4">
            {PROVIDERS.map((p) => (
              <ProviderPill
                key={p.id}
                provider={p}
                selected={providerA === p.id}
                onClick={() => setProviderA(p.id)}
              />
            ))}
          </div>

          {/* Prompt editor or description */}
          {providerA === "perplexity" ? (
            <textarea
              value={promptA}
              onChange={(e) => setPromptA(e.target.value)}
              rows={5}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs
                text-foreground font-mono leading-relaxed resize-y outline-none focus:border-accent
                focus:ring-1 focus:ring-accent/20 transition-all mb-4"
            />
          ) : (
            <div className={`px-4 py-3 rounded-xl border mb-4 ${PROVIDER_COLORS[providerA].bg} ${PROVIDER_COLORS[providerA].border}`}>
              <p className={`text-xs ${PROVIDER_COLORS[providerA].text}`}>
                {PROVIDERS.find((p) => p.id === providerA)?.description} — no prompt needed.
              </p>
            </div>
          )}

          <button
            onClick={() => runPrompt(promptA, providerA, setResultA, setLoadingA)}
            disabled={loadingA}
            className="w-full px-5 py-2.5 text-xs font-medium bg-foreground text-background
              rounded-xl hover:opacity-90 transition-all disabled:opacity-40 cursor-pointer"
          >
            {loadingA ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Searching...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                Run A
                <span className="opacity-50">({providerA})</span>
              </span>
            )}
          </button>
        </div>

        {/* Panel B */}
        <div className="p-6 bg-card border border-border rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-foreground/8 text-[10px] font-bold text-foreground">
                B
              </span>
              <h2 className="text-sm font-medium text-foreground">Source B</h2>
            </div>
            <button
              onClick={() => setPromptB(promptA)}
              className="text-[11px] text-muted hover:text-foreground cursor-pointer transition-colors"
            >
              copy prompt from A
            </button>
          </div>

          {/* Provider pills */}
          <div className="flex gap-1.5 mb-4">
            {PROVIDERS.map((p) => (
              <ProviderPill
                key={p.id}
                provider={p}
                selected={providerB === p.id}
                onClick={() => setProviderB(p.id)}
              />
            ))}
          </div>

          {/* Prompt editor or description */}
          {providerB === "perplexity" ? (
            <textarea
              value={promptB}
              onChange={(e) => setPromptB(e.target.value)}
              rows={5}
              placeholder="Paste an alternative prompt here..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs
                text-foreground font-mono leading-relaxed resize-y outline-none focus:border-accent
                focus:ring-1 focus:ring-accent/20 transition-all placeholder:text-muted/40 mb-4"
            />
          ) : (
            <div className={`px-4 py-3 rounded-xl border mb-4 ${PROVIDER_COLORS[providerB].bg} ${PROVIDER_COLORS[providerB].border}`}>
              <p className={`text-xs ${PROVIDER_COLORS[providerB].text}`}>
                {PROVIDERS.find((p) => p.id === providerB)?.description} — no prompt needed.
              </p>
            </div>
          )}

          <button
            onClick={() => runPrompt(promptB, providerB, setResultB, setLoadingB)}
            disabled={loadingB || (providerB === "perplexity" && !promptB.trim())}
            className="w-full px-5 py-2.5 text-xs font-medium bg-foreground text-background
              rounded-xl hover:opacity-90 transition-all disabled:opacity-40 cursor-pointer"
          >
            {loadingB ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Searching...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                Run B
                <span className="opacity-50">({providerB})</span>
              </span>
            )}
          </button>
        </div>
      </motion.div>

      {/* Run Both */}
      <motion.div
        className="flex justify-center mb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <button
          onClick={() => {
            runPrompt(promptA, providerA, setResultA, setLoadingA);
            if (providerB !== "perplexity" || promptB.trim()) {
              runPrompt(promptB, providerB, setResultB, setLoadingB);
            }
          }}
          disabled={loadingA || loadingB || !query.trim()}
          className="group px-10 py-3 text-sm font-medium bg-accent text-white
            rounded-xl hover:bg-accent-hover transition-all disabled:opacity-40 cursor-pointer
            shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/25"
        >
          {loadingA || loadingB ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Running...
            </span>
          ) : (
            "Run Both"
          )}
        </button>
      </motion.div>

      {/* Results Comparison */}
      <AnimatePresence>
        {(resultA || resultB) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Section header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <h2 className="text-sm font-medium text-foreground">Results</h2>
              {resultA && resultB && (
                <span className="text-[10px] font-mono text-muted">
                  {resultA.durationMs < resultB.durationMs
                    ? `A was ${resultB.durationMs - resultA.durationMs}ms faster`
                    : `B was ${resultA.durationMs - resultB.durationMs}ms faster`}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
              {renderResult(resultA, "Result A", resultARef)}
              {renderResult(resultB, "Result B", resultBRef)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      <AnimatePresence>
        {history.length > 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="pb-10"
          >
            <div className="p-6 bg-card border border-border rounded-2xl">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted" />
                  <h2 className="text-sm font-medium text-foreground">History</h2>
                  <span className="text-[10px] font-mono text-muted bg-foreground/5 px-2 py-0.5 rounded-full">
                    {history.length} runs
                  </span>
                </div>
                <button
                  onClick={() => setHistory([])}
                  className="text-[11px] text-muted hover:text-foreground cursor-pointer transition-colors"
                >
                  clear all
                </button>
              </div>

              <div className="flex flex-col gap-1">
                {history.map((h, i) => {
                  const providerColor = h.provider ? PROVIDER_COLORS[h.provider] : null;
                  return (
                    <motion.details
                      key={`${h.timestamp}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="group"
                    >
                      <summary className="flex items-center justify-between px-3 py-2.5 rounded-xl
                        hover:bg-foreground/3 cursor-pointer text-sm transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="text-foreground font-medium truncate">{h.query}</span>
                          {h.provider && (
                            <span className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0
                              ${providerColor?.bg} ${providerColor?.border} ${providerColor?.text}`}>
                              <span className={`w-1 h-1 rounded-full ${providerColor?.dot}`} />
                              {h.provider}
                            </span>
                          )}
                          <StatBadge label="" value={`${h.durationMs}ms`} />
                        </div>
                        <span className="text-[10px] font-mono text-muted/50 shrink-0 ml-3">
                          {new Date(h.timestamp).toLocaleTimeString()}
                        </span>
                      </summary>
                      <div className="mt-1 ml-3 mb-2">
                        {h.prompt && (
                          <div className="text-[11px] text-muted/60 mb-2 font-mono bg-foreground/3 px-3 py-2 rounded-lg
                            max-h-16 overflow-hidden relative">
                            {h.prompt.slice(0, 200)}
                            {h.prompt.length > 200 && "..."}
                          </div>
                        )}
                        <pre className="text-xs text-muted-foreground bg-background p-4 rounded-xl
                          overflow-auto max-h-[300px] whitespace-pre-wrap break-words border border-border/50
                          leading-relaxed">
                          {h.text}
                        </pre>
                        {h.citations.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {h.citations.map((c, ci) => (
                              <a
                                key={ci}
                                href={c}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-accent hover:underline bg-accent/5 px-2 py-0.5 rounded-full"
                              >
                                {new URL(c).hostname}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.details>
                  );
                })}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

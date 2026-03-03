"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

type ScriptStatus = "idle" | "running" | "success" | "error";
type LogEntry = { time: string; text: string; type: "stdout" | "stderr" | "status" };

const GATHERERS = [
  { id: "gather-aisafety", name: "AISafety.com", desc: "Airtable shared view" },
  { id: "gather-ea-lesswrong", name: "EA Forum + LessWrong", desc: "GraphQL API" },
  { id: "gather-eventbrite", name: "Eventbrite", desc: "Search + scrape" },
  { id: "gather-luma", name: "Luma", desc: "Calendar API + discover" },
  { id: "gather-meetup", name: "Meetup.com", desc: "Search + JSON-LD" },
] as const;

export function PipelinePage() {
  const [mode, setMode] = useState<"dry-run" | "live">("dry-run");
  const [activeScript, setActiveScript] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ScriptStatus>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [evalUrl, setEvalUrl] = useState("");
  const [communityEvalUrl, setCommunityEvalUrl] = useState("");

  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll log viewer
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleLogScroll = useCallback(() => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  function appendLog(text: string, type: LogEntry["type"]) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => [...prev, { time, text, type }]);
  }

  // Scripts that call the Anthropic API and consume credits
  const EXPENSIVE_SCRIPTS: Record<string, string> = {
    "evaluate": "This will evaluate ALL pending event candidates using the Anthropic API. This can consume significant API credits.",
    "sync-all": "This will gather events AND evaluate all pending candidates using the Anthropic API. This can consume significant API credits.",
    "evaluate-community": "This will evaluate ALL pending community candidates using the Anthropic API. This can consume significant API credits.",
    "sync-all-communities": "This will gather communities AND evaluate all pending candidates using the Anthropic API. This can consume significant API credits.",
  };

  function runScript(scriptId: string, extraParams?: string) {
    if (activeScript) return;

    // Warn before running expensive scripts (but not single-URL evaluations)
    const isSingleEval = extraParams?.includes("url=");
    if (EXPENSIVE_SCRIPTS[scriptId] && !isSingleEval) {
      if (!window.confirm(`${EXPENSIVE_SCRIPTS[scriptId]}\n\nAre you sure you want to continue?`)) {
        return;
      }
    }

    // Close any existing connection
    eventSourceRef.current?.close();

    setActiveScript(scriptId);
    setStatuses((prev) => ({ ...prev, [scriptId]: "running" }));
    appendLog(`--- Starting ${scriptId} (${mode}) ---`, "status");

    const url = `/api/pipeline/run?script=${scriptId}&mode=${mode}${extraParams || ""}`;
    const source = new EventSource(url);
    eventSourceRef.current = source;

    source.onmessage = (e) => {
      appendLog(e.data, "stdout");
    };

    source.addEventListener("stderr", ((e: MessageEvent) => {
      appendLog(e.data, "stderr");
    }) as EventListener);

    source.addEventListener("status", ((e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        appendLog(`[${data.state}] ${data.script}`, "status");
      } catch {
        appendLog(e.data, "status");
      }
    }) as EventListener);

    source.addEventListener("done", ((e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const ok = data.code === 0;
        setStatuses((prev) => ({ ...prev, [scriptId]: ok ? "success" : "error" }));
        appendLog(`--- ${scriptId} ${ok ? "completed successfully" : `exited with code ${data.code}`} ---`, "status");
      } catch {
        setStatuses((prev) => ({ ...prev, [scriptId]: "error" }));
      }
      setActiveScript(null);
      source.close();
      eventSourceRef.current = null;
    }) as EventListener);

    source.addEventListener("error", (() => {
      setStatuses((prev) => ({ ...prev, [scriptId]: "error" }));
      appendLog(`--- ${scriptId} connection error ---`, "status");
      setActiveScript(null);
      source.close();
      eventSourceRef.current = null;
    }) as EventListener);

    source.onerror = () => {
      // EventSource auto-reconnects on error; we want to close instead
      if (source.readyState === EventSource.CLOSED) {
        setActiveScript(null);
        eventSourceRef.current = null;
      }
    };
  }

  function stopScript() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (activeScript) {
      setStatuses((prev) => ({ ...prev, [activeScript]: "error" }));
      appendLog(`--- Aborted ${activeScript} ---`, "status");
    }
    setActiveScript(null);
  }

  const statusColor = (s: ScriptStatus) => {
    if (s === "running") return "bg-amber-400";
    if (s === "success") return "bg-emerald-400";
    if (s === "error") return "bg-red-400";
    return "bg-zinc-500";
  };

  const statusLabel = (s: ScriptStatus) => {
    if (s === "running") return "Running...";
    if (s === "success") return "Done";
    if (s === "error") return "Failed";
    return "Idle";
  };

  return (
    <div className="min-h-dvh bg-background p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-xs font-mono text-muted hover:text-foreground mb-4 inline-block"
        >
          &larr; Dashboard
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            Pipeline
          </h1>
          <div className="flex items-center gap-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
              <button
                onClick={() => setMode("dry-run")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  mode === "dry-run"
                    ? "bg-amber-500/15 text-amber-500"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Dry Run
              </button>
              <button
                onClick={() => setMode("live")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  mode === "live"
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Live
              </button>
            </div>

            {activeScript && (
              <button
                onClick={stopScript}
                className="px-3 py-1.5 text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20 rounded-md hover:bg-red-500/20 transition-colors cursor-pointer"
              >
                Stop
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted mt-1 font-mono">
          {mode === "dry-run"
            ? "Dry run mode — data is fetched and displayed but NOT inserted into the database"
            : "Live mode — data will be inserted into the candidates tables"}
        </p>
      </div>

      {/* Event Pipeline */}
      <h2 className="text-lg font-semibold tracking-tight mb-3">Event Pipeline</h2>
      <p className="text-xs text-muted font-mono mb-3">
        {mode === "dry-run"
          ? "Dry run mode — events are fetched and displayed but NOT inserted into the database"
          : "Live mode — events will be inserted into the candidates table"}
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {GATHERERS.map((g) => {
          const status = statuses[g.id] || "idle";
          const isRunning = activeScript === g.id;

          return (
            <div
              key={g.id}
              className={`p-4 rounded-xl bg-card border transition-all duration-150 ${
                isRunning
                  ? "border-amber-500/40 shadow-sm shadow-amber-500/10"
                  : "border-border hover:border-border/80"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {g.name}
                  </h3>
                  <p className="text-[11px] text-muted font-mono mt-0.5">
                    {g.desc}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${statusColor(status)} ${
                      isRunning ? "animate-pulse" : ""
                    }`}
                  />
                  <span className="text-[10px] font-mono text-muted">
                    {statusLabel(status)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => runScript(g.id)}
                disabled={!!activeScript}
                className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                  hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {isRunning ? "Running..." : "Run"}
              </button>
            </div>
          );
        })}

        {/* Evaluate card */}
        <div
          className={`p-4 rounded-xl border transition-all duration-150 col-span-2 lg:col-span-3 ${
            activeScript === "evaluate"
              ? "bg-violet-500/5 border-violet-500/40 shadow-sm shadow-violet-500/10"
              : "bg-card border-border hover:border-border/80"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                AI Evaluator
              </h3>
              <p className="text-[11px] text-muted font-mono mt-0.5">
                Claude scrapes, scores, and auto-promotes or rejects candidates
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${statusColor(
                  statuses["evaluate"] || "idle"
                )} ${activeScript === "evaluate" ? "animate-pulse" : ""}`}
              />
              <span className="text-[10px] font-mono text-muted">
                {statusLabel(statuses["evaluate"] || "idle")}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste an event URL to test a single evaluation..."
              value={evalUrl}
              onChange={(e) => setEvalUrl(e.target.value)}
              className="flex-1 px-3 py-2 text-xs bg-background border border-border rounded-md
                placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
            <button
              onClick={() => {
                if (!evalUrl.trim()) return;
                runScript("evaluate", `&url=${encodeURIComponent(evalUrl.trim())}`);
              }}
              disabled={!!activeScript || !evalUrl.trim()}
              className="px-4 py-2 text-xs font-medium bg-violet-500 text-white rounded-md
                hover:bg-violet-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              Test Single
            </button>
            <button
              onClick={() => runScript("evaluate")}
              disabled={!!activeScript}
              className="px-4 py-2 text-xs font-medium bg-foreground text-background rounded-md
                hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {activeScript === "evaluate" ? "Running..." : "Evaluate All"}
            </button>
          </div>
        </div>

        {/* Run All card */}
        <div
          className={`p-4 rounded-xl border transition-all duration-150 ${
            activeScript === "sync-all"
              ? "bg-amber-500/5 border-amber-500/40 shadow-sm shadow-amber-500/10"
              : "bg-card border-border hover:border-border/80"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Run All
              </h3>
              <p className="text-[11px] text-muted font-mono mt-0.5">
                Full pipeline orchestrator
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${statusColor(
                  statuses["sync-all"] || "idle"
                )} ${activeScript === "sync-all" ? "animate-pulse" : ""}`}
              />
              <span className="text-[10px] font-mono text-muted">
                {statusLabel(statuses["sync-all"] || "idle")}
              </span>
            </div>
          </div>
          <button
            onClick={() => runScript("sync-all")}
            disabled={!!activeScript}
            className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
              hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            {activeScript === "sync-all" ? "Running..." : "Run All Gatherers"}
          </button>
        </div>
      </div>

      {/* Community Pipeline */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight mb-3">Community Pipeline</h2>
        <p className="text-xs text-muted font-mono mb-3">
          {mode === "dry-run"
            ? "Dry run mode — communities are fetched and displayed but NOT inserted into the database"
            : "Live mode — communities will be inserted into the candidates table"}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Sync Communities (gatherer) */}
          <div
            className={`p-4 rounded-xl border transition-all duration-150 ${
              activeScript === "sync-communities"
                ? "bg-card border-amber-500/40 shadow-sm shadow-amber-500/10"
                : "bg-card border-border hover:border-border/80"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Sync Communities</h3>
                <p className="text-[11px] text-muted font-mono mt-0.5">
                  EA Forum, LessWrong, PauseAI, AISafety.com
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${statusColor(statuses["sync-communities"] || "idle")} ${
                    activeScript === "sync-communities" ? "animate-pulse" : ""
                  }`}
                />
                <span className="text-[10px] font-mono text-muted">
                  {statusLabel(statuses["sync-communities"] || "idle")}
                </span>
              </div>
            </div>
            <button
              onClick={() => runScript("sync-communities")}
              disabled={!!activeScript}
              className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              {activeScript === "sync-communities" ? "Running..." : "Run"}
            </button>
          </div>

          {/* Run All Communities */}
          <div
            className={`p-4 rounded-xl border transition-all duration-150 ${
              activeScript === "sync-all-communities"
                ? "bg-amber-500/5 border-amber-500/40 shadow-sm shadow-amber-500/10"
                : "bg-card border-border hover:border-border/80"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Run All</h3>
                <p className="text-[11px] text-muted font-mono mt-0.5">
                  Full community pipeline
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${statusColor(statuses["sync-all-communities"] || "idle")} ${
                    activeScript === "sync-all-communities" ? "animate-pulse" : ""
                  }`}
                />
                <span className="text-[10px] font-mono text-muted">
                  {statusLabel(statuses["sync-all-communities"] || "idle")}
                </span>
              </div>
            </div>
            <button
              onClick={() => runScript("sync-all-communities")}
              disabled={!!activeScript}
              className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              {activeScript === "sync-all-communities" ? "Running..." : "Run Full Pipeline"}
            </button>
          </div>

          {/* Community AI Evaluator */}
          <div
            className={`p-4 rounded-xl border transition-all duration-150 col-span-2 lg:col-span-3 ${
              activeScript === "evaluate-community"
                ? "bg-violet-500/5 border-violet-500/40 shadow-sm shadow-violet-500/10"
                : "bg-card border-border hover:border-border/80"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Community AI Evaluator</h3>
                <p className="text-[11px] text-muted font-mono mt-0.5">
                  Claude evaluates, scores, and auto-promotes or rejects community candidates
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${statusColor(statuses["evaluate-community"] || "idle")} ${
                    activeScript === "evaluate-community" ? "animate-pulse" : ""
                  }`}
                />
                <span className="text-[10px] font-mono text-muted">
                  {statusLabel(statuses["evaluate-community"] || "idle")}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste a community URL to test a single evaluation..."
                value={communityEvalUrl}
                onChange={(e) => setCommunityEvalUrl(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-background border border-border rounded-md
                  placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={() => {
                  if (!communityEvalUrl.trim()) return;
                  runScript("evaluate-community", `&url=${encodeURIComponent(communityEvalUrl.trim())}`);
                }}
                disabled={!!activeScript || !communityEvalUrl.trim()}
                className="px-4 py-2 text-xs font-medium bg-violet-500 text-white rounded-md
                  hover:bg-violet-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                Test Single
              </button>
              <button
                onClick={() => runScript("evaluate-community")}
                disabled={!!activeScript}
                className="px-4 py-2 text-xs font-medium bg-foreground text-background rounded-md
                  hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                {activeScript === "evaluate-community" ? "Running..." : "Evaluate All"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Log viewer */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
          <span className="text-xs font-mono text-zinc-400">
            Output
            {logs.length > 0 && (
              <span className="ml-2 text-zinc-600">
                {logs.length} lines
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {!autoScroll && (
              <button
                onClick={() => {
                  setAutoScroll(true);
                  if (logRef.current) {
                    logRef.current.scrollTop = logRef.current.scrollHeight;
                  }
                }}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Scroll to bottom
              </button>
            )}
            <button
              onClick={() => setLogs([])}
              className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
        <div
          ref={logRef}
          onScroll={handleLogScroll}
          className="bg-zinc-950 p-4 h-[500px] overflow-y-auto font-mono text-xs leading-relaxed"
        >
          {logs.length === 0 ? (
            <div className="text-zinc-600 text-center py-20">
              Run a gatherer to see output here.
            </div>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-zinc-600 select-none shrink-0">
                  {entry.time}
                </span>
                <span
                  className={
                    entry.type === "stderr"
                      ? "text-amber-400"
                      : entry.type === "status"
                        ? "text-emerald-400"
                        : "text-zinc-300"
                  }
                >
                  {entry.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

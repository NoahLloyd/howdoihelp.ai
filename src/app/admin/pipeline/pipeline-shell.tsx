"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";

type ScriptStatus = "idle" | "running" | "success" | "error";
type LogEntry = { time: string; text: string; type: "stdout" | "stderr" | "status" };

export interface PipelineContext {
  mode: "dry-run" | "live";
  activeScript: string | null;
  statuses: Record<string, ScriptStatus>;
  runScript: (scriptId: string, extraParams?: string) => void;
  statusColor: (s: ScriptStatus) => string;
  statusLabel: (s: ScriptStatus) => string;
}

// Scripts that call the Anthropic API and consume credits
const EXPENSIVE_SCRIPTS: Record<string, string> = {
  evaluate:
    "This will evaluate ALL pending event candidates using the Anthropic API. This can consume significant API credits.",
  "sync-all":
    "This will gather events AND evaluate all pending candidates using the Anthropic API. This can consume significant API credits.",
  "evaluate-community":
    "This will evaluate ALL pending community candidates using the Anthropic API. This can consume significant API credits.",
  "sync-all-communities":
    "This will gather communities AND evaluate all pending candidates using the Anthropic API. This can consume significant API credits.",
};

export function PipelineShell({
  title,
  children,
}: {
  title: string;
  children: (ctx: PipelineContext) => ReactNode;
}) {
  const [mode, setMode] = useState<"dry-run" | "live">("dry-run");
  const [activeScript, setActiveScript] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ScriptStatus>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);

  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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

  function runScript(scriptId: string, extraParams?: string) {
    if (activeScript) return;

    const isSingleEval = extraParams?.includes("url=");
    if (EXPENSIVE_SCRIPTS[scriptId] && !isSingleEval) {
      if (
        !window.confirm(
          `${EXPENSIVE_SCRIPTS[scriptId]}\n\nAre you sure you want to continue?`
        )
      ) {
        return;
      }
    }

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

    source.addEventListener(
      "stderr",
      ((e: MessageEvent) => {
        appendLog(e.data, "stderr");
      }) as EventListener
    );

    source.addEventListener(
      "status",
      ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          appendLog(`[${data.state}] ${data.script}`, "status");
        } catch {
          appendLog(e.data, "status");
        }
      }) as EventListener
    );

    source.addEventListener(
      "done",
      ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const ok = data.code === 0;
          setStatuses((prev) => ({
            ...prev,
            [scriptId]: ok ? "success" : "error",
          }));
          appendLog(
            `--- ${scriptId} ${ok ? "completed successfully" : `exited with code ${data.code}`} ---`,
            "status"
          );
        } catch {
          setStatuses((prev) => ({ ...prev, [scriptId]: "error" }));
        }
        setActiveScript(null);
        source.close();
        eventSourceRef.current = null;
      }) as EventListener
    );

    source.addEventListener(
      "error",
      (() => {
        setStatuses((prev) => ({ ...prev, [scriptId]: "error" }));
        appendLog(`--- ${scriptId} connection error ---`, "status");
        setActiveScript(null);
        source.close();
        eventSourceRef.current = null;
      }) as EventListener
    );

    source.onerror = () => {
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

  const ctx: PipelineContext = {
    mode,
    activeScript,
    statuses,
    runScript,
    statusColor,
    statusLabel,
  };

  return (
    <div className="min-h-dvh bg-background p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/pipeline"
          className="text-xs font-mono text-muted hover:text-foreground mb-4 inline-block"
        >
          &larr; All Pipelines
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-4">
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

      {/* Pipeline-specific content */}
      {children(ctx)}

      {/* Log viewer */}
      <div className="rounded-xl border border-border overflow-hidden mt-6">
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
          <span className="text-xs font-mono text-zinc-400">
            Output
            {logs.length > 0 && (
              <span className="ml-2 text-zinc-600">{logs.length} lines</span>
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

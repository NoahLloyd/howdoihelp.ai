"use client";

import { useState } from "react";
import Link from "next/link";
import { PipelineShell } from "../pipeline-shell";

const EVAL_MODELS = [
  { id: "", label: "Default (Haiku 4.5)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-5-20250514", label: "Claude Sonnet 4.5" },
] as const;

const GATHERERS = [
  { id: "gather-aisafety", name: "AISafety.com", desc: "Airtable shared view" },
  { id: "gather-ea-lesswrong", name: "EA Forum + LessWrong", desc: "GraphQL API" },
  { id: "gather-eventbrite", name: "Eventbrite", desc: "Search + scrape" },
  { id: "gather-luma", name: "Luma", desc: "Calendar API + discover" },
  { id: "gather-meetup", name: "Meetup.com", desc: "Search + JSON-LD" },
] as const;

export default function EventsPipelinePage() {
  const [evalUrl, setEvalUrl] = useState("");
  const [evalModel, setEvalModel] = useState("");

  return (
    <PipelineShell title="Event Pipeline">
      {(ctx) => (
        <>
          <p className="text-xs text-muted font-mono mb-3">
            {ctx.mode === "dry-run"
              ? "Dry run mode: events are fetched and displayed but NOT inserted into the database"
              : "Live mode: events will be inserted into the candidates table"}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {GATHERERS.map((g) => {
              const status = ctx.statuses[g.id] || "idle";
              const isRunning = ctx.activeScript === g.id;

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
                        className={`w-2 h-2 rounded-full ${ctx.statusColor(status)} ${
                          isRunning ? "animate-pulse" : ""
                        }`}
                      />
                      <span className="text-[10px] font-mono text-muted">
                        {ctx.statusLabel(status)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => ctx.runScript(g.id)}
                    disabled={!!ctx.activeScript}
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
                ctx.activeScript === "evaluate"
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
                <div className="flex items-center gap-3">
                  <Link
                    href="/admin/prompt-tester?tab=evaluate-event"
                    className="text-[10px] font-mono text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Edit prompt
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-2 h-2 rounded-full ${ctx.statusColor(
                        ctx.statuses["evaluate"] || "idle"
                      )} ${ctx.activeScript === "evaluate" ? "animate-pulse" : ""}`}
                    />
                    <span className="text-[10px] font-mono text-muted">
                      {ctx.statusLabel(ctx.statuses["evaluate"] || "idle")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Paste an event URL to test a single evaluation..."
                  value={evalUrl}
                  onChange={(e) => setEvalUrl(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs bg-background border border-border rounded-md
                    placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
                <select
                  value={evalModel}
                  onChange={(e) => setEvalModel(e.target.value)}
                  className="px-2 py-2 text-xs bg-background border border-border rounded-md
                    text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
                >
                  {EVAL_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!evalUrl.trim()) return;
                    const modelParam = evalModel ? `&model=${encodeURIComponent(evalModel)}` : "";
                    ctx.runScript("evaluate", `&url=${encodeURIComponent(evalUrl.trim())}${modelParam}`);
                  }}
                  disabled={!!ctx.activeScript || !evalUrl.trim()}
                  className="px-4 py-2 text-xs font-medium bg-violet-500 text-white rounded-md
                    hover:bg-violet-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  Test Single
                </button>
                <button
                  onClick={() => {
                    const modelParam = evalModel ? `&model=${encodeURIComponent(evalModel)}` : "";
                    ctx.runScript("evaluate", modelParam || undefined);
                  }}
                  disabled={!!ctx.activeScript}
                  className="px-4 py-2 text-xs font-medium bg-foreground text-background rounded-md
                    hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  {ctx.activeScript === "evaluate" ? "Running..." : "Evaluate All"}
                </button>
              </div>
            </div>

            {/* Run All card */}
            <div
              className={`p-4 rounded-xl border transition-all duration-150 ${
                ctx.activeScript === "sync-all"
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
                    className={`w-2 h-2 rounded-full ${ctx.statusColor(
                      ctx.statuses["sync-all"] || "idle"
                    )} ${ctx.activeScript === "sync-all" ? "animate-pulse" : ""}`}
                  />
                  <span className="text-[10px] font-mono text-muted">
                    {ctx.statusLabel(ctx.statuses["sync-all"] || "idle")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => ctx.runScript("sync-all")}
                disabled={!!ctx.activeScript}
                className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                  hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {ctx.activeScript === "sync-all" ? "Running..." : "Run All Gatherers"}
              </button>
            </div>
          </div>
        </>
      )}
    </PipelineShell>
  );
}

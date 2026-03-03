"use client";

import { useState } from "react";
import { PipelineShell } from "../pipeline-shell";

export default function CommunitiesPipelinePage() {
  const [communityEvalUrl, setCommunityEvalUrl] = useState("");

  return (
    <PipelineShell title="Community Pipeline">
      {(ctx) => (
        <>
          <p className="text-xs text-muted font-mono mb-3">
            {ctx.mode === "dry-run"
              ? "Dry run mode — communities are fetched and displayed but NOT inserted into the database"
              : "Live mode — communities will be inserted into the candidates table"}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Sync Communities (gatherer) */}
            <div
              className={`p-4 rounded-xl border transition-all duration-150 ${
                ctx.activeScript === "sync-communities"
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
                    className={`w-2 h-2 rounded-full ${ctx.statusColor(ctx.statuses["sync-communities"] || "idle")} ${
                      ctx.activeScript === "sync-communities" ? "animate-pulse" : ""
                    }`}
                  />
                  <span className="text-[10px] font-mono text-muted">
                    {ctx.statusLabel(ctx.statuses["sync-communities"] || "idle")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => ctx.runScript("sync-communities")}
                disabled={!!ctx.activeScript}
                className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                  hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {ctx.activeScript === "sync-communities" ? "Running..." : "Run"}
              </button>
            </div>

            {/* Run All Communities */}
            <div
              className={`p-4 rounded-xl border transition-all duration-150 ${
                ctx.activeScript === "sync-all-communities"
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
                    className={`w-2 h-2 rounded-full ${ctx.statusColor(ctx.statuses["sync-all-communities"] || "idle")} ${
                      ctx.activeScript === "sync-all-communities" ? "animate-pulse" : ""
                    }`}
                  />
                  <span className="text-[10px] font-mono text-muted">
                    {ctx.statusLabel(ctx.statuses["sync-all-communities"] || "idle")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => ctx.runScript("sync-all-communities")}
                disabled={!!ctx.activeScript}
                className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                  hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {ctx.activeScript === "sync-all-communities" ? "Running..." : "Run Full Pipeline"}
              </button>
            </div>

            {/* Community AI Evaluator */}
            <div
              className={`p-4 rounded-xl border transition-all duration-150 col-span-2 lg:col-span-3 ${
                ctx.activeScript === "evaluate-community"
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
                    className={`w-2 h-2 rounded-full ${ctx.statusColor(ctx.statuses["evaluate-community"] || "idle")} ${
                      ctx.activeScript === "evaluate-community" ? "animate-pulse" : ""
                    }`}
                  />
                  <span className="text-[10px] font-mono text-muted">
                    {ctx.statusLabel(ctx.statuses["evaluate-community"] || "idle")}
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
                    ctx.runScript("evaluate-community", `&url=${encodeURIComponent(communityEvalUrl.trim())}`);
                  }}
                  disabled={!!ctx.activeScript || !communityEvalUrl.trim()}
                  className="px-4 py-2 text-xs font-medium bg-violet-500 text-white rounded-md
                    hover:bg-violet-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  Test Single
                </button>
                <button
                  onClick={() => ctx.runScript("evaluate-community")}
                  disabled={!!ctx.activeScript}
                  className="px-4 py-2 text-xs font-medium bg-foreground text-background rounded-md
                    hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  {ctx.activeScript === "evaluate-community" ? "Running..." : "Evaluate All"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </PipelineShell>
  );
}

"use client";

import { PipelineShell } from "../pipeline-shell";

export default function ProgramsPipelinePage() {
  return (
    <PipelineShell title="Programs Pipeline">
      {(ctx) => (
        <>
          <p className="text-xs text-muted font-mono mb-3">
            {ctx.mode === "dry-run"
              ? "Dry run mode — programs are fetched and displayed but NOT inserted into the database"
              : "Live mode — programs will be inserted into the candidates table"}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {/* BlueDot Gatherer */}
            <div
              className={`p-4 rounded-xl border transition-all duration-150 ${
                ctx.activeScript === "gather-bluedot"
                  ? "bg-card border-amber-500/40 shadow-sm shadow-amber-500/10"
                  : "bg-card border-border hover:border-border/80"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">BlueDot Impact</h3>
                  <p className="text-[11px] text-muted font-mono mt-0.5">
                    tRPC API — courses + rounds
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${ctx.statusColor(ctx.statuses["gather-bluedot"] || "idle")} ${
                      ctx.activeScript === "gather-bluedot" ? "animate-pulse" : ""
                    }`}
                  />
                  <span className="text-[10px] font-mono text-muted">
                    {ctx.statusLabel(ctx.statuses["gather-bluedot"] || "idle")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => ctx.runScript("gather-bluedot")}
                disabled={!!ctx.activeScript}
                className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                  hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {ctx.activeScript === "gather-bluedot" ? "Running..." : "Run"}
              </button>
            </div>

            {/* AISafety.com Gatherer (Programs) */}
            <div
              className={`p-4 rounded-xl border transition-all duration-150 ${
                ctx.activeScript === "gather-aisafety-programs"
                  ? "bg-card border-amber-500/40 shadow-sm shadow-amber-500/10"
                  : "bg-card border-border hover:border-border/80"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">AISafety.com</h3>
                  <p className="text-[11px] text-muted font-mono mt-0.5">
                    Airtable — fellowships, bootcamps, courses
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${ctx.statusColor(ctx.statuses["gather-aisafety-programs"] || "idle")} ${
                      ctx.activeScript === "gather-aisafety-programs" ? "animate-pulse" : ""
                    }`}
                  />
                  <span className="text-[10px] font-mono text-muted">
                    {ctx.statusLabel(ctx.statuses["gather-aisafety-programs"] || "idle")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => ctx.runScript("gather-aisafety-programs")}
                disabled={!!ctx.activeScript}
                className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                  hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {ctx.activeScript === "gather-aisafety-programs" ? "Running..." : "Run"}
              </button>
            </div>

            {/* Run All Programs */}
            <div
              className={`p-4 rounded-xl border transition-all duration-150 ${
                ctx.activeScript === "sync-programs"
                  ? "bg-amber-500/5 border-amber-500/40 shadow-sm shadow-amber-500/10"
                  : "bg-card border-border hover:border-border/80"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Run All</h3>
                  <p className="text-[11px] text-muted font-mono mt-0.5">
                    Full programs pipeline
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${ctx.statusColor(ctx.statuses["sync-programs"] || "idle")} ${
                      ctx.activeScript === "sync-programs" ? "animate-pulse" : ""
                    }`}
                  />
                  <span className="text-[10px] font-mono text-muted">
                    {ctx.statusLabel(ctx.statuses["sync-programs"] || "idle")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => ctx.runScript("sync-programs")}
                disabled={!!ctx.activeScript}
                className="w-full px-3 py-2 text-xs font-medium bg-foreground text-background rounded-md
                  hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {ctx.activeScript === "sync-programs" ? "Running..." : "Run Full Pipeline"}
              </button>
            </div>
          </div>
        </>
      )}
    </PipelineShell>
  );
}

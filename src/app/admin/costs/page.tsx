"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { fetchApiUsageStats, type ApiUsageStats } from "../actions";

export default function CostsPage() {
  const [stats, setStats] = useState<ApiUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchApiUsageStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted text-sm">
          <div className="w-4 h-4 border-2 border-border border-t-muted-foreground rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">{error || "No data"}</p>
          <Link href="/admin" className="mt-4 inline-block text-sm text-accent hover:underline">
            Back to admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background px-6 py-10 max-w-4xl mx-auto">
      <header className="mb-8">
        <Link href="/admin" className="text-xs text-muted hover:text-muted-foreground transition-colors">
          &larr; Admin
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground tracking-tight">
          API Costs
        </h1>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard label="All time" value={`$${stats.totalCost.toFixed(4)}`} />
        <StatCard label="Last 7 days" value={`$${stats.last7DaysCost.toFixed(4)}`} />
        <StatCard label="Last 24h" value={`$${stats.last24hCost.toFixed(4)}`} />
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <StatCard label="Profile enrichments" value={String(stats.totalEnrichments)} />
        <StatCard label="Claude recommendations" value={String(stats.totalRecommendations)} />
      </div>

      {/* By provider */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <h2 className="text-base font-medium text-foreground mb-3">By Provider</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-muted text-xs">
                <th className="text-left px-4 py-2 font-medium">Provider</th>
                <th className="text-right px-4 py-2 font-medium">Calls</th>
                <th className="text-right px-4 py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {stats.byProvider.map((p) => (
                <tr key={p.provider} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-foreground">{p.provider}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{p.count}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground">
                    ${p.cost.toFixed(4)}
                  </td>
                </tr>
              ))}
              {stats.byProvider.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted italic">
                    No usage data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Claude breakdown */}
      {stats.claudeBreakdown.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-base font-medium text-foreground mb-3">Claude Usage</h2>

          {/* Claude summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="Total tokens"
              value={stats.claudeTotalTokens.toLocaleString()}
            />
            <StatCard
              label="Input tokens"
              value={stats.claudeTotalInputTokens.toLocaleString()}
            />
            <StatCard
              label="Output tokens"
              value={stats.claudeTotalOutputTokens.toLocaleString()}
            />
            <StatCard
              label="Avg cost/call"
              value={`$${stats.totalRecommendations > 0 ? (stats.totalCost / stats.totalRecommendations).toFixed(4) : "0.0000"}`}
            />
          </div>

          {/* Per-model table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card text-muted text-xs">
                  <th className="text-left px-4 py-2 font-medium">Model</th>
                  <th className="text-right px-4 py-2 font-medium">Calls</th>
                  <th className="text-right px-4 py-2 font-medium">Input tokens</th>
                  <th className="text-right px-4 py-2 font-medium">Output tokens</th>
                  <th className="text-right px-4 py-2 font-medium">Total cost</th>
                  <th className="text-right px-4 py-2 font-medium">Avg input/call</th>
                  <th className="text-right px-4 py-2 font-medium">Avg output/call</th>
                  <th className="text-right px-4 py-2 font-medium">Avg cost/call</th>
                </tr>
              </thead>
              <tbody>
                {stats.claudeBreakdown.map((c) => (
                  <tr key={c.model} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-foreground text-xs">{c.model}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{c.count}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground font-mono">
                      {c.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground font-mono">
                      {c.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">
                      ${c.cost.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                      {c.avgInputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                      {c.avgOutputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                      ${c.avgCostPerCall.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Recent entries */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-base font-medium text-foreground mb-3">Recent API Calls</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b border-border bg-card text-muted text-xs">
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Provider</th>
                  <th className="text-left px-4 py-2 font-medium">Endpoint</th>
                  <th className="text-right px-4 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentEntries.map((e, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2 font-mono text-foreground text-xs">{e.provider}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                      {e.model || e.endpoint || "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-foreground text-xs">
                      ${(e.estimated_cost_usd || 0).toFixed(4)}
                    </td>
                  </tr>
                ))}
                {stats.recentEntries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted italic">
                      No API calls recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      <div className="pb-8" />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-xl font-mono font-medium text-foreground">{value}</p>
    </div>
  );
}

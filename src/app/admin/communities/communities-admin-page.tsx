"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import type { Resource } from "@/types";
import {
  fetchResourcesByCategory,
  toggleResourceEnabled,
  saveResource,
  fetchCommunityCandidates,
  promoteCommunityCandidate,
  rejectCommunityCandidate,
  type CommunityCandidate,
} from "@/app/admin/actions";
import { ResourceEditor } from "@/components/admin/resource-editor";

const PAGE_SIZE = 50;

type Tab = "communities" | "candidates";

export function CommunitiesAdminPage() {
  const [tab, setTab] = useState<Tab>("communities");
  const [resources, setResources] = useState<Resource[]>([]);
  const [candidates, setCandidates] = useState<CommunityCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [sortField, setSortField] = useState<"title" | "activity" | "created">("title");
  const [candidateStatusFilter, setCandidateStatusFilter] = useState("all");

  // Pagination
  const [page, setPage] = useState(1);

  // Modals
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const loadResources = useCallback(async () => {
    try {
      const data = await fetchResourcesByCategory("communities");
      setResources(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    try {
      const data = await fetchCommunityCandidates();
      setCandidates(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadResources(), loadCandidates()]).finally(() => setLoading(false));
  }, [loadResources, loadCandidates]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ─── Actions ───

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await toggleResourceEnabled(id, enabled);
      setResources((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function handleSave(updated: Resource) {
    try {
      await saveResource(updated);
      setResources((prev) => {
        const exists = prev.find(r => r.id === updated.id);
        if (exists) return prev.map(r => r.id === updated.id ? updated : r);
        return [updated, ...prev];
      });
      setEditingResource(null);
      showToast("Saved successfully");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function handlePromote(id: string) {
    try {
      await promoteCommunityCandidate(id);
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, status: "promoted" } : c));
      showToast("Promoted to communities");
      loadResources();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function handleRejectCandidate(id: string) {
    try {
      await rejectCommunityCandidate(id);
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, status: "rejected" } : c));
      showToast("Candidate rejected");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  // ─── Derived State ───

  const sources = useMemo(() => Array.from(new Set(resources.map(r => r.source_org || "Unknown"))).sort(), [resources]);

  const filtered = useMemo(() => {
    let res = resources;

    if (search) {
      const q = search.toLowerCase();
      res = res.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.url || "").toLowerCase().includes(q)
      );
    }

    if (sourceFilter !== "all") {
      res = res.filter(r => (r.source_org || "Unknown") === sourceFilter);
    }

    if (statusFilter !== "all") {
      res = res.filter(r => r.url_status === statusFilter);
    }

    if (healthFilter === "active") {
      res = res.filter(r => (r.activity_score ?? 0.5) >= 0.2);
    } else if (healthFilter === "dead") {
      res = res.filter(r => (r.activity_score ?? 0.5) < 0.2);
    }

    res.sort((a, b) => {
      if (sortField === "title") return a.title.localeCompare(b.title);
      if (sortField === "activity") return (b.activity_score ?? 0.5) - (a.activity_score ?? 0.5);
      if (sortField === "created") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return 0;
    });

    return res;
  }, [resources, search, sourceFilter, statusFilter, healthFilter, sortField]);

  const filteredCandidates = useMemo(() => {
    let res = candidates;
    if (candidateStatusFilter !== "all") {
      res = res.filter(c => c.status === candidateStatusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(c =>
        c.title.toLowerCase().includes(q) ||
        (c.location || "").toLowerCase().includes(q) ||
        (c.source || "").toLowerCase().includes(q) ||
        (c.ai_clean_title || "").toLowerCase().includes(q)
      );
    }
    return res;
  }, [candidates, candidateStatusFilter, search]);

  const candidateCounts = useMemo(() => {
    const counts = { pending: 0, evaluated: 0, promoted: 0, rejected: 0 };
    for (const c of candidates) {
      if (c.status in counts) counts[c.status as keyof typeof counts]++;
    }
    return counts;
  }, [candidates]);

  // Pagination
  useEffect(() => { setPage(1); }, [search, sourceFilter, statusFilter, healthFilter, sortField, tab, candidateStatusFilter]);
  const currentListLength = tab === "communities" ? filtered.length : filteredCandidates.length;
  const totalPages = Math.ceil(currentListLength / PAGE_SIZE);
  const pagedResources = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedCandidates = filteredCandidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted font-mono text-sm">Loading communities vault...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background p-6 max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin" className="text-xs font-mono text-muted hover:text-foreground mb-4 inline-block">&larr; Dashboard</Link>
          <div className="flex items-end gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Communities Pipeline</h1>
          </div>
        </div>
        <button
          onClick={() => setEditingResource({
            id: `new-${Date.now()}`, title: "", description: "", url: "", source_org: "Other",
            category: "communities", location: "Global", min_minutes: 5, ev_general: 0.5, friction: 0.2,
            enabled: true, status: "approved", created_at: new Date().toISOString()
          })}
          className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity cursor-pointer"
        >
          + Add Community
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1 bg-muted/20 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("communities")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              tab === "communities" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Live Communities <span className="text-xs font-mono text-muted ml-1">{filtered.length}</span>
          </button>
          <button
            onClick={() => setTab("candidates")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              tab === "candidates" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Candidates
            {candidateCounts.pending + candidateCounts.evaluated > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-500 rounded-full font-mono">
                {candidateCounts.pending + candidateCounts.evaluated}
              </span>
            )}
          </button>
        </div>
        <Link
          href="/admin/pipeline"
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Pipeline &rarr;
        </Link>
      </div>

      {/* ═══ COMMUNITIES TAB ═══ */}
      {tab === "communities" && (
        <>
          <div className="bg-card border border-border rounded-xl p-4 mb-6 space-y-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                 <input
                   type="text"
                   placeholder="Search title, description, URL, location..."
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   className="w-full pl-3 pr-3 py-2 bg-background border border-border rounded-lg text-sm focus:border-accent outline-none"
                 />
              </div>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="py-2 px-3 bg-background border border-border rounded-lg text-sm">
                <option value="all">All Sources</option>
                {sources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="py-2 px-3 bg-background border border-border rounded-lg text-sm">
                <option value="all">All Health</option>
                <option value="active">Active (Score ≥0.2)</option>
                <option value="dead">Dead / Inactive (Score &lt;0.2)</option>
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="py-2 px-3 bg-background border border-border rounded-lg text-sm">
                <option value="all">Any HTTP Status</option>
                <option value="reachable">Reachable (200)</option>
                <option value="redirect">Redirects</option>
                <option value="dead">Dead / Blocked</option>
                <option value="unknown">Unknown</option>
              </select>
              <select value={sortField} onChange={(e) => setSortField(e.target.value as any)} className="py-2 px-3 bg-background border border-border rounded-lg text-sm">
                <option value="title">Sort: Title A-Z</option>
                <option value="activity">Sort: Highest Activity</option>
                <option value="created">Sort: Newest Added</option>
              </select>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted/30 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-medium">On</th>
                    <th className="px-4 py-3 font-medium">Community</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedResources.map(r => {
                    const isDeadUrl = r.url_status === "dead";
                    const isLowScore = (r.activity_score ?? 0.5) < 0.2;

                    return (
                      <tr key={r.id} onClick={() => setEditingResource(r)} className="hover:bg-muted/10 transition-colors cursor-pointer">
                        <td className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            onChange={(e) => handleToggle(r.id, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            className="accent-accent w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 min-w-[300px] max-w-[400px]">
                          <div className="truncate font-medium text-foreground">{r.title}</div>
                          <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-muted font-mono hover:text-accent truncate block mt-0.5">
                            {r.url?.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                        </td>
                        <td className="px-4 py-3 w-40">
                          <span className="text-xs bg-muted/30 px-2 py-1 rounded text-foreground">{r.location || "Global"}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted w-32">{r.source_org}</td>
                        <td className="px-4 py-3 w-32">
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center gap-1.5">
                               <span className={`w-1.5 h-1.5 rounded-full ${isDeadUrl ? 'bg-red-500' : r.url_status === 'reachable' ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                               <span className="capitalize">{r.url_status}</span>
                            </div>
                            <div className={`font-mono text-[10px] ${isLowScore ? 'text-red-500' : 'text-emerald-500'}`}>
                              Score: {(r.activity_score || 0).toFixed(2)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pagedResources.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted font-mono text-sm">
                        No communities found matching filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ CANDIDATES TAB ═══ */}
      {tab === "candidates" && (
        <>
          <div className="bg-card border border-border rounded-xl p-4 mb-6">
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search candidates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-3 pr-3 py-2 bg-background border border-border rounded-lg text-sm focus:border-accent outline-none"
                />
              </div>
              <select value={candidateStatusFilter} onChange={(e) => setCandidateStatusFilter(e.target.value)} className="py-2 px-3 bg-background border border-border rounded-lg text-sm">
                <option value="all">All Statuses ({candidates.length})</option>
                <option value="pending">Pending ({candidateCounts.pending})</option>
                <option value="evaluated">Needs Review ({candidateCounts.evaluated})</option>
                <option value="promoted">Promoted ({candidateCounts.promoted})</option>
                <option value="rejected">Rejected ({candidateCounts.rejected})</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {pagedCandidates.map(c => (
              <div key={c.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/5 transition-colors"
                  onClick={() => setExpandedCandidate(expandedCandidate === c.id ? null : c.id)}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    c.status === "pending" ? "bg-amber-400" :
                    c.status === "evaluated" ? "bg-blue-400" :
                    c.status === "promoted" ? "bg-emerald-400" : "bg-red-400"
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{c.ai_clean_title || c.title}</span>
                      {c.ai_community_type && (
                        <span className="text-[10px] bg-muted/40 px-1.5 py-0.5 rounded text-muted-foreground uppercase tracking-wide flex-shrink-0">{c.ai_community_type}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted">
                      <span className="font-mono">{c.source}</span>
                      {(c.ai_clean_location || c.location) && <span>{c.ai_clean_location || c.location}</span>}
                    </div>
                  </div>

                  {c.ai_relevance_score != null && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] font-mono text-muted">Relevance</div>
                        <div className={`text-sm font-mono font-semibold ${
                          c.ai_relevance_score >= 0.5 ? "text-emerald-500" :
                          c.ai_relevance_score >= 0.2 ? "text-amber-500" : "text-red-500"
                        }`}>
                          {c.ai_relevance_score.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-mono text-muted">Quality</div>
                        <div className="text-sm font-mono font-semibold text-foreground">
                          {(c.ai_quality_score || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  {(c.status === "pending" || c.status === "evaluated") && (
                    <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handlePromote(c.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-colors cursor-pointer"
                      >
                        Promote
                      </button>
                      <button
                        onClick={() => handleRejectCandidate(c.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20 rounded-md hover:bg-red-500/20 transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded flex-shrink-0 ${
                    c.status === "pending" ? "bg-amber-500/10 text-amber-500" :
                    c.status === "evaluated" ? "bg-blue-500/10 text-blue-500" :
                    c.status === "promoted" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                  }`}>
                    {c.status}
                  </span>
                </div>

                {expandedCandidate === c.id && (
                  <div className="px-5 pb-4 border-t border-border/50 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-muted font-mono block mb-1">URL</span>
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-accent hover:underline font-mono break-all">{c.url}</a>
                      </div>
                      <div>
                        <span className="text-muted font-mono block mb-1">Source</span>
                        <span>{c.source} {c.source_org ? `(${c.source_org})` : ""}</span>
                      </div>
                    </div>

                    {c.description && (
                      <div className="text-xs">
                        <span className="text-muted font-mono block mb-1">Original Description</span>
                        <p className="text-muted-foreground leading-relaxed">{c.description}</p>
                      </div>
                    )}

                    {c.ai_clean_description && (
                      <div className="text-xs">
                        <span className="text-muted font-mono block mb-1">AI Description</span>
                        <p className="text-foreground leading-relaxed">{c.ai_clean_description}</p>
                      </div>
                    )}

                    {c.ai_reasoning && (
                      <div className="text-xs bg-muted/10 rounded-lg p-3">
                        <span className="text-muted font-mono block mb-1">AI Reasoning</span>
                        <p className="text-muted-foreground leading-relaxed">{c.ai_reasoning}</p>
                      </div>
                    )}

                    {c.ai_suggested_ev != null && (
                      <div className="flex gap-6 text-xs font-mono">
                        <div><span className="text-muted">Suggested EV:</span> {c.ai_suggested_ev.toFixed(2)}</div>
                        <div><span className="text-muted">Suggested Friction:</span> {(c.ai_suggested_friction || 0).toFixed(2)}</div>
                        <div><span className="text-muted">Real Community:</span> {c.ai_is_real_community ? "Yes" : "No"}</div>
                        <div><span className="text-muted">Relevant:</span> {c.ai_is_relevant ? "Yes" : "No"}</div>
                        {c.ai_is_online != null && <div><span className="text-muted">Online:</span> {c.ai_is_online ? "Yes" : "No"}</div>}
                      </div>
                    )}

                    {c.duplicate_of && (
                      <div className="text-xs font-mono text-amber-500">Duplicate of: {c.duplicate_of}</div>
                    )}

                    {c.processed_at && (
                      <div className="text-[10px] text-muted font-mono">
                        Evaluated: {new Date(c.processed_at).toLocaleString()}
                        {c.submitted_by && <> &middot; Submitted by: {c.submitted_by}</>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {filteredCandidates.length === 0 && (
              <div className="bg-card border border-border rounded-xl px-6 py-12 text-center text-muted font-mono text-sm">
                No candidates found. Run the community pipeline to gather new communities.
              </div>
            )}
          </div>
        </>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="mt-4 px-4 py-3 bg-card border border-border rounded-xl flex items-center justify-between text-[11px] font-mono">
          <div className="text-muted">
            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, currentListLength)} of {currentListLength}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-border bg-card rounded disabled:opacity-50 hover:bg-muted/40 cursor-pointer"
            >
              PREV
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-border bg-card rounded disabled:opacity-50 hover:bg-muted/40 cursor-pointer"
            >
              NEXT
            </button>
          </div>
        </div>
      )}

      {editingResource && (
        <ResourceEditor
          resource={editingResource}
          isNew={editingResource.id.startsWith("new-")}
          onSave={handleSave}
          onArchive={async (id) => {
              try {
                if (editingResource) {
                   const updated = { ...editingResource, enabled: false, status: "rejected" as const };
                   await saveResource(updated);
                   setResources(prev => prev.map(r => r.id === id ? updated : r));
                   setEditingResource(null);
                   showToast("Archived successfully");
                }
              } catch(err) {
                showToast(err instanceof Error ? err.message : "Failed to archive", "error");
              }
          }}
          onCancel={() => setEditingResource(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { Resource, ResourceCategory } from "@/types";
import {
  fetchResourcesByCategory,
  toggleResourceEnabled,
  saveResource,
  deleteResource,
  approveResource,
  rejectResource,
} from "@/app/admin/actions";
import { CATEGORIES } from "@/lib/categories";
import { ResourceEditor } from "@/components/admin/resource-editor";
import { DeleteModal } from "@/components/admin/delete-modal";
import { AdminCategorySkeleton } from "@/components/ui/skeletons";

interface CategoryPageProps {
  categoryId: ResourceCategory;
}

export function CategoryPage({ categoryId }: CategoryPageProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const catMeta = CATEGORIES.find((c) => c.id === categoryId)!;

  const loadResources = useCallback(async () => {
    try {
      const data = await fetchResourcesByCategory(categoryId);
      setResources(data);
    } catch {
      // silent on load
    }
    setLoading(false);
  }, [categoryId]);

  useEffect(() => { loadResources(); }, [loadResources]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await toggleResourceEnabled(id, enabled);
      setResources((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
      showToast(enabled ? "Enabled" : "Disabled");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function handleSave(resource: Resource) {
    try {
      await saveResource(resource);
      showToast(isCreating ? "Created" : "Saved");
      setEditingResource(null);
      setIsCreating(false);
      await loadResources();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function confirmDelete() {
    if (!deletingResource) return;
    setIsDeleting(true);
    try {
      await deleteResource(deletingResource.id);
      setResources((prev) => prev.filter((r) => r.id !== deletingResource.id));
      showToast("Deleted");
      setDeletingResource(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
    setIsDeleting(false);
  }

  async function handleApprove(id: string) {
    try {
      await approveResource(id);
      setResources((prev) => prev.map((r) => (r.id === id ? { ...r, status: "approved" as const, enabled: true } : r)));
      showToast("Approved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectResource(id);
      setResources((prev) => prev.map((r) => (r.id === id ? { ...r, status: "rejected" as const, enabled: false } : r)));
      showToast("Rejected");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  function handleCreate() {
    const now = new Date().toISOString();
    setEditingResource({
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: "", description: "", url: "", source_org: "",
      category: categoryId,
      location: "Global",
      min_minutes: 5,
      ev_general: 0.5, friction: 0.2,
      enabled: true,
      status: "approved",
      created_at: now,
    });
    setIsCreating(true);
  }

  if (loading) {
    return <AdminCategorySkeleton />;
  }

  const pending = resources.filter((r) => r.status === "pending");
  const approved = resources.filter((r) => r.status === "approved");
  const rejected = resources.filter((r) => r.status === "rejected");

  return (
    <div className="min-h-dvh bg-background px-6 py-8 max-w-4xl mx-auto">
      <Link
        href="/admin"
        className="inline-block text-xs text-muted hover:text-muted-foreground transition-colors mb-6 font-mono"
      >
        ← Back to dashboard
      </Link>

      <header className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <span className="text-3xl">{catMeta.icon}</span>
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">{catMeta.label}</h1>
            <p className="text-xs text-muted mt-0.5">{catMeta.description}</p>
          </div>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-90 transition-opacity cursor-pointer"
          onClick={handleCreate}
        >
          <span className="text-base leading-none">+</span>
          Add
        </button>
      </header>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-6 text-xs font-mono">
        <span className="text-emerald-500">{approved.length} approved</span>
        {pending.length > 0 && <span className="text-amber-500">{pending.length} pending</span>}
        {rejected.length > 0 && <span className="text-muted">{rejected.length} rejected</span>}
      </div>

      {/* Pending submissions */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-amber-500 mb-3">
            Pending Submissions
          </h2>
          <div className="flex flex-col gap-1">
            {pending.map((resource) => (
              <div
                key={resource.id}
                className="flex items-center justify-between p-4 rounded-lg bg-amber-500/5 border border-amber-500/20"
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => { setEditingResource(resource); setIsCreating(false); }}
                >
                  <h3 className="text-sm font-medium text-foreground mb-0.5">{resource.title}</h3>
                  <p className="text-xs text-muted line-clamp-1">{resource.description}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-muted">
                    <span>{resource.source_org || "-"}</span>
                    <span className="text-border">·</span>
                    <span>{resource.location}</span>
                    {resource.submitted_by && (
                      <>
                        <span className="text-border">·</span>
                        <span>by {resource.submitted_by}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 ml-3">
                  <button
                    onClick={() => handleApprove(resource.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md hover:bg-emerald-500/20 transition-colors cursor-pointer"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(resource.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-md hover:bg-rose-500/20 transition-colors cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setDeletingResource(resource)}
                    className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-rose-500/15 hover:text-rose-500 transition-colors text-sm cursor-pointer"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved list */}
      <div className="flex flex-col gap-0.5">
        <AnimatePresence>
          {approved.map((resource, i) => (
            <motion.div
              key={resource.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, delay: i * 0.02 }}
              className={`flex items-center justify-between p-4 rounded-lg bg-card hover:bg-card-hover transition-colors group
                ${!resource.enabled ? "opacity-40 hover:opacity-70" : ""}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button
                  onClick={() => handleToggle(resource.id, !resource.enabled)}
                  className={`relative w-8 h-[18px] rounded-full shrink-0 transition-colors cursor-pointer
                    ${resource.enabled ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"}`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-[left] duration-200
                      ${resource.enabled ? "left-[16px]" : "left-0.5"}`}
                  />
                </button>

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => { setEditingResource(resource); setIsCreating(false); }}
                >
                  <h3 className="text-sm font-medium text-foreground mb-0.5">{resource.title}</h3>
                  <p className="text-xs text-muted line-clamp-1 mb-1">{resource.description}</p>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted">
                    <span>{resource.source_org}</span>
                    <span className="text-border">·</span>
                    <span>{resource.location}</span>
                    {resource.event_date && (
                      <>
                        <span className="text-border">·</span>
                        <span>{new Date(resource.event_date).toLocaleDateString()}</span>
                      </>
                    )}
                    {resource.deadline_date && (
                      <>
                        <span className="text-border">·</span>
                        <span>Due {new Date(resource.deadline_date).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-border/50 hover:text-foreground transition-colors text-sm"
                >
                  ↗
                </a>
                <button
                  onClick={() => { setEditingResource(resource); setIsCreating(false); }}
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-border/50 hover:text-foreground transition-colors text-sm cursor-pointer"
                >
                  ✎
                </button>
                <button
                  onClick={() => setDeletingResource(resource)}
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-rose-500/15 hover:text-rose-500 transition-colors text-sm cursor-pointer"
                >
                  ×
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {approved.length === 0 && pending.length === 0 && (
          <div className="py-16 text-center text-muted text-sm italic">
            No {catMeta.label.toLowerCase()} yet. Click &quot;+ Add&quot; to create one.
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingResource && (
          <ResourceEditor
            resource={editingResource}
            isNew={isCreating}
            onSave={handleSave}
            onCancel={() => { setEditingResource(null); setIsCreating(false); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingResource && (
          <DeleteModal
            title={deletingResource.title}
            isDeleting={isDeleting}
            onConfirm={confirmDelete}
            onCancel={() => setDeletingResource(null)}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-sm font-medium z-50 shadow-lg border
              ${toast.type === "success"
                ? "bg-card text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-card text-rose-600 dark:text-rose-400 border-rose-500/20"
              }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

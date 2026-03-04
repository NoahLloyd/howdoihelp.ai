"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { Resource } from "@/types";
import { fetchAllResources, toggleResourceEnabled, saveResource, deleteResource } from "./actions";
import { CATEGORIES, groupByCategory } from "@/lib/categories";
import { ResourceEditor } from "@/components/admin/resource-editor";
import { DeleteModal } from "@/components/admin/delete-modal";

export default function AdminHub() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const loadResources = useCallback(async () => {
    try {
      const data = await fetchAllResources();
      setResources(data);
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadResources(); }, [loadResources]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await toggleResourceEnabled(id, enabled);
      setResources((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
      showToast(`${enabled ? "Enabled" : "Disabled"}`);
    } catch (err) {
      showToast(`Failed: ${err instanceof Error ? err.message : "Unknown"}`, "error");
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
      showToast(`Failed: ${err instanceof Error ? err.message : "Unknown"}`, "error");
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
      showToast(`Failed: ${err instanceof Error ? err.message : "Unknown"}`, "error");
    }
    setIsDeleting(false);
  }

  const groups = groupByCategory(resources);
  const totalEnabled = resources.filter((r) => r.enabled).length;
  const totalPending = resources.filter((r) => r.status === "pending").length;

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted text-sm tracking-wide">
          <div className="w-4 h-4 border-2 border-border border-t-muted-foreground rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background px-6 py-10 max-w-4xl mx-auto">
      {/* Header */}
      <header className="mb-10">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          howdoihelp.ai
        </h1>
        <p className="text-sm text-muted mt-1 font-mono">
          {totalEnabled} enabled · {resources.length} total
          {totalPending > 0 && (
            <span className="text-amber-500"> · {totalPending} pending review</span>
          )}
        </p>
        <div className="flex gap-4 mt-3">
          <Link
            href="/admin/costs"
            className="inline-block text-xs text-accent hover:underline"
          >
            View API costs →
          </Link>
          <Link
            href="/admin/prompt-tester"
            className="inline-block text-xs text-accent hover:underline"
          >
            Prompt tester →
          </Link>
        </div>
      </header>

      {/* Category cards */}
      <div className="grid grid-cols-2 gap-3 mb-12">
        {CATEGORIES.map((cat, i) => {
          const items = groups[cat.id] || [];
          const enabled = items.filter((r: Resource) => r.enabled).length;
          const pending = items.filter((r: Resource) => r.status === "pending").length;

          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={cat.adminHref}
                className="group block p-5 rounded-xl bg-card border border-border
                  hover:bg-card-hover hover:border-border/80 transition-all duration-150"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl leading-none">{cat.icon}</span>
                  <span className="text-xl font-mono font-medium text-foreground">
                    {items.length}
                  </span>
                </div>
                <h2 className="text-sm font-medium text-foreground mb-1">
                  {cat.label}
                </h2>
                <p className="text-xs text-muted leading-relaxed mb-3">
                  {cat.description}
                </p>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="text-emerald-500">{enabled} enabled</span>
                  {pending > 0 && <span className="text-amber-500">{pending} pending</span>}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Other resources */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-foreground">
            Other Resources
          </h2>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
              bg-foreground text-background rounded-md hover:opacity-90 transition-opacity cursor-pointer"
            onClick={() => {
              setEditingResource({
                id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: "", description: "", url: "", source_org: "",
                category: "other", location: "Global",
                min_minutes: 5, ev_general: 0.5, friction: 0.2,
                enabled: true, status: "approved",
                created_at: new Date().toISOString(),
              });
              setIsCreating(true);
            }}
          >
            <span className="text-base leading-none">+</span>
            New
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          {(groups.other || []).map((resource: Resource) => (
            <div
              key={resource.id}
              className={`flex items-center justify-between p-3.5 rounded-lg bg-card
                hover:bg-card-hover transition-colors group
                ${!resource.enabled ? "opacity-40 hover:opacity-70" : ""}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button
                  onClick={() => handleToggle(resource.id, !resource.enabled)}
                  className={`relative w-8 h-[18px] rounded-full shrink-0 transition-colors cursor-pointer
                    ${resource.enabled ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"}`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm
                      transition-[left] duration-200
                      ${resource.enabled ? "left-[16px]" : "left-0.5"}`}
                  />
                </button>

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => { setEditingResource(resource); setIsCreating(false); }}
                >
                  <h3 className="text-sm font-medium text-foreground truncate">
                    {resource.title}
                  </h3>
                  <p className="text-[11px] font-mono text-muted mt-0.5">
                    {resource.source_org} · {resource.location} · {resource.min_minutes} min
                  </p>
                </div>
              </div>

              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground
                    hover:bg-border/50 hover:text-foreground transition-colors text-sm"
                >
                  ↗
                </a>
                <button
                  onClick={() => { setEditingResource(resource); setIsCreating(false); }}
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground
                    hover:bg-border/50 hover:text-foreground transition-colors text-sm cursor-pointer"
                >
                  ✎
                </button>
                <button
                  onClick={() => setDeletingResource(resource)}
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground
                    hover:bg-rose-500/15 hover:text-rose-500 transition-colors text-sm cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          {(groups.other || []).length === 0 && (
            <div className="py-12 text-center text-muted text-sm italic">
              No other resources yet.
            </div>
          )}
        </div>
      </motion.div>

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
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg
              text-sm font-medium z-50 shadow-lg border
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

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Resource, ResourceCategory, ResourceStatus } from "@/types";

interface ResourceEditorProps {
  resource: Resource;
  isNew: boolean;
  onSave: (resource: Resource) => void;
  onDelete?: (id: string) => void;
  onCancel: () => void;
}

const CATEGORY_OPTIONS: ResourceCategory[] = [
  "events", "programs", "letters", "communities", "other",
];

const STATUS_OPTIONS: ResourceStatus[] = ["approved", "pending", "rejected"];

function Tip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 cursor-help">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-border text-[9px] text-muted-foreground font-mono">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-md bg-foreground text-background text-[11px] leading-tight max-w-[200px] whitespace-normal opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
        {text}
      </span>
    </span>
  );
}

export function ResourceEditor({ resource, isNew, onSave, onDelete, onCancel }: ResourceEditorProps) {
  const [form, setForm] = useState<Resource>({ ...resource });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function update<K extends keyof Resource>(key: K, value: Resource[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.url) {
      alert("Title and URL are required.");
      return;
    }
    onSave(form);
  }

  const labelCls = "text-[11px] font-mono text-muted-foreground tracking-wide mb-1 flex items-center";
  const inputCls = "w-full px-2.5 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted focus:border-muted-foreground focus:outline-none transition-colors";
  const monoCls = `${inputCls} font-mono text-xs`;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-12 px-4 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl mb-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">
              {isNew ? "New Resource" : "Edit Resource"}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="w-7 h-7 flex items-center justify-center rounded text-muted hover:bg-border/50 hover:text-foreground transition-colors text-lg cursor-pointer"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-6 max-h-[65vh] overflow-y-auto">
            {/* Core */}
            <section>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3 pb-1 border-b border-border">
                Core
              </h3>
              <label className="block mb-3">
                <span className={labelCls}>Title</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  className={inputCls}
                  placeholder="Sign the AI safety petition"
                  required
                />
              </label>
              <label className="block mb-3">
                <span className={labelCls}>Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  className={`${inputCls} resize-y min-h-[60px]`}
                  rows={2}
                  placeholder="One-liner that sells the action"
                />
              </label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label>
                  <span className={labelCls}>URL</span>
                  <input
                    type="url"
                    value={form.url}
                    onChange={(e) => update("url", e.target.value)}
                    className={monoCls}
                    placeholder="https://..."
                    required
                  />
                </label>
                <label>
                  <span className={labelCls}>Organization</span>
                  <input
                    type="text"
                    value={form.source_org}
                    onChange={(e) => update("source_org", e.target.value)}
                    className={inputCls}
                    placeholder="PauseAI"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className={labelCls}>Location</span>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    className={inputCls}
                    placeholder="Global, New York USA, Online..."
                  />
                </label>
                <label>
                  <span className={labelCls}>Category</span>
                  <select
                    value={form.category}
                    onChange={(e) => update("category", e.target.value as ResourceCategory)}
                    className={inputCls}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {/* Category-specific */}
            {(form.category === "events" || form.category === "programs") && (
              <section>
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3 pb-1 border-b border-border">
                  {form.category === "events" ? "Event Details" : "Program Details"}
                </h3>
                {form.category === "events" && (
                  <label className="block">
                    <span className={labelCls}>Event Date</span>
                    <input
                      type="date"
                      value={form.event_date || ""}
                      onChange={(e) => update("event_date", e.target.value || undefined)}
                      className={monoCls}
                    />
                  </label>
                )}
                {form.category === "programs" && (
                  <label className="block">
                    <span className={labelCls}>
                      Application Deadline
                      <Tip text="If this program has an application deadline, resources with approaching deadlines get boosted in rankings." />
                    </span>
                    <input
                      type="date"
                      value={form.deadline_date || ""}
                      onChange={(e) => update("deadline_date", e.target.value || undefined)}
                      className={monoCls}
                    />
                  </label>
                )}
              </section>
            )}

            {/* Scoring */}
            <section>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3 pb-1 border-b border-border">
                Scoring
                <Tip text="These values determine how the resource ranks in search results. Never shown to the public." />
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label>
                  <span className={labelCls}>
                    Time (min)
                    <Tip text="Estimated minutes to complete this action. Used to match resources to users based on their time budget." />
                  </span>
                  <input
                    type="number"
                    value={form.min_minutes}
                    onChange={(e) => update("min_minutes", parseInt(e.target.value) || 0)}
                    className={monoCls}
                    min={0}
                  />
                </label>
                <label>
                  <span className={labelCls}>
                    Friction
                    <Tip text="0 = one click to do. 1 = major life commitment. Penalizes the resource for casual users but not for committed ones." />
                  </span>
                  <input
                    type="number"
                    value={form.friction}
                    onChange={(e) => update("friction", parseFloat(e.target.value) || 0)}
                    className={monoCls}
                    min={0} max={1} step={0.05}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className={labelCls}>
                    Impact (general)
                    <Tip text="Expected value for a random person. 0 = negligible, 1 = transformative. This is the main ranking signal." />
                  </span>
                  <input
                    type="number"
                    value={form.ev_general}
                    onChange={(e) => update("ev_general", parseFloat(e.target.value) || 0)}
                    className={monoCls}
                    min={0} max={1} step={0.05}
                  />
                </label>
                <label>
                  <span className={labelCls}>
                    Impact (positioned)
                    <Tip text="Expected value for someone who's particularly well-suited — e.g. a policy expert for a policy job. Leave empty if same as general." />
                  </span>
                  <input
                    type="number"
                    value={form.ev_positioned ?? ""}
                    onChange={(e) => update("ev_positioned", e.target.value ? parseFloat(e.target.value) : undefined)}
                    className={monoCls}
                    min={0} max={1} step={0.05}
                  />
                </label>
              </div>
            </section>

            {/* Status */}
            <section>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3 pb-1 border-b border-border">
                Status
              </h3>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => update("enabled", e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-background accent-accent cursor-pointer"
                  />
                  Enabled
                  <Tip text="When enabled, this resource can appear in public listings and search results (if also approved)." />
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="text-[11px] font-mono">Status:</span>
                  <select
                    value={form.status}
                    onChange={(e) => update("status", e.target.value as ResourceStatus)}
                    className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              {form.submitted_by && (
                <p className="mt-2 text-[11px] text-muted font-mono">
                  Submitted by: {form.submitted_by}
                </p>
              )}
            </section>

            {/* Verification — communities only */}
            {form.category === "communities" && (
              <section>
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3 pb-1 border-b border-border">
                  Verification
                  <Tip text="Automated URL checks and activity scoring. You can override the activity score manually — it won't be overwritten by future auto-checks if you set it here." />
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <span className={labelCls}>URL Status</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        form.url_status === "reachable" ? "bg-green-500" :
                        form.url_status === "dead" ? "bg-red-500" :
                        form.url_status === "redirect" ? "bg-yellow-500" :
                        "bg-gray-400"
                      }`} />
                      <span className="text-xs text-foreground font-mono">
                        {form.url_status || "unknown"}
                      </span>
                    </div>
                  </div>
                  <label>
                    <span className={labelCls}>
                      Activity Score
                      <Tip text="0 = dead/fake community, 1 = very active. Higher scores rank higher in listings. Auto-set by verification but you can override." />
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        value={form.activity_score ?? 0.5}
                        onChange={(e) => update("activity_score", parseFloat(e.target.value))}
                        className="flex-1 accent-accent"
                        min={0} max={1} step={0.05}
                      />
                      <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                        {(form.activity_score ?? 0.5).toFixed(2)}
                      </span>
                    </div>
                  </label>
                </div>
                {form.verification_notes && (
                  <p className="text-[10px] text-muted font-mono leading-relaxed">
                    {form.verification_notes}
                  </p>
                )}
                {form.verified_at && (
                  <p className="text-[10px] text-muted font-mono mt-1">
                    Last checked: {new Date(form.verified_at).toLocaleDateString()}
                  </p>
                )}
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 py-4 border-t border-border">
            <div>
              {!isNew && onDelete && (
                showDeleteConfirm ? (
                  <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                     <span className="text-[11px] font-mono text-muted-foreground ml-1">Delete permanently?</span>
                     <button type="button" onClick={() => onDelete(resource.id)} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 rounded cursor-pointer">Yes</button>
                     <button type="button" onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted border border-border rounded cursor-pointer">Cancel</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 text-xs font-medium text-red-500 border border-red-500/20 rounded-md hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                )
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:border-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-90 transition-opacity cursor-pointer"
              >
                {isNew ? "Create" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

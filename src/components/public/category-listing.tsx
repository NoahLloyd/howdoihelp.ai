"use client";

import { useState } from "react";
import type { Resource, ResourceCategory } from "@/types";
import type { CategoryMeta } from "@/lib/categories";
import { SubmitForm } from "./submit-form";

interface CategoryListingProps {
  category: CategoryMeta;
  resources: Resource[];
}

export function CategoryListing({ category, resources }: CategoryListingProps) {
  const [search, setSearch] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);

  const filtered = resources.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.source_org.toLowerCase().includes(q) ||
      r.location.toLowerCase().includes(q)
    );
  });

  // Events: sort by date (upcoming first), then by title
  const sorted =
    category.id === "events"
      ? [...filtered].sort((a, b) => {
          if (a.event_date && b.event_date) return a.event_date.localeCompare(b.event_date);
          if (a.event_date) return -1;
          if (b.event_date) return 1;
          return a.title.localeCompare(b.title);
        })
      : filtered;

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{category.icon}</span>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              {category.label}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">{category.description}</p>
        </header>

        {/* Search + submit */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${category.label.toLowerCase()}...`}
              className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-sm cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={() => setShowSubmit(true)}
            className="px-4 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors shrink-0 cursor-pointer"
          >
            Submit {category.singular}
          </button>
        </div>

        {/* Count */}
        <p className="text-xs text-muted font-mono mb-4">
          {sorted.length} {sorted.length === 1 ? "result" : "results"}
          {search && ` for "${search}"`}
        </p>

        {/* List */}
        <div className="space-y-2">
          {sorted.map((resource) => (
            <a
              key={resource.id}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded-lg bg-card border border-border hover:border-accent/30 hover:bg-card-hover transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                    {resource.title}
                  </h3>
                  {resource.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {resource.description}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted font-mono">
                    {resource.source_org && <span>{resource.source_org}</span>}
                    {resource.location && resource.location !== "Global" && (
                      <>
                        {resource.source_org && <span className="text-border">·</span>}
                        <span>📍 {resource.location}</span>
                      </>
                    )}
                    {resource.deadline_date ? (
                      <>
                        <span className="text-border">·</span>
                        <span>
                          Deadline:{" "}
                          {new Date(resource.deadline_date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </>
                    ) : resource.event_date ? (
                      <>
                        <span className="text-border">·</span>
                        <span>
                          📅{" "}
                          {new Date(resource.event_date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <span className="text-muted group-hover:text-accent transition-colors text-sm shrink-0 mt-0.5">
                  ↗
                </span>
              </div>
            </a>
          ))}

          {sorted.length === 0 && (
            <div className="py-16 text-center text-muted text-sm">
              {search
                ? `No ${category.label.toLowerCase()} match "${search}".`
                : `No ${category.label.toLowerCase()} yet. Be the first to submit one!`}
            </div>
          )}
        </div>
      </div>

      {/* Submit overlay */}
      {showSubmit && (
        <SubmitForm
          category={category}
          onClose={() => setShowSubmit(false)}
        />
      )}
    </div>
  );
}

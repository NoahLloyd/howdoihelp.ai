"use client";

import { ScoredResource, Variant } from "@/types";
import { trackUrl, formatTime } from "@/lib/utils";

interface ResourceCardProps {
  scored: ScoredResource;
  variant: Variant;
  isPrimary?: boolean;
  customTitle?: string;
  customDescription?: string;
  onClickTrack?: (resourceId: string) => void;
}

export function ResourceCard({
  scored,
  variant,
  isPrimary = false,
  customTitle,
  customDescription,
  onClickTrack,
}: ResourceCardProps) {
  const { resource } = scored;
  const url = trackUrl(resource.url, variant, resource.id);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onClickTrack?.(resource.id)}
      className={`block w-full rounded-xl border text-left transition-all ${
        isPrimary
          ? "border-accent/40 bg-accent/5 p-5 hover:border-accent/70 hover:bg-accent/10"
          : "border-border bg-card p-4 hover:border-accent/30 hover:bg-card-hover"
      }`}
    >
      {/* Title */}
      <h3
        className={`font-semibold tracking-tight ${
          isPrimary ? "text-xl" : "text-base"
        }`}
      >
        {customTitle || resource.title}
      </h3>

      {/* Description */}
      <p
        className={`mt-1 text-muted-foreground ${
          isPrimary ? "text-base leading-relaxed" : "text-sm"
        }`}
      >
        {customDescription || resource.description}
      </p>

      {/* Event date + location */}
      {(resource.event_date || (resource.location && resource.location !== "Global" && resource.location !== "Online")) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {resource.event_date && (
            <span className="font-medium">
              {new Date(resource.event_date).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </span>
          )}
          {resource.location && resource.location !== "Global" && resource.location !== "Online" && (
            <span>{resource.location}</span>
          )}
        </div>
      )}

      {/* Deadline */}
      {resource.deadline_date && (
        <div className="mt-2">
          <span className="text-xs font-medium text-amber-500">
            Deadline:{" "}
            {new Date(resource.deadline_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      )}

      {/* Footer: source + time */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>via {resource.source_org}</span>
        <span>{formatTime(resource.min_minutes)}</span>
      </div>
    </a>
  );
}
